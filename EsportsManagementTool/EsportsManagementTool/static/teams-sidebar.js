/**
 * teams-sidebar.js
 * ============================================================================
 * TEAMS SIDEBAR MANAGEMENT
 * ORGANIZED BY CLAUDEAI
 * ============================================================================
 * Handles all sidebar-related functionality:
 * - View switching (All Teams, Teams I Manage, Teams I Play On)
 * - Division filtering
 * - Team list rendering and filtering
 * - Game grouping with collapsible tree folders
 * - Team selection from sidebar
 * - Sidebar state management
 * ============================================================================
 */

// ============================================
// GLOBAL STATE (SHARED WITH teams.js)
// ============================================

/**
 * Cache for teams data by view
 */
const teamsCache = {
    all: null,
    manage: null,
    play: null,
    division: {},
    my_past_teams: null,
    past_managed: null,
    past_seasons: {},
    timestamps: {}
};

const CACHE_DURATION = 30000; // 30 seconds

/**
 * Check if cached data is still fresh
 */
function isCacheFresh(cacheKey) {
    const timestamp = teamsCache.timestamps[cacheKey];
    if (!timestamp) return false;
    return (Date.now() - timestamp) < CACHE_DURATION;
}

/**
 * Currently selected team ID
 * @type {string|null}
 */
window.currentSelectedTeamId = null;

/**
 * All teams data from current view
 * @type {Array}
 */
window.allTeamsData = [];

/**
 * Past season filter storage key
 */
const PAST_SEASON_FILTER_KEY = 'teams_selected_past_season';

/**
 * Past season filtering state
 */
const PastSeasonTeamsFilterState = {
    selectedSeasonId: null,
    selectedSeasonName: '',
    availablePastSeasons: [],
    isFilteringPastSeason: false
};

/**
 * Base label text (without the trailing count) for the currently
 * selected view. Used by updateDropdownCount() to append "(N)"
 * without needing to re-derive the label from the DOM each time.
 */
let _currentViewBaseLabel = 'All';

/**
 * Available views for current user based on permissions
 * @type {Array<Object>}
 */
window.availableViews = [];

/**
 * Current active view
 * @type {string|null}
 */
window.currentView = null;

/**
 * Session storage key for view persistence
 */
const VIEW_STORAGE_KEY = 'teams_selected_view';

/**
 * Storage key for expanded games
 */
const COLLAPSED_GAMES_KEY = 'teams_expanded_games';

/**
 * Division filter storage key
 */
const DIVISION_FILTER_KEY = 'teams_selected_division';

/**
 * Division order configuration
 */
const DIVISION_ORDER = ['Strategy', 'Shooter', 'Sports', 'Other'];

// ============================================
// VIEW SWITCHER INITIALIZATION
// ============================================

async function initializeViewSwitcher() {
    try {
        const response = await fetch('/api/teams/sidebar-filters');
        const data = await response.json();

        if (data.success && data.views && data.views.length > 0) {
            window.availableViews = data.views;

            const storedView = sessionStorage.getItem(VIEW_STORAGE_KEY);
            const validStoredView = window.availableViews.find(v => v.value === storedView);
            window.currentView = validStoredView ? storedView : window.availableViews[0].value;

            renderViewSwitcher();
        } else {
            // Mark as initialised (even if empty) so loadTeams does not loop
            window.availableViews = ['__none__'];
            window.currentView = window.currentView || 'all';
            hideViewSwitcher();
        }
    } catch (error) {
        console.error('Error initializing view switcher:', error);
        // Mark as initialised so loadTeams does not loop on repeated calls
        window.availableViews = ['__none__'];
        window.currentView = window.currentView || 'all';
        hideViewSwitcher();
    }
}

function renderViewSwitcher() {
    const viewSwitcher = document.getElementById('teamViewSwitcher');
    if (!viewSwitcher) {
        console.error('View switcher element not found');
        return;
    }

    const isAdmin = window.userPermissions?.is_admin || window.userPermissions?.is_developer || false;
    const savedDivision = getSelectedDivisionFilter();
    const savedSeasonId = getSelectedPastSeasonFilter();

    const viewItemsHtml = window.availableViews.map(view => `
        <div class="filter-box-item ${view.value === window.currentView ? 'active' : ''}"
             data-value="${view.value}"
             data-base-label="${view.label.replace(/"/g, '&quot;')}"
             onclick="applyTeamsViewFilter('${view.value}', '${view.label.replace(/'/g, "\\'")}')">
            ${view.label}
        </div>
    `).join('');

    const adminItemsHtml = isAdmin ? `
        <div class="filter-box-item filter-box-item--flyout" id="divisionsFlyoutTrigger">
            Divisions
            <i class="fas fa-chevron-right"></i>
            <div class="filter-box-flyout" id="divisionsFlyout">
                ${DIVISION_ORDER.map(division => `
                    <div class="filter-box-flyout-item ${window.currentView === 'division' && savedDivision === division ? 'active' : ''}"
                         onclick="applyTeamsDivisionFilter('${division}')">
                        ${division}
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="filter-box-item filter-box-item--flyout" id="pastSeasonsTeamsFlyoutTrigger">
            Past Seasons
            <i class="fas fa-chevron-right"></i>
            <div class="filter-box-flyout" id="pastSeasonsTeamsFlyout">
                <div class="filter-box-flyout-loading">Loading&hellip;</div>
            </div>
        </div>
    ` : '';

    // Initial button label reflects whichever view is currently active
    let initialLabel = 'All';
    if (window.currentView === 'division') {
        initialLabel = savedDivision ? `Division: ${savedDivision}` : 'Divisions';
    } else if (window.currentView === 'past_seasons') {
        initialLabel = 'Past Seasons'; // resolved to a real season name below, once loaded
    } else {
        const matchedView = window.availableViews.find(v => v.value === window.currentView);
        if (matchedView) initialLabel = matchedView.label;
    }
    _currentViewBaseLabel = initialLabel;

    viewSwitcher.innerHTML = `
        <div class="filter-box" id="teamsViewFilterBox">
            <button type="button" class="filter-box-btn" onclick="toggleFilterBox('teamsViewFilterPanel')">
                <span id="teamsViewFilterLabel">${initialLabel}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="filter-box-panel" id="teamsViewFilterPanel">
                ${viewItemsHtml}
                ${adminItemsHtml}
            </div>
        </div>
    `;

    viewSwitcher.classList.remove('hidden');

    // Wire up hover-position/mobile-tap behavior for the flyouts just created
    initFlyoutTriggers(viewSwitcher);

    if (isAdmin) {
        // Lazy-load past seasons on hover, same pattern as Events' game flyout
        const trigger = document.getElementById('pastSeasonsTeamsFlyoutTrigger');
        let loaded = false;
        trigger.addEventListener('mouseenter', () => {
            if (loaded) return;
            loaded = true;
            loadPastSeasonsForTeamsFilter();
        });

        // Resolve the saved season's name up front if this view was active
        // on a previous visit, so the button doesn't just say "Past Seasons"
        if (window.currentView === 'past_seasons' && savedSeasonId) {
            loadPastSeasonsForTeamsFilter();
        }
    }
}

function hideViewSwitcher() {
    const viewSwitcher = document.getElementById('teamViewSwitcher');
    if (viewSwitcher) viewSwitcher.classList.add('hidden');
}

// Resets the team filter count when a new dropdown option is chosen.
function resetTeamsViewItemLabels() {
    document.querySelectorAll(
        '#teamsViewFilterPanel > .filter-box-item[data-base-label], #pastSeasonsTeamsFlyout .filter-box-flyout-item[data-base-label]'
    ).forEach(item => {
        item.textContent = item.getAttribute('data-base-label');
    });
}

/**
 * Selection handler for a plain (non-flyout) view item.
 * Opening/closing the panel is handled by the shared toggleFilterBox()/
 * closeAllFilterPanels() in universal-helpers.js.
 */
function applyTeamsViewFilter(value, label) {
    resetTeamsViewItemLabels();
    document.getElementById('teamsViewFilterLabel').textContent = label;
    _currentViewBaseLabel = label;

    document.querySelectorAll('#teamsViewFilterPanel > .filter-box-item:not(.filter-box-item--flyout)').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-value') === value);
    });
    document.querySelectorAll('#divisionsFlyout .filter-box-flyout-item, #pastSeasonsTeamsFlyout .filter-box-flyout-item')
        .forEach(item => item.classList.remove('active'));

    closeAllFilterPanels();
    handleViewChange(value);
}

/**
 * Selection handler for a division flyout item.
 */
function applyTeamsDivisionFilter(division) {
    resetTeamsViewItemLabels();
    const label = `Division: ${division}`;
    document.getElementById('teamsViewFilterLabel').textContent = label;
    _currentViewBaseLabel = label;

    document.querySelectorAll('#teamsViewFilterPanel > .filter-box-item:not(.filter-box-item--flyout)').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('#divisionsFlyout .filter-box-flyout-item').forEach(item => {
        item.classList.toggle('active', item.textContent.trim() === division);
    });
    document.querySelectorAll('#pastSeasonsTeamsFlyout .filter-box-flyout-item').forEach(item => item.classList.remove('active'));

    closeAllFilterPanels();

    window.currentView = 'division';
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'division');
    setSelectedDivisionFilter(division);

    PastSeasonTeamsFilterState.selectedSeasonId = null;
    PastSeasonTeamsFilterState.selectedSeasonName = '';
    PastSeasonTeamsFilterState.isFilteringPastSeason = false;
    setSelectedPastSeasonFilter(null);

    invalidateTeamsCache();

    window.currentSelectedTeamId = null;
    document.getElementById('teamsWelcomeState').style.display = 'flex';
    document.getElementById('teamsDetailContent').style.display = 'none';

    loadTeams();
}

/**
 * Core view-change logic, shared by applyTeamsViewFilter(). Kept
 * separate since it used to be the <select> onchange handler directly;
 * now it just takes the new view value as a plain argument.
 */
function handleViewChange(newView) {
    if (newView !== window.currentView) {
        window.currentView = newView;
        sessionStorage.setItem(VIEW_STORAGE_KEY, newView);

        setSelectedDivisionFilter(null);

        PastSeasonTeamsFilterState.selectedSeasonId = null;
        PastSeasonTeamsFilterState.selectedSeasonName = '';
        PastSeasonTeamsFilterState.isFilteringPastSeason = false;
        setSelectedPastSeasonFilter(null);

        invalidateTeamsCache();

        window.currentSelectedTeamId = null;
        document.getElementById('teamsWelcomeState').style.display = 'flex';
        document.getElementById('teamsDetailContent').style.display = 'none';

        loadTeams();
    }
}

// ============================================
// TEAM LOADING & SIDEBAR
// ============================================

async function loadTeams() {
    const sidebarLoading = document.getElementById('teamsSidebarLoading');
    const sidebarList = document.getElementById('teamsSidebarList');
    const sidebarEmpty = document.getElementById('teamsSidebarEmpty');

    // Initialise view switcher if not yet done (sentinel '__none__' means already tried)
    if (window.availableViews.length === 0) {
        await initializeViewSwitcher();
    }

    // Bail out if currentView is still null (init failed and no fallback possible)
    if (!window.currentView) {
        console.error('loadTeams: currentView is null after initializeViewSwitcher, aborting');
        if (sidebarLoading) sidebarLoading.style.display = 'none';
        if (sidebarEmpty) {
            sidebarEmpty.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>Could not load teams. Please refresh.</p>';
            sidebarEmpty.style.display = 'block';
        }
        return;
    }

    const selectedDivision = window.currentView === 'division' ? getSelectedDivisionFilter() : null;
    const selectedSeasonId = window.currentView === 'past_seasons' ? PastSeasonTeamsFilterState.selectedSeasonId : null;

    let cacheKey = window.currentView || 'all';
    if (selectedDivision) {
        cacheKey = `division-${selectedDivision}`;
    } else if (selectedSeasonId) {
        cacheKey = `past_season-${selectedSeasonId}`;
    }

    if (window.currentView === 'past_seasons' && !selectedSeasonId) {
        sidebarLoading.style.display = 'none';
        sidebarList.style.display = 'none';
        sidebarEmpty.style.display = 'block';
        updateDropdownCount(0);
        if (sidebarEmpty) {
            sidebarEmpty.innerHTML = `<i class="fas fa-calendar"></i><p>Select a past season to view teams</p>`;
        }
        return;
    }

    if (teamsCache[cacheKey] && isCacheFresh(cacheKey)) {
        console.log('Using cached teams data');
        renderFromCache(teamsCache[cacheKey], sidebarLoading, sidebarList, sidebarEmpty);
        return;
    }

    sidebarLoading.style.display = 'block';
    sidebarList.style.display = 'none';
    sidebarEmpty.style.display = 'none';

    try {
        let url = `/api/teams/sidebar?view=${window.currentView}`;
        if (selectedSeasonId) url += `&season_id=${selectedSeasonId}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.success && data.teams && data.teams.length > 0) {
            let teamsToDisplay = data.teams;

            if (window.currentView === 'division') {
                const selectedDivision = getSelectedDivisionFilter();
                if (selectedDivision) {
                    teamsToDisplay = data.teams.filter(team =>
                        (team.division || 'Other') === selectedDivision
                    );
                }
            }

            teamsCache[cacheKey] = teamsToDisplay;
            teamsCache.timestamps[cacheKey] = Date.now();
            window.allTeamsData = teamsToDisplay;

            updateDropdownCount(teamsToDisplay.length);
            updateSidebarSubtitle(teamsToDisplay.length);

            if (teamsToDisplay.length > 0) {
                renderTeamsSidebar(teamsToDisplay);
                sidebarLoading.style.display = 'none';
                sidebarList.style.display = 'flex';
            } else {
                updateDropdownCount(0);
                if (sidebarEmpty) {
                    sidebarEmpty.innerHTML = `<i class="fas fa-users"></i><p>${getEmptyMessageForView(window.currentView)}</p>`;
                }
                sidebarLoading.style.display = 'none';
                sidebarEmpty.style.display = 'block';
            }
        } else {
            updateDropdownCount(0);
            updateSidebarSubtitle(0);
            if (sidebarEmpty) {
                sidebarEmpty.innerHTML = `<i class="fas fa-users"></i><p>${getEmptyMessageForView(window.currentView)}</p>`;
            }
            sidebarLoading.style.display = 'none';
            sidebarEmpty.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading teams:', error);
        sidebarLoading.style.display = 'none';
        sidebarEmpty.style.display = 'block';
    }
}

function renderFromCache(cachedTeams, sidebarLoading, sidebarList, sidebarEmpty) {
    window.allTeamsData = cachedTeams;
    updateDropdownCount(cachedTeams.length);
    updateSidebarSubtitle(cachedTeams.length);

    if (cachedTeams.length > 0) {
        renderTeamsSidebar(cachedTeams);
        sidebarLoading.style.display = 'none';
        sidebarList.style.display = 'flex';
    } else {
        updateDropdownCount(0);
        if (sidebarEmpty) {
            sidebarEmpty.innerHTML = `<i class="fas fa-users"></i><p>${getEmptyMessageForView(window.currentView)}</p>`;
        }
        sidebarLoading.style.display = 'none';
        sidebarEmpty.style.display = 'block';
    }
}

function invalidateTeamsCache() {
    teamsCache.all = null;
    teamsCache.manage = null;
    teamsCache.play = null;
    teamsCache.division = {};
    teamsCache.my_past_teams = null;
    teamsCache.past_managed = null;
    teamsCache.past_seasons = {};
    teamsCache.timestamps = {};
    console.log('Teams cache invalidated');
}

/**
 * Update the "All Games · N" subtitle in the sidebar header
 */
function updateSidebarSubtitle(count) {
    const subtitle = document.querySelector('.teams-subtitle');
    if (!subtitle) return;

    const view = window.currentView;
    let label = 'All Games';

    if (view === 'manage' || view === 'past_managed') {
        label = 'Managed Games';
    } else if (view === 'play' || view === 'my_past_teams') {
        label = 'My Games';
    } else if (view === 'division') {
        const d = getSelectedDivisionFilter();
        label = d ? `${d} Division` : 'All Divisions';
    } else if (view === 'past_seasons') {
        const name = PastSeasonTeamsFilterState.selectedSeasonName;
        label = name ? name : 'Past Seasons';
    }

    subtitle.textContent = `${label} · ${count}`;
}

function getSubtitleForView(view, count = 0) {
    let label = '';
    if (view === 'division') {
        const selectedDivision = getSelectedDivisionFilter();
        label = selectedDivision ? `${selectedDivision} Teams` : 'All Teams';
    } else if (view === 'past_seasons') {
        const seasonName = PastSeasonTeamsFilterState.selectedSeasonName;
        label = seasonName ? `${seasonName} Teams` : 'Past Seasons';
    } else {
        const viewObj = window.availableViews.find(v => v.value === view);
        if (viewObj) {
            label = viewObj.label;
        } else {
            const isAdmin = window.userPermissions?.is_admin || window.userPermissions?.is_developer || false;
            const isGM = window.userPermissions?.is_gm || false;
            label = isAdmin ? 'All Teams' : isGM ? 'Teams I Manage' : 'Your Teams';
        }
    }
    return `${label} (${count})`;
}

function getEmptyMessageForView(view) {
    const messages = {
        all: 'No teams have been created yet.',
        manage: 'You are not managing any teams yet.',
        play: 'You are not a member of any teams yet.',
        my_past_teams: 'You have not played on any past teams.',
        past_managed: 'You have not managed any past teams.',
        past_seasons: 'No teams found for the selected season.'
    };
    return messages[view] || 'No teams available.';
}

// ============================================
// TREE-STYLE SIDEBAR RENDERING
// ============================================

/**
 * Main render entry point — delegates to tree or flat based on view
 */
function renderTeamsSidebar(teams) {
    if (
        window.currentView === 'all' ||
        window.currentView === 'division' ||
        window.currentView === 'past_seasons'
    ) {
        renderTeamsSidebarWithGroups(teams);
    } else {
        renderTeamsSidebarFlat(teams);
    }
}

/**
 * Render teams in a flat list (for manage / play / my_past_teams / past_managed views)
 */
function renderTeamsSidebarFlat(teams) {
    const sidebarList = document.getElementById('teamsSidebarList');
    sidebarList.innerHTML = '';

    const sidebar = document.querySelector('.teams-sidebar');
    if (sidebar) sidebar.setAttribute('data-view', window.currentView || 'all');

    const sorted = sortTeamsByDivision(teams);

    sorted.forEach(team => {
        const item = createTeamTreeItem(team);
        sidebarList.appendChild(item);
    });
}

/**
 * Render teams grouped by game in tree/folder style
 */
function renderTeamsSidebarWithGroups(teams) {
    const sidebarList = document.getElementById('teamsSidebarList');
    sidebarList.innerHTML = '';

    const sidebar = document.querySelector('.teams-sidebar');
    if (sidebar) sidebar.setAttribute('data-view', window.currentView || 'all');

    const sorted = sortTeamsByDivision(teams);

    // Build game groups
    const gameGroups = {};
    sorted.forEach(team => {
        const gameId = team.gameID;
        if (!gameGroups[gameId]) {
            gameGroups[gameId] = {
                gameId,
                gameTitle:    team.GameTitle || 'Unknown Game',
                division:     team.division || 'Other',
                hasGameImage: team.has_game_image,
                teams:        []
            };
        }
        gameGroups[gameId].teams.push(team);
    });

    // Sort groups by division then name
    const sortedGroups = Object.values(gameGroups).sort((a, b) => {
        const pa = getDivisionSortPriority(a.division);
        const pb = getDivisionSortPriority(b.division);
        if (pa !== pb) return pa - pb;
        return a.gameTitle.localeCompare(b.gameTitle);
    });

    const expandedGames = getCollapsedGames(); // set of expanded game IDs

    sortedGroups.forEach(group => {
        const isExpanded = expandedGames.has(group.gameId.toString());
        const groupEl = renderGameGroup(group, isExpanded);
        sidebarList.appendChild(groupEl);
    });
}

/**
 * Build a full game group element (folder row + team list)
 */
function renderGameGroup(group, isExpanded) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'game-group' + (isExpanded ? ' expanded' : '');
    groupDiv.setAttribute('data-game-id', group.gameId);

    // ---- Game folder row ----
    const folderRow = document.createElement('div');
    folderRow.className = 'game-folder-row';

    // Icon
    const iconEl = document.createElement('div');
    iconEl.className = 'game-folder-icon';

    if (group.gameId && group.hasGameImage) {
        const img = document.createElement('img');
        img.src = `/game-image/${group.gameId}`;
        img.alt = group.gameTitle;
        img.loading = 'lazy';

        const fallback = document.createElement('div');
        fallback.className = 'icon-fallback';
        fallback.innerHTML = '<i class="fas fa-gamepad"></i>';
        fallback.style.display = 'none';

        img.onerror = function () {
            this.style.display = 'none';
            fallback.style.display = 'flex';
        };

        iconEl.appendChild(img);
        iconEl.appendChild(fallback);
    } else {
        const fallback = document.createElement('div');
        fallback.className = 'icon-fallback';
        fallback.innerHTML = '<i class="fas fa-gamepad"></i>';
        iconEl.appendChild(fallback);
    }

    // Game name
    const nameEl = document.createElement('span');
    nameEl.className = 'game-folder-name';
    nameEl.textContent = group.gameTitle;

    // Badge (team count)
    const badgeEl = document.createElement('span');
    badgeEl.className = 'game-folder-badge';
    badgeEl.textContent = group.teams.length;

    // Chevron
    const chevronEl = document.createElement('i');
    chevronEl.className = 'game-folder-chevron fas fa-chevron-down';

    folderRow.appendChild(iconEl);
    folderRow.appendChild(nameEl);
    folderRow.appendChild(badgeEl);
    folderRow.appendChild(chevronEl);

    // Click toggles expand/collapse
    folderRow.addEventListener('click', () => toggleGameCollapse(group.gameId));

    // ---- Teams list ----
    const teamsList = document.createElement('div');
    teamsList.className = 'game-teams-list';

    group.teams.forEach(team => {
        const item = createTeamTreeItem(team);
        teamsList.appendChild(item);
    });

    groupDiv.appendChild(folderRow);
    groupDiv.appendChild(teamsList);

    return groupDiv;
}

/**
 * Create a single team tree item.
 * Carries .team-sidebar-item so teams.js querySelector calls still work.
 */
function createTeamTreeItem(team) {
    const item = document.createElement('div');
    // Keep legacy class so teams.js selectTeam/querySelector still finds items
    item.className = 'team-tree-item team-sidebar-item';
    item.setAttribute('data-team-id', team.TeamID);
    item.setAttribute('data-gm-id', team.gm_id || '');

    if (String(team.TeamID) === String(window.currentSelectedTeamId)) {
        item.classList.add('active');
    }

    const isGameManager = team.gm_id && String(team.gm_id) === String(window.currentUserId);

    // Season indicator for past teams
    const seasonText = (team.season_name && team.season_is_active === 0)
        ? ' · ' + team.season_name
        : '';

    // Wrap in .team-sidebar-content so any teams.js inner queries work
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'team-sidebar-content team-tree-content';

    const nameEl = document.createElement('span');
    nameEl.className = 'team-tree-name';
    nameEl.textContent = team.teamName + seasonText;

    contentWrapper.appendChild(nameEl);
    item.appendChild(contentWrapper);

    // Edit button — only for GMs on active seasons
    if (isGameManager && team.season_is_active !== 0) {
        const editBtn = document.createElement('button');
        editBtn.className = 'team-tree-edit-btn';
        editBtn.title = 'Edit team';
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.addEventListener('click', e => {
            e.stopPropagation();
            openEditTeamModal(
                team.TeamID,
                team.teamName,
                team.teamMaxSize,
                team.TeamSizes || ''
            );
        });
        item.appendChild(editBtn);
    }

    // Select team on click (on item or content wrapper)
    item.addEventListener('click', () => selectTeam(team.TeamID));

    return item;
}

// ============================================
// COLLAPSE / EXPAND STATE
// ============================================

/**
 * Get set of expanded game IDs from sessionStorage
 */
function getCollapsedGames() {
    const storageKey = `${COLLAPSED_GAMES_KEY}_${window.currentView || 'all'}`;
    const stored = sessionStorage.getItem(storageKey);
    return stored ? new Set(JSON.parse(stored)) : new Set();
}

function saveCollapsedGames(expandedGames) {
    const storageKey = `${COLLAPSED_GAMES_KEY}_${window.currentView || 'all'}`;
    sessionStorage.setItem(storageKey, JSON.stringify([...expandedGames]));
}

/**
 * Toggle collapse/expand for a game group in the DOM (no full re-render)
 */
function toggleGameCollapse(gameId) {
    const expandedGames = getCollapsedGames();
    const key = gameId.toString();

    if (expandedGames.has(key)) {
        expandedGames.delete(key);
    } else {
        expandedGames.add(key);
    }

    saveCollapsedGames(expandedGames);

    // Toggle the .expanded class directly on the DOM element
    const groupEl = document.querySelector(`.game-group[data-game-id="${gameId}"]`);
    if (groupEl) {
        groupEl.classList.toggle('expanded', expandedGames.has(key));
    }
}

// ============================================
// ACTIVE TEAM HIGHLIGHT
// ============================================

/**
 * Update active state on sidebar items without re-rendering.
 * Covers both new tree items and any legacy .team-sidebar-item elements
 * that teams.js may also query.
 */
function updateSidebarActiveState(teamId) {
    const id = String(teamId);
    document.querySelectorAll(
        '.team-tree-item, .team-sidebar-item'
    ).forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-team-id') === id);
    });
}

// ============================================
// DIVISION & SORT HELPERS
// ============================================

function getDivisionSortPriority(division) {
    const index = DIVISION_ORDER.indexOf(division);
    return index !== -1 ? index : 999;
}

function sortTeamsByDivision(teams) {
    return [...teams].sort((a, b) => {
        const divA = getDivisionSortPriority(a.division || 'Other');
        const divB = getDivisionSortPriority(b.division || 'Other');
        if (divA !== divB) return divA - divB;

        const gameA = (a.GameTitle || '').toLowerCase();
        const gameB = (b.GameTitle || '').toLowerCase();
        if (gameA !== gameB) return gameA.localeCompare(gameB);

        if (a.created_at && b.created_at) return new Date(a.created_at) - new Date(b.created_at);
        return 0;
    });
}

// ============================================
// DROPDOWN COUNT
// ============================================
function updateDropdownCount(count) {
    const filterLabel = document.getElementById('teamsViewFilterLabel');
    if (filterLabel) filterLabel.textContent = `${_currentViewBaseLabel} (${count})`;

    // Keep the matching panel item in sync
    const item = document.querySelector(`#teamsViewFilterPanel > .filter-box-item[data-value="${window.currentView}"]`);
    if (item) item.textContent = `${_currentViewBaseLabel} (${count})`;

    // Show count on past season flyout
    if (window.currentView === 'past_seasons' && PastSeasonTeamsFilterState.selectedSeasonId) {
        const flyoutItem = document.querySelector(
            `#pastSeasonsTeamsFlyout .filter-box-flyout-item[data-season-id="${PastSeasonTeamsFilterState.selectedSeasonId}"]`
        );
        if (flyoutItem) {
            const baseLabel = flyoutItem.getAttribute('data-base-label') || PastSeasonTeamsFilterState.selectedSeasonName;
            flyoutItem.textContent = `${baseLabel} (${count})`;
        }
    }
}

// ============================================
// PAST SEASON FILTER
// ============================================
function getSelectedPastSeasonFilter() {
    return sessionStorage.getItem(PAST_SEASON_FILTER_KEY);
}

function setSelectedPastSeasonFilter(seasonId) {
    if (seasonId) {
        sessionStorage.setItem(PAST_SEASON_FILTER_KEY, seasonId);
    } else {
        sessionStorage.removeItem(PAST_SEASON_FILTER_KEY);
    }
}

async function loadPastSeasonsForTeamsFilter() {
    const flyout = document.getElementById('pastSeasonsTeamsFlyout');
    if (!flyout) return;

    try {
        const response = await fetch('/api/seasons/past');
        const data = await response.json();

        if (!data.success || !data.seasons) {
            flyout.innerHTML = '<div class="filter-box-flyout-loading">Error loading past seasons</div>';
            return;
        }

        PastSeasonTeamsFilterState.availablePastSeasons = data.seasons;

        if (data.seasons.length === 0) {
            flyout.innerHTML = '<div class="filter-box-flyout-loading">No past seasons available</div>';
            return;
        }

        const savedSeasonId = getSelectedPastSeasonFilter();

        flyout.innerHTML = data.seasons.map(season => `
            <div class="filter-box-flyout-item ${String(season.season_id) === savedSeasonId ? 'active' : ''}"
                 data-season-id="${season.season_id}"
                 data-base-label="${season.season_name.replace(/"/g, '&quot;')}"
                 onclick="applyTeamsPastSeasonFilter('${season.season_id}', '${season.season_name.replace(/'/g, "\\'")}')">
                ${season.season_name}
            </div>
        `).join('');

        // Restore the button label if this view was active on a previous visit
        if (window.currentView === 'past_seasons' && savedSeasonId) {
            const match = data.seasons.find(s => String(s.season_id) === savedSeasonId);
            if (match) {
                PastSeasonTeamsFilterState.selectedSeasonId = match.season_id;
                PastSeasonTeamsFilterState.selectedSeasonName = match.season_name;
                const label = `Past Season: ${match.season_name}`;
                _currentViewBaseLabel = label;
                const filterLabel = document.getElementById('teamsViewFilterLabel');
                if (filterLabel) filterLabel.textContent = label;
            }
        }
    } catch (error) {
        console.error('Error fetching past seasons:', error);
        flyout.innerHTML = '<div class="filter-box-flyout-loading">Failed to load</div>';
    }
}

/**
 * Selection handler for a past-season flyout item.
 */
function applyTeamsPastSeasonFilter(seasonId, seasonName) {
    resetTeamsViewItemLabels();
    const label = `Past Season: ${seasonName}`;
    document.getElementById('teamsViewFilterLabel').textContent = label;
    _currentViewBaseLabel = label;

    document.querySelectorAll('#teamsViewFilterPanel > .filter-box-item:not(.filter-box-item--flyout)').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('#divisionsFlyout .filter-box-flyout-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('#pastSeasonsTeamsFlyout .filter-box-flyout-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-season-id') === String(seasonId));
    });

    closeAllFilterPanels();

    window.currentView = 'past_seasons';
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'past_seasons');
    setSelectedDivisionFilter(null);

    PastSeasonTeamsFilterState.isFilteringPastSeason = true;
    PastSeasonTeamsFilterState.selectedSeasonId = seasonId;
    PastSeasonTeamsFilterState.selectedSeasonName = seasonName;
    setSelectedPastSeasonFilter(seasonId);

    invalidateTeamsCache();

    window.currentSelectedTeamId = null;
    document.getElementById('teamsWelcomeState').style.display = 'flex';
    document.getElementById('teamsDetailContent').style.display = 'none';

    loadTeams();
}

// ============================================
// DIVISION FILTER
// ============================================

function getSelectedDivisionFilter() {
    return sessionStorage.getItem(DIVISION_FILTER_KEY);
}

function setSelectedDivisionFilter(division) {
    if (division) {
        sessionStorage.setItem(DIVISION_FILTER_KEY, division);
    } else {
        sessionStorage.removeItem(DIVISION_FILTER_KEY);
    }
}

// ============================================
// CREATE TEAM FLOW
// ============================================

async function openCreateTeam() {
    try {
        const seasonResponse = await fetch('/api/seasons/current');
        const seasonData = await seasonResponse.json();

        const gamesResponse = await fetch('/api/teams/managed-games');
        const gamesData = await gamesResponse.json();

        if (!gamesData.success || !gamesData.games || gamesData.games.length === 0) {
            alert('You are not assigned as Game Manager for any games.');
            return;
        }

        if (gamesData.games.length === 1) {
            const game = gamesData.games[0];
            openCreateTeamModal(game.GameID, game.GameTitle, game.TeamSizes);
        } else {
            openGamePickerModal(gamesData.games);
        }
    } catch (error) {
        console.error('Error opening create team flow:', error);
        alert('Failed to load game information. Please try again.');
    }
}

function openGamePickerModal(games) {
    const existingModal = document.getElementById('gamePickerModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'gamePickerModal';
    modal.className = 'modal';
    modal.style.display = 'block';

    const gameListHTML = games.map(game => {
        const iconHTML = game.image_url
            ? `<img src="${game.image_url}" alt="${game.GameTitle}"
                    style="width:36px;height:36px;object-fit:cover;border-radius:8px;"
                    onerror="this.style.display='none'">`
            : `<i class="fas fa-gamepad" style="font-size:1.25rem;color:var(--stockton-blue);"></i>`;

        return `
            <button class="game-picker-option"
                    onclick="closeGamePickerModal(); openCreateTeamModal(${game.GameID}, '${game.GameTitle.replace(/'/g, "\\'")}', '${game.TeamSizes}')">
                <div class="game-picker-icon">${iconHTML}</div>
                <div class="game-picker-info">
                    <div class="game-picker-title">${game.GameTitle}</div>
                    <div class="game-picker-division" style="font-size:0.8rem;color:var(--text-secondary);">${game.Division || ''}</div>
                </div>
                <i class="fas fa-chevron-right" style="color:var(--text-secondary);margin-left:auto;"></i>
            </button>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Select a Game</h2>
                <button class="modal-close" onclick="closeGamePickerModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <p class="modal-subtitle">Choose which game to create a team for</p>
                <div class="game-picker-list">${gameListHTML}</div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    lockBodyScroll('gamePickerModal');
}

function closeGamePickerModal() {
    const modal = document.getElementById('gamePickerModal');
    if (modal) {
        modal.remove();
        unlockBodyScroll('gamePickerModal');
    }
}

// ============================================
// Wraps the global selectTeam (defined in teams.js) so the sidebar
// active highlight always reflects the currently selected team.
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Wait one tick to ensure teams.js has already defined selectTeam
    setTimeout(() => {
        const _originalSelectTeam = window.selectTeam;
        if (typeof _originalSelectTeam === 'function') {
            window.selectTeam = function (teamId) {
                window.currentSelectedTeamId = teamId;
                updateSidebarActiveState(teamId);
                return _originalSelectTeam.apply(this, arguments);
            };
        }
    }, 0);
});

// ============================================
// EXPORT TO GLOBAL SCOPE
// ============================================

window.initializeViewSwitcher           = initializeViewSwitcher;
window.renderViewSwitcher               = renderViewSwitcher;
window.handleViewChange                 = handleViewChange;
window.applyTeamsViewFilter             = applyTeamsViewFilter;
window.applyTeamsDivisionFilter         = applyTeamsDivisionFilter;
window.applyTeamsPastSeasonFilter       = applyTeamsPastSeasonFilter;
window.getSubtitleForView               = getSubtitleForView;
window.invalidateTeamsCache             = invalidateTeamsCache;
window.isCacheFresh                     = isCacheFresh;
window.openCreateTeam                   = openCreateTeam;
window.closeGamePickerModal             = closeGamePickerModal;
window.updateDropdownCount              = updateDropdownCount;

// Past Season exports
window.loadPastSeasonsForTeamsFilter    = loadPastSeasonsForTeamsFilter;
window.getSelectedPastSeasonFilter      = getSelectedPastSeasonFilter;
window.setSelectedPastSeasonFilter      = setSelectedPastSeasonFilter;