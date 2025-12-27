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
 * - Game grouping with collapsible folders
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
 * Available views for current user based on permissions
 * Structure: [{ value: 'all', label: 'All Teams' }, ...]
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
 * @type {string}
 */
const VIEW_STORAGE_KEY = 'teams_selected_view';

/**
 * Storage key for collapsed games
 * @type {string}
 */
const COLLAPSED_GAMES_KEY = 'teams_expanded_games';

/**
 * Division filter storage key
 * @type {string}
 */
const DIVISION_FILTER_KEY = 'teams_selected_division';

/**
 * Division order configuration
 * @type {Array<string>}
 */
const DIVISION_ORDER = ['Strategy', 'Shooter', 'Sports', 'Other'];

// ============================================
// VIEW SWITCHER INITIALIZATION
// ============================================

/**
 * Initialize view switcher on page load
 * Fetches available views based on user permissions and sets up UI
 */
async function initializeViewSwitcher() {
    try {
        const response = await fetch('/api/teams/available-views');
        const data = await response.json();

        if (data.success && data.views && data.views.length > 0) {
            window.availableViews = data.views;

            const storedView = sessionStorage.getItem(VIEW_STORAGE_KEY);
            const validStoredView = window.availableViews.find(v => v.value === storedView);
            window.currentView = validStoredView ? storedView : window.availableViews[0].value;

            if (data.has_multiple) {
                renderViewSwitcher();
            } else {
                hideViewSwitcher();
            }

            initializeDivisionFilter();
            initializePastSeasonFilter();
        } else {
            hideViewSwitcher();
        }
    } catch (error) {
        console.error('Error initializing view switcher:', error);
        hideViewSwitcher();
    }
}

/**
 * Render the view switcher dropdown
 */
function renderViewSwitcher() {
    const viewSwitcher = document.getElementById('teamViewSwitcher');
    const viewSelect = document.getElementById('teamViewSelect');

    if (!viewSwitcher || !viewSelect) {
        console.error('View switcher elements not found');
        return;
    }

    viewSelect.innerHTML = '';

    window.availableViews.forEach(view => {
        const option = document.createElement('option');
        option.value = view.value;
        option.textContent = view.label;
        if (view.value === window.currentView) {
            option.selected = true;
        }
        viewSelect.appendChild(option);
    });

    const isAdmin = window.userPermissions?.is_admin || window.userPermissions.is_developer || false;

    // Add division filter option for admins
    if (isAdmin) {
        const divisionOption = document.createElement('option');
        divisionOption.value = 'division';
        divisionOption.textContent = 'Divisions';
        if (window.currentView === 'division') {
            divisionOption.selected = true;
        }
        viewSelect.appendChild(divisionOption);
    }

    // Add past seasons option for admins/devs
    if (isAdmin) {
        const pastSeasonOption = document.createElement('option');
        pastSeasonOption.value = 'past_seasons';
        pastSeasonOption.textContent = 'Past Seasons';
        if (window.currentView === 'past_seasons') {
            pastSeasonOption.selected = true;
        }
        viewSelect.appendChild(pastSeasonOption);
    }

    viewSwitcher.classList.remove('hidden');
    viewSelect.onchange = handleViewChange;
}

/**
 * Hide the view switcher
 */
function hideViewSwitcher() {
    const viewSwitcher = document.getElementById('teamViewSwitcher');
    if (viewSwitcher) {
        viewSwitcher.classList.add('hidden');
    }
}

/**
 * Handle view change from dropdown
 */
function handleViewChange(event) {
    const newView = event.target.value;

    if (newView !== window.currentView) {
        window.currentView = newView;
        sessionStorage.setItem(VIEW_STORAGE_KEY, newView);

        // Hide all secondary filters first
        hideDivisionFilterDropdown();
        hidePastSeasonFilterDropdown();

        // Reset filter states
        setSelectedDivisionFilter(null);

        // IMPORTANT: Reset past season filter completely
        PastSeasonTeamsFilterState.selectedSeasonId = null;
        PastSeasonTeamsFilterState.selectedSeasonName = '';
        PastSeasonTeamsFilterState.isFilteringPastSeason = false;
        setSelectedPastSeasonFilter(null); // Clear from session storage

        // Reset the dropdown value if it exists
        const seasonSelect = document.getElementById('pastSeasonFilterSelect');
        if (seasonSelect) {
            seasonSelect.value = '';
        }

        // CRITICAL: Invalidate all cache when switching views to force fresh data load
        invalidateTeamsCache();

        // Show appropriate filter
        if (newView === 'division') {
            showDivisionFilterDropdown();
        } else if (newView === 'past_seasons') {
            PastSeasonTeamsFilterState.isFilteringPastSeason = true;
            showPastSeasonFilterDropdown();
            loadPastSeasonsForTeamsFilter();
            return; // Don't load teams yet, wait for season selection
        }

        // Reset team selection and show welcome state
        window.currentSelectedTeamId = null;
        document.getElementById('teamsWelcomeState').style.display = 'flex';
        document.getElementById('teamsDetailContent').style.display = 'none';

        loadTeams();
    }
}

// ============================================
// TEAM LOADING & SIDEBAR
// ============================================

/**
 * Load teams based on user role and selected view
 */
async function loadTeams() {
    const sidebarLoading = document.getElementById('teamsSidebarLoading');
    const sidebarList = document.getElementById('teamsSidebarList');
    const sidebarEmpty = document.getElementById('teamsSidebarEmpty');
    const sidebarSubtitle = document.querySelector('.teams-subtitle');

    if (window.availableViews.length === 0) {
        await initializeViewSwitcher();
    }

    // Generate cache key
    const selectedDivision = window.currentView === 'division' ? getSelectedDivisionFilter() : null;
    const selectedSeasonId = window.currentView === 'past_seasons' ? PastSeasonTeamsFilterState.selectedSeasonId : null;

    let cacheKey = window.currentView || 'all';
    if (selectedDivision) {
        cacheKey = `division-${selectedDivision}`;
    } else if (selectedSeasonId) {
        cacheKey = `past_season-${selectedSeasonId}`;
    }

    // IMPORTANT: If in past_seasons view but no season selected, show empty state immediately
    if (window.currentView === 'past_seasons' && !selectedSeasonId) {
        sidebarLoading.style.display = 'none';
        sidebarList.style.display = 'none';
        sidebarEmpty.style.display = 'block';

        if (sidebarSubtitle) {
            sidebarSubtitle.textContent = 'Past Seasons (0)';
        }

        if (sidebarEmpty) {
            sidebarEmpty.innerHTML = `<i class="fas fa-calendar"></i><p>Select a past season to view teams</p>`;
        }
        return;
    }

    // Check cache first
    if (teamsCache[cacheKey] && isCacheFresh(cacheKey)) {
        console.log('Using cached teams data');
        renderFromCache(teamsCache[cacheKey], sidebarLoading, sidebarList, sidebarEmpty, sidebarSubtitle);
        return;
    }

    // Show loading state
    sidebarLoading.style.display = 'block';
    sidebarList.style.display = 'none';
    sidebarEmpty.style.display = 'none';

    try {
        // Build URL with parameters
        let url = `/api/teams/sidebar?view=${window.currentView}`;

        // Add season parameter if filtering past seasons
        if (selectedSeasonId) {
            url += `&season_id=${selectedSeasonId}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.success && data.teams && data.teams.length > 0) {
            let teamsToDisplay = data.teams;

            // Apply division filter if active
            if (window.currentView === 'division') {
                const selectedDivision = getSelectedDivisionFilter();
                if (selectedDivision) {
                    teamsToDisplay = data.teams.filter(team =>
                        (team.division || 'Other') === selectedDivision
                    );
                }
            }

            // Cache the data
            teamsCache[cacheKey] = teamsToDisplay;
            teamsCache.timestamps[cacheKey] = Date.now();

            window.allTeamsData = teamsToDisplay;

            if (sidebarSubtitle) {
                const viewLabel = getSubtitleForView(window.currentView, teamsToDisplay.length);
                sidebarSubtitle.textContent = viewLabel;
            }

            if (teamsToDisplay.length > 0) {
                renderTeamsSidebar(teamsToDisplay);
                sidebarLoading.style.display = 'none';
                sidebarList.style.display = 'flex';
            } else {
                if (sidebarSubtitle) {
                    const viewLabel = getSubtitleForView(window.currentView, 0);
                    sidebarSubtitle.textContent = viewLabel;
                }

                if (sidebarEmpty) {
                    const emptyMessage = getEmptyMessageForView(window.currentView);
                    sidebarEmpty.innerHTML = `<i class="fas fa-users"></i><p>${emptyMessage}</p>`;
                }

                sidebarLoading.style.display = 'none';
                sidebarEmpty.style.display = 'block';
            }
        } else {
            if (sidebarSubtitle) {
                const viewLabel = getSubtitleForView(window.currentView, 0);
                sidebarSubtitle.textContent = viewLabel;
            }

            if (sidebarEmpty) {
                const emptyMessage = getEmptyMessageForView(window.currentView);
                sidebarEmpty.innerHTML = `<i class="fas fa-users"></i><p>${emptyMessage}</p>`;
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

/**
 * Helper function to render from cached data
 */
function renderFromCache(cachedTeams, sidebarLoading, sidebarList, sidebarEmpty, sidebarSubtitle) {
    window.allTeamsData = cachedTeams;

    if (sidebarSubtitle) {
        const viewLabel = getSubtitleForView(window.currentView, cachedTeams.length);
        sidebarSubtitle.textContent = viewLabel;
    }

    if (cachedTeams.length > 0) {
        renderTeamsSidebar(cachedTeams);
        sidebarLoading.style.display = 'none';
        sidebarList.style.display = 'flex';
    } else {
        if (sidebarSubtitle) {
            const viewLabel = getSubtitleForView(window.currentView, 0);
            sidebarSubtitle.textContent = viewLabel;
        }

        if (sidebarEmpty) {
            const emptyMessage = getEmptyMessageForView(window.currentView);
            sidebarEmpty.innerHTML = `<i class="fas fa-users"></i><p>${emptyMessage}</p>`;
        }

        sidebarLoading.style.display = 'none';
        sidebarEmpty.style.display = 'block';
    }
}

/**
 * Function to invalidate cache when teams are modified
 */
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
 * Get subtitle text based on current view
 */
function getSubtitleForView(view, count = 0) {
    let label = '';

    if (view === 'division') {
        const selectedDivision = getSelectedDivisionFilter();
        if (selectedDivision) {
            label = `${selectedDivision} Teams`;
        } else {
            label = 'All Teams';
        }
    } else if (view === 'past_seasons') {
        const seasonName = PastSeasonTeamsFilterState.selectedSeasonName;
        if (seasonName) {
            label = `${seasonName} Teams`;
        } else {
            label = 'Past Seasons';
        }
    } else {
        const viewObj = window.availableViews.find(v => v.value === view);

        if (viewObj) {
            label = viewObj.label;
        } else {
            const isAdmin = window.userPermissions?.is_admin || window.userPermissions.is_developer || false;
            const isGM = window.userPermissions?.is_gm || false;

            if (isAdmin) {
                label = 'All Teams';
            } else if (isGM) {
                label = 'Teams I Manage';
            } else {
                label = 'Your Teams';
            }
        }
    }

    return `${label} (${count})`;
}

/**
 * Get empty state message based on current view
 */
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

/**
 * Render teams in sidebar (basic version)
 */
function renderTeamsSidebar(teams) {
    const sidebarList = document.getElementById('teamsSidebarList');
    sidebarList.innerHTML = '';

    teams.forEach(team => {
        const teamItem = document.createElement('div');
        teamItem.className = 'team-sidebar-item';
        teamItem.setAttribute('data-team-id', team.TeamID);
        teamItem.setAttribute('data-gm-id', team.gm_id || '');

        const isGameManager = team.gm_id && team.gm_id === window.currentUserId;

        // Season indicator - ONLY show for PAST teams (season_is_active = 0)
        const seasonIndicator = (team.season_name && team.season_is_active === 0) ? `
            <div class="team-sidebar-season" title="Past Season">
                <span style="color: #94a3b8;">●</span>
                ${team.season_name}
            </div>
        ` : '';

        teamItem.innerHTML = `
            <div class="team-sidebar-content" onclick="selectTeam('${team.TeamID}')">
                <div class="team-sidebar-name">${team.teamName}</div>
                ${seasonIndicator}
                <div class="team-sidebar-game">${team.GameTitle || 'Unknown Game'}</div>
                <div class="team-sidebar-meta">
                    <span><i class="fas fa-users"></i> ${team.member_count || 0}</span>
                    <span><i class="fas fa-trophy"></i> ${team.teamMaxSize}</span>
                </div>
            </div>
            ${isGameManager && team.season_is_active !== 0 ? `
                <button class="team-edit-btn"
                        onclick="event.stopPropagation(); openEditTeamModal('${team.TeamID}', '${team.teamName.replace(/'/g, "\\'")}', ${team.teamMaxSize}, '${team.TeamSizes || ''}')"
                        title="Edit team">
                    <i class="fas fa-edit"></i>
                </button>
            ` : ''}
        `;

        sidebarList.appendChild(teamItem);
    });
}

// ============================================
// GAME GROUPING & COLLAPSIBLE FOLDERS
// ============================================

/**
 * Get set of expanded game IDs from sessionStorage. Not renaming because gross.
 */
function getCollapsedGames() {
    const storageKey = `${COLLAPSED_GAMES_KEY}_${window.currentView || 'all'}`;
    const stored = sessionStorage.getItem(storageKey);
    return stored ? new Set(JSON.parse(stored)) : new Set();
}

/**
 * Save collapsed games to sessionStorage
 */
function saveCollapsedGames(collapsedGames) {
    const storageKey = `${COLLAPSED_GAMES_KEY}_${window.currentView || 'all'}`;
    sessionStorage.setItem(storageKey, JSON.stringify([...collapsedGames]));
}

/**
 * Toggle collapse state for a game
 */
function toggleGameCollapse(gameId) {
    const collapsedGames = getCollapsedGames();

    if (collapsedGames.has(gameId)) {
        collapsedGames.delete(gameId);
    } else {
        collapsedGames.add(gameId);
    }

    saveCollapsedGames(collapsedGames);

    const sidebarList = document.getElementById('teamsSidebarList');
    if (sidebarList && window.allTeamsData.length > 0) {
        renderTeamsSidebarWithGroups(window.allTeamsData);
    }
}

/**
 * Get sort priority for a division
 */
function getDivisionSortPriority(division) {
    const index = DIVISION_ORDER.indexOf(division);
    return index !== -1 ? index : 999;
}

/**
 * Sort teams by division order, then alphabetically by game title
 */
function sortTeamsByDivision(teams) {
    return teams.sort((a, b) => {
        const divisionA = a.division || 'Other';
        const divisionB = b.division || 'Other';

        const priorityA = getDivisionSortPriority(divisionA);
        const priorityB = getDivisionSortPriority(divisionB);

        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }

        const gameA = (a.GameTitle || '').toLowerCase();
        const gameB = (b.GameTitle || '').toLowerCase();

        if (gameA !== gameB) {
            return gameA.localeCompare(gameB);
        }

        if (a.created_at && b.created_at) {
            return new Date(a.created_at) - new Date(b.created_at);
        }

        return 0;
    });
}

// ============================================
// PAST SEASON FILTER
// ============================================

/**
 * Get currently selected past season filter
 */
function getSelectedPastSeasonFilter() {
    return sessionStorage.getItem(PAST_SEASON_FILTER_KEY);
}

/**
 * Set past season filter
 */
function setSelectedPastSeasonFilter(seasonId) {
    if (seasonId) {
        sessionStorage.setItem(PAST_SEASON_FILTER_KEY, seasonId);
    } else {
        sessionStorage.removeItem(PAST_SEASON_FILTER_KEY);
    }
}

/**
 * Initialize past season filter dropdown
 */
function initializePastSeasonFilter() {
    const isAdmin = window.userPermissions?.is_admin || window.userPermissions.is_developer || false;
    if (!isAdmin) return;

    const divisionFilterContainer = document.getElementById('divisionFilterContainer');
    if (!divisionFilterContainer || !divisionFilterContainer.parentNode) return;

    let pastSeasonFilterContainer = document.getElementById('pastSeasonFilterContainer');

    if (!pastSeasonFilterContainer) {
        pastSeasonFilterContainer = document.createElement('div');
        pastSeasonFilterContainer.id = 'pastSeasonFilterContainer';
        pastSeasonFilterContainer.className = 'past-season-filter-container hidden';

        pastSeasonFilterContainer.innerHTML = `
            <label for="pastSeasonFilterSelect" class="past-season-filter-label">
                Season:
            </label>
            <select id="pastSeasonFilterSelect" class="past-season-filter-select">
                <option value="">Select Past Season</option>
            </select>
            <div id="pastSeasonFilterLoadingIndicator" style="display: none; margin-left: 0.5rem;">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
        `;

        divisionFilterContainer.parentNode.insertBefore(
            pastSeasonFilterContainer,
            divisionFilterContainer.nextSibling
        );

        const seasonSelect = document.getElementById('pastSeasonFilterSelect');
        if (seasonSelect) {
            seasonSelect.addEventListener('change', handlePastSeasonFilterChange);
        }
    }

    if (window.currentView === 'past_seasons') {
        showPastSeasonFilterDropdown();

        const savedSeasonId = getSelectedPastSeasonFilter();
        if (savedSeasonId) {
            PastSeasonTeamsFilterState.selectedSeasonId = savedSeasonId;
            const seasonSelect = document.getElementById('pastSeasonFilterSelect');
            if (seasonSelect) {
                seasonSelect.value = savedSeasonId;
            }
        }
    }
}

/**
 * Show past season filter dropdown
 */
function showPastSeasonFilterDropdown() {
    const container = document.getElementById('pastSeasonFilterContainer');
    if (container) {
        container.classList.remove('hidden');
    }
}

/**
 * Hide past season filter dropdown
 */
function hidePastSeasonFilterDropdown() {
    const container = document.getElementById('pastSeasonFilterContainer');
    if (container) {
        container.classList.add('hidden');
    }
}

/**
 * Load past seasons for teams filter
 */
async function loadPastSeasonsForTeamsFilter() {
    const seasonSelect = document.getElementById('pastSeasonFilterSelect');
    const loadingIndicator = document.getElementById('pastSeasonFilterLoadingIndicator');

    if (!seasonSelect) return;

    // Show loading
    if (loadingIndicator) loadingIndicator.style.display = 'inline-block';
    seasonSelect.disabled = true;

    try {
        const response = await fetch('/api/seasons/past');
        const data = await response.json();

        if (data.success && data.seasons) {
            PastSeasonTeamsFilterState.availablePastSeasons = data.seasons;

            // Clear and populate dropdown
            seasonSelect.innerHTML = '<option value="">Select Past Season</option>';

            if (data.seasons.length === 0) {
                seasonSelect.innerHTML += '<option value="" disabled>No past seasons available</option>';
            } else {
                data.seasons.forEach(season => {
                    const option = document.createElement('option');
                    option.value = season.season_id;
                    option.textContent = season.season_name;
                    seasonSelect.appendChild(option);
                });
            }
        } else {
            console.error('Failed to load past seasons:', data.message);
            seasonSelect.innerHTML = '<option value="">Error loading past seasons</option>';
        }
    } catch (error) {
        console.error('Error fetching past seasons:', error);
        seasonSelect.innerHTML = '<option value="">Error loading past seasons</option>';
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        seasonSelect.disabled = false;
    }
}

/**
 * Handle past season filter change
 */
function handlePastSeasonFilterChange(event) {
    const selectedSeasonId = event.target.value;

    if (!selectedSeasonId) {
        PastSeasonTeamsFilterState.selectedSeasonId = null;
        PastSeasonTeamsFilterState.selectedSeasonName = '';
        setSelectedPastSeasonFilter(null);
        return;
    }

    // Store selected past season
    PastSeasonTeamsFilterState.selectedSeasonId = selectedSeasonId;
    const seasonSelect = event.target;
    PastSeasonTeamsFilterState.selectedSeasonName = seasonSelect.options[seasonSelect.selectedIndex].text;
    setSelectedPastSeasonFilter(selectedSeasonId);

    // Invalidate cache to ensure fresh data for the selected season
    invalidateTeamsCache();

    // Reset team selection
    window.currentSelectedTeamId = null;
    document.getElementById('teamsWelcomeState').style.display = 'flex';
    document.getElementById('teamsDetailContent').style.display = 'none';

    // Load teams for this past season
    loadTeams();
}

/**
 * Render teams sidebar with game grouping
 */
function renderTeamsSidebarWithGroups(teams) {
    const sidebarList = document.getElementById('teamsSidebarList');
    sidebarList.innerHTML = '';

    const sidebar = document.querySelector('.teams-sidebar');
    if (sidebar) {
        sidebar.setAttribute('data-view', window.currentView || 'all');
    }

    // Use game grouping
    if (window.currentView !== 'all' && window.currentView !== 'division' && window.currentView !== 'past_seasons') {
        const sortedTeams = sortTeamsByDivision(teams);
        originalRenderTeamsSidebar(sortedTeams);
        return;
    }

    const sortedTeams = sortTeamsByDivision(teams);

    const gameGroups = {};
    sortedTeams.forEach(team => {
        const gameId = team.gameID;
        const gameTitle = team.GameTitle || 'Unknown Game';

        if (!gameGroups[gameId]) {
            gameGroups[gameId] = {
                gameId: gameId,
                gameTitle: gameTitle,
                division: team.division || 'Other',
                hasGameImage: team.has_game_image,
                teams: []
            };
        }
        gameGroups[gameId].teams.push(team);
    });

    const sortedGroups = Object.values(gameGroups).sort((a, b) => {
        const priorityA = getDivisionSortPriority(a.division);
        const priorityB = getDivisionSortPriority(b.division);

        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }

        return a.gameTitle.localeCompare(b.gameTitle);
    });

    const collapsedGames = getCollapsedGames();

    sortedGroups.forEach(group => {
        const isCollapsed = !collapsedGames.has(group.gameId.toString());

        if (isCollapsed) {
            renderCollapsedGameFolder(group, sidebarList);
        } else {
            renderExpandedGameGroup(group, sidebarList);
        }
    });
}

/**
 * Render a collapsed game folder
 */
function renderCollapsedGameFolder(group, container) {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'game-folder-collapsed';
    folderDiv.setAttribute('data-game-id', group.gameId);

    const hasSelectedTeam = group.teams.some(t => t.TeamID === window.currentSelectedTeamId);
    if (hasSelectedTeam) {
        folderDiv.classList.add('active');
    }

    const teamCount = group.teams.length;
    const teamWord = teamCount === 1 ? 'team' : 'teams';

    let gameIconHTML;
    if (group.gameId && group.hasGameImage) {
        gameIconHTML = `
            <img src="/game-image/${group.gameId}"
                 alt="${group.gameTitle}"
                 loading="lazy"
                 style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center;">
                <i class="fas fa-gamepad"></i>
            </div>
        `;
    } else {
        gameIconHTML = '<i class="fas fa-gamepad"></i>';
    }

    folderDiv.innerHTML = `
        <div class="game-folder-info" onclick="event.stopPropagation(); toggleGameCollapse('${group.gameId}')">
            <div class="game-folder-icon">
                ${gameIconHTML}
            </div>
            <div class="game-folder-details">
                <div class="game-folder-name">${group.gameTitle}</div>
                <div class="game-folder-count">${teamCount} ${teamWord}</div>
            </div>
        </div>
        <button class="game-folder-expand-btn"
                onclick="event.stopPropagation(); toggleGameCollapse('${group.gameId}')"
                title="Expand ${group.gameTitle} teams">
            <i class="fas fa-chevron-down"></i>
        </button>
    `;

    container.appendChild(folderDiv);
}

/**
 * Render an expanded game group with all teams
 */
function renderExpandedGameGroup(group, container) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'game-group';
    groupDiv.setAttribute('data-game-id', group.gameId);

    group.teams.forEach((team, index) => {
        const teamItem = document.createElement('div');
        teamItem.className = 'team-sidebar-item';
        teamItem.setAttribute('data-team-id', team.TeamID);
        teamItem.setAttribute('data-gm-id', team.gm_id || '');

        if (team.TeamID === window.currentSelectedTeamId) {
            teamItem.classList.add('active');
        }

        const isGameManager = team.gm_id && team.gm_id === window.currentUserId;

        const collapseBtn = index === 0 ? `
            <button class="team-collapse-btn"
                    onclick="event.stopPropagation(); toggleGameCollapse('${group.gameId}')"
                    title="Collapse ${group.gameTitle} teams">
                <i class="fas fa-chevron-up"></i>
            </button>
        ` : '';

        // Season indicator - ONLY show for PAST teams (season_is_active = 0)
        const seasonIndicator = (team.season_name && team.season_is_active === 0) ? `
            <div class="team-sidebar-season" title="Past Season">
                <span style="color: #94a3b8;">●</span>
                ${team.season_name}
            </div>
        ` : '';

        teamItem.innerHTML = `
            ${collapseBtn}
            <div class="team-sidebar-content" onclick="selectTeam('${team.TeamID}')">
                <div class="team-sidebar-name">${team.teamName}</div>
                ${seasonIndicator}
                <div class="team-sidebar-game">${team.GameTitle || 'Unknown Game'}</div>
                <div class="team-sidebar-meta">
                    <span><i class="fas fa-users"></i> ${team.member_count || 0}</span>
                    <span><i class="fas fa-trophy"></i> ${team.teamMaxSize}</span>
                </div>
            </div>
            ${isGameManager && team.season_is_active !== 0 ? `
                <button class="team-edit-btn"
                        onclick="event.stopPropagation(); openEditTeamModal('${team.TeamID}', '${team.teamName.replace(/'/g, "\\'")}', ${team.teamMaxSize}, '${team.TeamSizes || ''}')"
                        title="Edit team">
                    <i class="fas fa-edit"></i>
                </button>
            ` : ''}
        `;

        groupDiv.appendChild(teamItem);
    });

    container.appendChild(groupDiv);
}

/**
 * Override renderTeamsSidebar to use grouping when appropriate
 */
const originalRenderTeamsSidebar = renderTeamsSidebar;
renderTeamsSidebar = function(teams) {
    if (window.currentView === 'all' || window.currentView === 'division' || window.currentView === 'past_seasons') {
        renderTeamsSidebarWithGroups(teams);
    } else {
        originalRenderTeamsSidebar(teams);
    }
};

// ============================================
// DIVISION FILTER
// ============================================

/**
 * Get currently selected division filter
 */
function getSelectedDivisionFilter() {
    return sessionStorage.getItem(DIVISION_FILTER_KEY);
}

/**
 * Set division filter
 */
function setSelectedDivisionFilter(division) {
    if (division) {
        sessionStorage.setItem(DIVISION_FILTER_KEY, division);
    } else {
        sessionStorage.removeItem(DIVISION_FILTER_KEY);
    }
}

/**
 * Initialize division filter dropdown
 */
function initializeDivisionFilter() {
    const isAdmin = window.userPermissions?.is_admin || window.userPermissions.is_developer || false;
    if (!isAdmin) return;

    const sidebarHeaderTop = document.querySelector('.sidebar-header-top');
    if (!sidebarHeaderTop) return;

    let divisionFilterContainer = document.getElementById('divisionFilterContainer');

    if (!divisionFilterContainer) {
        divisionFilterContainer = document.createElement('div');
        divisionFilterContainer.id = 'divisionFilterContainer';
        divisionFilterContainer.className = 'division-filter-container hidden';

        divisionFilterContainer.innerHTML = `
            <label for="divisionFilterSelect" class="division-filter-label">
                Division:
            </label>
            <select id="divisionFilterSelect" class="division-filter-select">
                <option value="">All Divisions</option>
                <option value="Strategy">Strategy</option>
                <option value="Shooter">Shooter</option>
                <option value="Sports">Sports</option>
                <option value="Other">Other</option>
            </select>
        `;

        if (sidebarHeaderTop.parentNode) {
            sidebarHeaderTop.parentNode.insertBefore(divisionFilterContainer, sidebarHeaderTop.nextSibling);
        }

        const divisionSelect = document.getElementById('divisionFilterSelect');
        if (divisionSelect) {
            divisionSelect.addEventListener('change', handleDivisionFilterChange);
        }
    }

    if (window.currentView === 'division') {
        showDivisionFilterDropdown();

        const savedDivision = getSelectedDivisionFilter();
        if (savedDivision) {
            const divisionSelect = document.getElementById('divisionFilterSelect');
            if (divisionSelect) {
                divisionSelect.value = savedDivision;
            }
        }
    }
}

/**
 * Show division filter dropdown
 */
function showDivisionFilterDropdown() {
    const container = document.getElementById('divisionFilterContainer');
    if (container) {
        container.classList.remove('hidden');
    }
}

/**
 * Hide division filter dropdown
 */
function hideDivisionFilterDropdown() {
    const container = document.getElementById('divisionFilterContainer');
    if (container) {
        container.classList.add('hidden');
    }
}

/**
 * Handle division filter change
 */
function handleDivisionFilterChange(event) {
    const selectedDivision = event.target.value;

    setSelectedDivisionFilter(selectedDivision || null);

    window.currentSelectedTeamId = null;
    document.getElementById('teamsWelcomeState').style.display = 'flex';
    document.getElementById('teamsDetailContent').style.display = 'none';

    loadTeams();
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

window.loadTeams = loadTeams;
window.toggleGameCollapse = toggleGameCollapse;
window.sortTeamsByDivision = sortTeamsByDivision;
window.getDivisionSortPriority = getDivisionSortPriority;
window.renderTeamsSidebarWithGroups = renderTeamsSidebarWithGroups;
window.initializeViewSwitcher = initializeViewSwitcher;
window.renderViewSwitcher = renderViewSwitcher;
window.handleViewChange = handleViewChange;
window.getSubtitleForView = getSubtitleForView;
window.initializeDivisionFilter = initializeDivisionFilter;
window.showDivisionFilterDropdown = showDivisionFilterDropdown;
window.hideDivisionFilterDropdown = hideDivisionFilterDropdown;
window.handleDivisionFilterChange = handleDivisionFilterChange;
window.invalidateTeamsCache = invalidateTeamsCache;
window.isCacheFresh = isCacheFresh;

//Past Season Exports
window.initializePastSeasonFilter = initializePastSeasonFilter;
window.showPastSeasonFilterDropdown = showPastSeasonFilterDropdown;
window.hidePastSeasonFilterDropdown = hidePastSeasonFilterDropdown;
window.loadPastSeasonsForTeamsFilter = loadPastSeasonsForTeamsFilter;
window.handlePastSeasonFilterChange = handlePastSeasonFilterChange;
window.getSelectedPastSeasonFilter = getSelectedPastSeasonFilter;
window.setSelectedPastSeasonFilter = setSelectedPastSeasonFilter;