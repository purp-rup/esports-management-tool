/**
 * teams.js
 * ============================================================================
 * TEAMS MANAGEMENT SYSTEM
 * ============================================================================
 * Comprehensive team management functionality:
 * - Role-based view switching (All Teams, Teams I Manage, Teams I Play On)
 * - Team sidebar with filtering and selection
 * - Team details display with tabs (Roster, Schedule, Stats, VODs)
 * - Team member management (add/remove)
 * - Team editing (name, max size)
 * - Team deletion
 * - Next scheduled event display
 * - Integration with scheduled events and statistics
 * - Session-based view persistence
 * ============================================================================
 */

// ============================================
// GLOBAL STATE
// ============================================

/**
 * Currently selected team ID
 * @type {string|null}
 */
let currentSelectedTeamId = null;

/**
 * All teams data from current view
 * @type {Array}
 */
let allTeamsData = [];

/**
 * Available views for current user based on permissions
 * Structure: [{ value: 'all', label: 'All Teams' }, ...]
 * @type {Array<Object>}
 */
let availableViews = [];

/**
 * Current active view
 * @type {string|null}
 */
let currentView = null;

/**
 * Session storage key for view persistence
 * Allows users to return to their preferred view
 * @type {string}
 */
const VIEW_STORAGE_KEY = 'teams_selected_view';

// ============================================
// VIEW SWITCHER INITIALIZATION
// ============================================

/**
 * Initialize view switcher on page load
 * Fetches available views based on user permissions and sets up UI
 *
 * View options depend on user role:
 * - Admin: All Teams, Teams I Manage, Teams I Play On
 * - GM: Teams I Manage, Teams I Play On
 * - Player: Teams I Play On only
 */
async function initializeViewSwitcher() {
    try {
        // Fetch available views from backend
        const response = await fetch('/api/teams/available-views');
        const data = await response.json();

        if (data.success && data.views && data.views.length > 0) {
            availableViews = data.views;

            // Get stored view preference or use first (highest priority) view
            const storedView = sessionStorage.getItem(VIEW_STORAGE_KEY);
            const validStoredView = availableViews.find(v => v.value === storedView);
            currentView = validStoredView ? storedView : availableViews[0].value;

            // Show switcher only if user has multiple view options
            if (data.has_multiple) {
                renderViewSwitcher();
            } else {
                hideViewSwitcher();
            }

            // Initialize division filter dropdown for admins
            initializeDivisionFilter();
        } else {
            hideViewSwitcher();
        }
    } catch (error) {
        console.error('Error initializing view switcher:', error);
        hideViewSwitcher();
    }
}

/**
 * Updated renderViewSwitcher to include Division option
 */
function renderViewSwitcher() {
    const viewSwitcher = document.getElementById('teamViewSwitcher');
    const viewSelect = document.getElementById('teamViewSelect');

    if (!viewSwitcher || !viewSelect) {
        console.error('View switcher elements not found');
        return;
    }

    // Clear existing options
    viewSelect.innerHTML = '';

    // Add view options
    availableViews.forEach(view => {
        const option = document.createElement('option');
        option.value = view.value;
        option.textContent = view.label;
        if (view.value === currentView) {
            option.selected = true;
        }
        viewSelect.appendChild(option);
    });

    // Add Division filter option for admins only
    const isAdmin = window.userPermissions?.is_admin || false;
    if (isAdmin) {
        const divisionOption = document.createElement('option');
        divisionOption.value = 'division';
        divisionOption.textContent = 'Filter by Division';
        if (currentView === 'division') {
            divisionOption.selected = true;
        }
        viewSelect.appendChild(divisionOption);
    }

    // Show the switcher
    viewSwitcher.classList.remove('hidden');

    // Attach change event handler
    viewSelect.onchange = handleViewChange;
}

/**
 * Hide the view switcher
 * Used when user only has one view option available
 */
function hideViewSwitcher() {
    const viewSwitcher = document.getElementById('teamViewSwitcher');
    if (viewSwitcher) {
        viewSwitcher.classList.add('hidden');
    }
}

/**
 * Handle view change from dropdown
 * Updates current view and reloads teams list
 *
 * @param {Event} event - Change event from select dropdown
 */
function handleViewChange(event) {
    const newView = event.target.value;

    if (newView !== currentView) {
        currentView = newView;

        // Persist the selection in session storage
        sessionStorage.setItem(VIEW_STORAGE_KEY, newView);

        // Show/hide division filter dropdown based on selection
        if (newView === 'division') {
            showDivisionFilterDropdown();
        } else {
            hideDivisionFilterDropdown();
            // Clear division filter when switching away
            setSelectedDivisionFilter(null);
        }

        // Reset selected team and show welcome state
        currentSelectedTeamId = null;
        document.getElementById('teamsWelcomeState').style.display = 'flex';
        document.getElementById('teamsDetailContent').style.display = 'none';

        // Reload teams with new view
        loadTeams();
    }
}

// ============================================
// TEAM LOADING & SIDEBAR
// ============================================

/**
 * Load teams based on user role and selected view
 * Fetches teams from API and renders sidebar
 */
async function loadTeams() {
    const sidebarLoading = document.getElementById('teamsSidebarLoading');
    const sidebarList = document.getElementById('teamsSidebarList');
    const sidebarEmpty = document.getElementById('teamsSidebarEmpty');
    const sidebarSubtitle = document.querySelector('.teams-subtitle');

    // Initialize view switcher if not already done
    if (availableViews.length === 0) {
        await initializeViewSwitcher();
    }

    // Show loading state
    sidebarLoading.style.display = 'block';
    sidebarList.style.display = 'none';
    sidebarEmpty.style.display = 'none';

    try {
        // Build URL with view parameter if we have a current view
        const url = currentView
            ? `/api/teams/sidebar?view=${currentView}`
            : '/api/teams/sidebar';

        const response = await fetch(url);
        const data = await response.json();

        if (data.success && data.teams && data.teams.length > 0) {
            let teamsToDisplay = data.teams;

            // Apply division filter if in division view
            if (currentView === 'division') {
                const selectedDivision = getSelectedDivisionFilter();

                if (selectedDivision) {
                    teamsToDisplay = data.teams.filter(team =>
                        (team.division || 'Other') === selectedDivision
                    );
                }
            }

            // Store teams data
            allTeamsData = teamsToDisplay;

            // Update subtitle with view label and team count
            if (sidebarSubtitle) {
                const viewLabel = getSubtitleForView(currentView, teamsToDisplay.length);
                sidebarSubtitle.textContent = viewLabel;
            }

            if (teamsToDisplay.length > 0) {
                // Render teams in sidebar
                renderTeamsSidebar(teamsToDisplay);

                // Show teams list
                sidebarLoading.style.display = 'none';
                sidebarList.style.display = 'flex';
            } else {
                // No teams after filtering
                if (sidebarSubtitle) {
                    const viewLabel = getSubtitleForView(currentView, 0);
                    sidebarSubtitle.textContent = viewLabel;
                }

                if (sidebarEmpty) {
                    const selectedDivision = getSelectedDivisionFilter();
                    const emptyMessage = selectedDivision
                        ? `No teams found in ${selectedDivision} division.`
                        : getEmptyMessageForView(currentView);
                    sidebarEmpty.innerHTML = `<i class="fas fa-users"></i><p>${emptyMessage}</p>`;
                }

                sidebarLoading.style.display = 'none';
                sidebarEmpty.style.display = 'block';
            }
        } else {
            // No teams found for current view

            // Update subtitle to show zero count
            if (sidebarSubtitle) {
                const viewLabel = getSubtitleForView(currentView, 0);
                sidebarSubtitle.textContent = viewLabel;
            }

            // Update empty state message based on view
            if (sidebarEmpty) {
                const emptyMessage = getEmptyMessageForView(currentView);
                sidebarEmpty.innerHTML = `<i class="fas fa-users"></i><p>${emptyMessage}</p>`;
            }

            // Show empty state
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
 * Get subtitle text based on current view
 * Includes team count in parentheses
 *
 * @param {string} view - Current view mode
 * @param {number} count - Number of teams in current view
 * @returns {string} Formatted subtitle text
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
    } else {
        const viewObj = availableViews.find(v => v.value === view);

        if (viewObj) {
            label = viewObj.label;
        } else {
            // Fallback based on user permissions
            const isAdmin = window.userPermissions?.is_admin || false;
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

    // Add count to label
    return `${label} (${count})`;
}

/**
 * Get empty state message based on current view
 * Provides context-appropriate messaging
 *
 * @param {string} view - Current view mode
 * @returns {string} Empty state message
 */
function getEmptyMessageForView(view) {
    const messages = {
        all: 'No teams have been created yet.',
        manage: 'You are not managing any teams yet.',
        play: 'You are not a member of any teams yet.'
    };

    return messages[view] || 'No teams available.';
}

/**
 * Render teams in sidebar
 * Creates team items with edit button for GMs
 *
 * @param {Array} teams - Array of team objects to render
 */
function renderTeamsSidebar(teams) {
    const sidebarList = document.getElementById('teamsSidebarList');
    sidebarList.innerHTML = '';

    teams.forEach(team => {
        const teamItem = document.createElement('div');
        teamItem.className = 'team-sidebar-item';
        teamItem.setAttribute('data-team-id', team.TeamID);
        teamItem.setAttribute('data-gm-id', team.gm_id || '');

        // Check if current user is the GM for THIS specific game
        const isGameManager = team.gm_id && team.gm_id === window.currentUserId;

        // Build team item HTML
        // Only the main content area triggers team selection, not edit button
        teamItem.innerHTML = `
            <div class="team-sidebar-content" onclick="selectTeam('${team.TeamID}')">
                <div class="team-sidebar-name">${team.teamName}</div>
                <div class="team-sidebar-game">${team.GameTitle || 'Unknown Game'}</div>
                <div class="team-sidebar-meta">
                    <span><i class="fas fa-users"></i> ${team.member_count || 0}</span>
                    <span><i class="fas fa-trophy"></i> ${team.teamMaxSize}</span>
                </div>
            </div>
            ${isGameManager ? `
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
// For "All Teams" view
// ============================================

/**
 * Storage key for collapsed games
 */
const COLLAPSED_GAMES_KEY = 'teams_collapsed_games';

/**
 * Get set of collapsed game IDs from sessionStorage
 * @returns {Set<string>}
 */
function getCollapsedGames() {
    const stored = sessionStorage.getItem(COLLAPSED_GAMES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
}

/**
 * Save collapsed games to sessionStorage
 * @param {Set<string>} collapsedGames
 */
function saveCollapsedGames(collapsedGames) {
    sessionStorage.setItem(COLLAPSED_GAMES_KEY, JSON.stringify([...collapsedGames]));
}

/**
 * Toggle collapse state for a game
 * @param {string} gameId - ID of game to toggle
 */
function toggleGameCollapse(gameId) {
    const collapsedGames = getCollapsedGames();

    if (collapsedGames.has(gameId)) {
        collapsedGames.delete(gameId);
    } else {
        collapsedGames.add(gameId);
    }

    saveCollapsedGames(collapsedGames);

    // Re-render sidebar with updated collapse state
    const sidebarList = document.getElementById('teamsSidebarList');
    if (sidebarList && allTeamsData.length > 0) {
        renderTeamsSidebarWithGroups(allTeamsData);
    }
}

// ============================================
// DIVISION ORDER CONFIGURATION
// ============================================

const DIVISION_ORDER = ['Strategy', 'Shooter', 'Sports', 'Other'];

/**
 * Get sort priority for a division
 * @param {string} division - Division name
 * @returns {number} Sort priority (lower = earlier)
 */
function getDivisionSortPriority(division) {
    const index = DIVISION_ORDER.indexOf(division);
    return index !== -1 ? index : 999; // Unknown divisions go last
}

// ============================================
// UPDATED TEAM SORTING
// ============================================
/**
 * Sort teams by division order, then alphabetically by game title
 * @param {Array} teams - Array of team objects
 * @returns {Array} Sorted teams array
 */
function sortTeamsByDivision(teams) {
    return teams.sort((a, b) => {
        // First, sort by division priority
        const divisionA = a.division || 'Other';
        const divisionB = b.division || 'Other';

        const priorityA = getDivisionSortPriority(divisionA);
        const priorityB = getDivisionSortPriority(divisionB);

        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }

        // Within same division, sort by game title
        const gameA = (a.GameTitle || '').toLowerCase();
        const gameB = (b.GameTitle || '').toLowerCase();

        if (gameA !== gameB) {
            return gameA.localeCompare(gameB);
        }

        // Within same game, sort by team creation date
        if (a.created_at && b.created_at) {
            return new Date(a.created_at) - new Date(b.created_at);
        }

        return 0;
    });
}

/**
 * Render teams sidebar with game grouping (for "All Teams" view)
 * Groups teams by game and adds collapse/expand functionality
 *
 * @param {Array} teams - Array of team objects to render
 */
function renderTeamsSidebarWithGroups(teams) {
    const sidebarList = document.getElementById('teamsSidebarList');
    sidebarList.innerHTML = '';

    // Set data attribute for CSS targeting
    const sidebar = document.querySelector('.teams-sidebar');
    if (sidebar) {
        sidebar.setAttribute('data-view', currentView || 'all');
    }

    // If not in "all" view, use standard rendering (no game grouping)
    if (currentView !== 'all') {
        // Sort teams by division even in other views
        const sortedTeams = sortTeamsByDivision(teams);
        originalRenderTeamsSidebar(sortedTeams);
        return;
    }

    // Sort teams by division FIRST
    const sortedTeams = sortTeamsByDivision(teams);

    // Group teams by game (now already sorted by division)
    const gameGroups = {};
    sortedTeams.forEach(team => {
        const gameId = team.gameID;
        const gameTitle = team.GameTitle || 'Unknown Game';

        if (!gameGroups[gameId]) {
            gameGroups[gameId] = {
                gameId: gameId,
                gameTitle: gameTitle,
                division: team.division || 'Other', // Store division for reference
                hasGameImage: team.has_game_image,
                teams: []
            };
        }
        gameGroups[gameId].teams.push(team);
    });

    // Convert to array and sort by division
    // Sort game groups by their division before rendering
    const sortedGroups = Object.values(gameGroups).sort((a, b) => {
        const priorityA = getDivisionSortPriority(a.division);
        const priorityB = getDivisionSortPriority(b.division);

        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }

        // Within same division, sort alphabetically by game title
        return a.gameTitle.localeCompare(b.gameTitle);
    });

    // Get collapsed state
    const collapsedGames = getCollapsedGames();

    // Render each game group (now in proper division order)
    sortedGroups.forEach(group => {
        const isCollapsed = collapsedGames.has(group.gameId.toString());

        if (isCollapsed) {
            // Render collapsed folder
            renderCollapsedGameFolder(group, sidebarList);
        } else {
            // Render expanded game group
            renderExpandedGameGroup(group, sidebarList);
        }
    });
}

/**
 * Render a collapsed game folder
 * Shows just the game name and team count with game logo
 *
 * @param {Object} group - Game group object
 * @param {HTMLElement} container - Container to append to
 */
function renderCollapsedGameFolder(group, container) {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'game-folder-collapsed';
    folderDiv.setAttribute('data-game-id', group.gameId);

    // Check if any team in this group is selected
    const hasSelectedTeam = group.teams.some(t => t.TeamID === currentSelectedTeamId);
    if (hasSelectedTeam) {
        folderDiv.classList.add('active');
    }

    const teamCount = group.teams.length;
    const teamWord = teamCount === 1 ? 'team' : 'teams';

    // Build game icon HTML - use actual game image if available
    let gameIconHTML;
    if (group.gameId && group.hasGameImage) {
        gameIconHTML = `
            <img src="/game-image/${group.gameId}"
                 alt="${group.gameTitle}"
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
 * Adds collapse button to first team
 *
 * @param {Object} group - Game group object
 * @param {HTMLElement} container - Container to append to
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

        // Check if selected
        if (team.TeamID === currentSelectedTeamId) {
            teamItem.classList.add('active');
        }

        // Check if current user is the GM for THIS specific game
        const isGameManager = team.gm_id && team.gm_id === window.currentUserId;

        // Add collapse button to FIRST team in the group
        const collapseBtn = index === 0 ? `
            <button class="team-collapse-btn"
                    onclick="event.stopPropagation(); toggleGameCollapse('${group.gameId}')"
                    title="Collapse ${group.gameTitle} teams">
                <i class="fas fa-chevron-up"></i>
            </button>
        ` : '';

        // Build team item HTML
        teamItem.innerHTML = `
            ${collapseBtn}
            <div class="team-sidebar-content" onclick="selectTeam('${team.TeamID}')">
                <div class="team-sidebar-name">${team.teamName}</div>
                <div class="team-sidebar-game">${team.GameTitle || 'Unknown Game'}</div>
                <div class="team-sidebar-meta">
                    <span><i class="fas fa-users"></i> ${team.member_count || 0}</span>
                    <span><i class="fas fa-trophy"></i> ${team.teamMaxSize}</span>
                </div>
            </div>
            ${isGameManager ? `
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
 * Override the original renderTeamsSidebar to use grouping when appropriate
 */
const originalRenderTeamsSidebar = renderTeamsSidebar;
renderTeamsSidebar = function(teams) {
    // Use grouped rendering for "all" view, standard for others
    if (currentView === 'all') {
        renderTeamsSidebarWithGroups(teams);
    } else {
        originalRenderTeamsSidebar(teams);
    }
};

/**
 * Updated original render function to use division sorting
 * This is used for "manage" and "play" views
 */
const originalRenderTeamsSidebarBackup = originalRenderTeamsSidebar;

function updatedOriginalRenderTeamsSidebar(teams) {
    const sidebarList = document.getElementById('teamsSidebarList');
    sidebarList.innerHTML = '';

    // Sort by division first
    const sortedTeams = sortTeamsByDivision(teams);

    sortedTeams.forEach(team => {
        const teamItem = document.createElement('div');
        teamItem.className = 'team-sidebar-item';
        teamItem.setAttribute('data-team-id', team.TeamID);
        teamItem.setAttribute('data-gm-id', team.gm_id || '');

        const isGameManager = team.gm_id && team.gm_id === window.currentUserId;

        teamItem.innerHTML = `
            <div class="team-sidebar-content" onclick="selectTeam('${team.TeamID}')">
                <div class="team-sidebar-name">${team.teamName}</div>
                <div class="team-sidebar-game">${team.GameTitle || 'Unknown Game'}</div>
                <div class="team-sidebar-meta">
                    <span><i class="fas fa-users"></i> ${team.member_count || 0}</span>
                    <span><i class="fas fa-trophy"></i> ${team.teamMaxSize}</span>
                </div>
            </div>
            ${isGameManager ? `
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

/**
 * TEAMS DIVISION FILTER - ADMIN ONLY
 * Adds division-based filtering for admin users
 */

// ============================================
// DIVISION FILTER STATE
// ============================================

const DIVISION_FILTER_KEY = 'teams_selected_division';

/**
 * Get currently selected division filter
 * @returns {string|null} Division name or null
 */
function getSelectedDivisionFilter() {
    return sessionStorage.getItem(DIVISION_FILTER_KEY);
}

/**
 * Set division filter
 * @param {string|null} division - Division to filter by, or null to clear
 */
function setSelectedDivisionFilter(division) {
    if (division) {
        sessionStorage.setItem(DIVISION_FILTER_KEY, division);
    } else {
        sessionStorage.removeItem(DIVISION_FILTER_KEY);
    }
}

// ============================================
// DIVISION FILTER DROPDOWN
// ============================================

/**
 * Initialize division filter dropdown
 * Creates the dropdown element if it doesn't exist
 */
function initializeDivisionFilter() {
    const isAdmin = window.userPermissions?.is_admin || false;
    if (!isAdmin) return;

    const sidebarHeaderTop = document.querySelector('.sidebar-header-top');
    if (!sidebarHeaderTop) return;

    // Check if dropdown already exists
    let divisionFilterContainer = document.getElementById('divisionFilterContainer');

    if (!divisionFilterContainer) {
        // Create container
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

        // Insert after the sidebar-header-top div (so it's on its own row)
        if (sidebarHeaderTop.parentNode) {
            sidebarHeaderTop.parentNode.insertBefore(divisionFilterContainer, sidebarHeaderTop.nextSibling);
        }

        // Attach change handler
        const divisionSelect = document.getElementById('divisionFilterSelect');
        if (divisionSelect) {
            divisionSelect.addEventListener('change', handleDivisionFilterChange);
        }
    }

    // Show division filter if currently in division view
    if (currentView === 'division') {
        showDivisionFilterDropdown();

        // Restore saved division selection
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

    // Save selection
    setSelectedDivisionFilter(selectedDivision || null);

    // Reset selected team
    currentSelectedTeamId = null;
    document.getElementById('teamsWelcomeState').style.display = 'flex';
    document.getElementById('teamsDetailContent').style.display = 'none';

    // Reload teams with filter
    loadTeams();
}

// ============================================
// TEAM SELECTION & DETAILS
// ============================================

/**
 * Select a team from sidebar
 * Updates UI and loads team details
 *
 * @param {string} teamId - ID of team to select
 */
async function selectTeam(teamId) {
    currentSelectedTeamId = teamId;

    // Update sidebar selection styling
    document.querySelectorAll('.team-sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-team-id="${teamId}"]`)?.classList.add('active');

    // Hide welcome state, show details
    document.getElementById('teamsWelcomeState').style.display = 'none';
    document.getElementById('teamsDetailContent').style.display = 'block';

    // Reset to Roster tab (first tab)
    document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.team-tab-panel').forEach(panel => panel.classList.remove('active'));

    const rosterTab = document.querySelector('[data-team-tab="roster"]');
    const rosterPanel = document.getElementById('rosterTabContent');
    if (rosterTab) rosterTab.classList.add('active');
    if (rosterPanel) rosterPanel.classList.add('active');

    // Clear Schedule tab content so it reloads when clicked
    const schedulePanel = document.getElementById('scheduleTabContent');
    if (schedulePanel) {
        schedulePanel.innerHTML = `
            <div class="schedule-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading schedules...</p>
            </div>
        `;
    }

    // Load team details
    await loadTeamDetails(teamId);
}

/**
 * Load detailed team information
 * Fetches and displays team data including header, stats, and roster
 *
 * @param {string} teamId - ID of team to load
 */
async function loadTeamDetails(teamId) {
    try {
        const response = await fetch(`/api/teams/${teamId}/details`);
        const data = await response.json();

        if (data.success) {
            const team = data.team;

            // ========================================
            // STORE CAN_MANAGE GLOBALLY FOR VODS
            // ========================================
            window.currentTeamCanManage = team.can_manage;


            // ========================================
            // SHOW/HIDE ADD VOD BUTTON BASED ON PERMS
            // ========================================
            const addVodBtn = document.querySelector('.btn[onclick="showAddVodModal()"]');
            if (addVodBtn) {
                addVodBtn.style.display = team.can_manage ? 'inline-flex' : 'none';
            }

            // ========================================
            // UPDATE HEADER
            // ========================================
            document.getElementById('teamDetailTitle').textContent = team.title;
            document.getElementById('teamDetailGame').textContent = `Game: ${team.game_title || 'Unknown'}`;

            const divisionElement = document.getElementById('teamDetailDivision');
            if (divisionElement) {
                if (team.division) {
                    divisionElement.textContent = `Division: ${team.division}`;
                    divisionElement.style.display = 'block';
                } else {
                    divisionElement.style.display = 'none';
                }
            }

            // Update team icon with game image
            const teamIconLarge = document.querySelector('.team-icon-large');
            if (teamIconLarge) {
                if (team.game_icon_url) {
                    teamIconLarge.innerHTML = `<img src="${team.game_icon_url}"
                                                     alt="${team.game_title}"
                                                     style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;"
                                                     onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-shield-alt\\'></i>';">`;
                } else {
                    teamIconLarge.innerHTML = '<i class="fas fa-shield-alt"></i>';
                }
            }

            // ========================================
            // UPDATE STATS
            // ========================================
            document.getElementById('teamStatMembers').textContent = team.member_count || 0;
            document.getElementById('teamStatMaxSize').textContent = team.team_max_size || 0;

            // ========================================
            // LOAD NEXT SCHEDULED EVENT
            // ========================================
            if (team.game_id) {
                loadNextScheduledEvent(teamId, team.game_id);
            } else {
                // Show empty state if no game_id
                const container = document.getElementById('nextScheduledEventContainer');
                if (container) {
                    container.innerHTML = `
                        <div class="next-scheduled-event-empty">
                            <i class="fas fa-exclamation-circle"></i>
                            <p>Team has no associated game</p>
                        </div>
                    `;
                }
            }

            // ========================================
            // CONFIGURE ACTION BUTTONS
            // ========================================
            // Show/hide buttons based on user permissions
            const isAdmin = window.userPermissions?.is_admin || false;
            const isGM = window.userPermissions?.is_gm || false;

            const addPlayerBtn = document.getElementById('addPlayerBtn');
            const deleteTeamBtn = document.getElementById('deleteTeamBtn');

            if (addPlayerBtn) {
                addPlayerBtn.style.display = (isAdmin || isGM) ? 'inline-flex' : 'none';
                addPlayerBtn.onclick = openAddTeamMembersModal;
            }

            if (deleteTeamBtn) {
                deleteTeamBtn.style.display = (isAdmin || isGM) ? 'inline-flex' : 'none';
            }

            // Initialize schedule button if function exists (from scheduled-events.js)
            if (typeof initScheduleButton === 'function') {
                await initScheduleButton(teamId, team.game_id);
            }

            // ========================================
            // LOAD ROSTER TAB (DEFAULT)
            // ========================================
            loadRosterTab(team.members || []);
        }
    } catch (error) {
        console.error('Error loading team details:', error);
    }
}

// ============================================
// NEXT SCHEDULED EVENT
// ============================================

/**
 * Load the next scheduled event for a team
 * Displays upcoming event card or empty state
 *
 * @param {string} teamId - ID of team
 * @param {string} gameId - ID of game (for filtering events)
 */
async function loadNextScheduledEvent(teamId, gameId) {
    const container = document.getElementById('nextScheduledEventContainer');

    if (!container) {
        console.error('nextScheduledEventContainer not found');
        return;
    }

    // Validate inputs
    if (!teamId || !gameId) {
        console.error('Invalid teamId or gameId:', { teamId, gameId });
        container.innerHTML = `
            <div class="next-scheduled-event-empty">
                <i class="fas fa-exclamation-circle"></i>
                <p>Invalid team or game data</p>
            </div>
        `;
        return;
    }

    // Show loading state
    container.innerHTML = `
        <div style="text-align: center; padding: 1rem; color: var(--text-secondary);">
            <i class="fas fa-spinner fa-spin"></i> Loading...
        </div>
    `;

    try {
        console.log(`Fetching scheduled event for team ${teamId}, game ${gameId}`);
        const response = await fetch(`/api/teams/${teamId}/next-scheduled-event`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Scheduled event response:', data);

        if (data.success && data.event) {
            const event = data.event;

            // Display event card (format similar to calendar's "Today's Events")
            container.innerHTML = `
                <div class="next-scheduled-event-card" onclick="openEventModal(${event.id})">
                    <div class="next-event-header">
                        <i class="fas fa-calendar-plus"></i>
                        <h4>Next Scheduled Event</h4>
                    </div>
                    <div class="next-event-content">
                        <div class="next-event-time">
                            ${event.is_all_day ?
                                '<i class="fas fa-calendar"></i> All Day' :
                                `<i class="fas fa-clock"></i> ${event.start_time}`
                            }
                        </div>
                        <div class="next-event-title">${event.name}</div>
                        <div class="next-event-date">
                            <i class="fas fa-calendar-day"></i> ${event.date}
                        </div>
                        <span class="next-event-type ${event.event_type.toLowerCase()}">${event.event_type}</span>
                    </div>
                </div>
            `;
        } else {
            // No scheduled events found
            container.innerHTML = `
                <div class="next-scheduled-event-empty">
                    <i class="fas fa-calendar-times"></i>
                    <p>No upcoming scheduled events</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading next scheduled event:', error);
        container.innerHTML = `
            <div class="next-scheduled-event-empty">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load scheduled events</p>
                <small style="color: var(--text-secondary); font-size: 0.75rem;">${error.message}</small>
            </div>
        `;
    }
}

// ============================================
// ROSTER TAB
// ============================================

/**
 * Load roster tab with team members
 * Displays member cards with avatars, badges, and remove buttons
 *
 * @param {Array} members - Array of team member objects
 */
function loadRosterTab(members) {
    const rosterList = document.getElementById('rosterMembersList');
    const rosterEmpty = document.getElementById('rosterEmpty');

    // Show empty state if no members
    if (members.length === 0) {
        rosterList.style.display = 'none';
        rosterEmpty.style.display = 'block';
        return;
    }

    // Show roster list
    rosterList.style.display = 'grid';
    rosterEmpty.style.display = 'none';
    rosterList.innerHTML = '';

    // Check if current user can manage team
    const isAdmin = window.userPermissions?.is_admin || false;
    const isGM = window.userPermissions?.is_gm || false;
    const canManage = isAdmin || isGM;

    // Create member card for each member
    members.forEach(member => {
        const memberCard = document.createElement('div');
        memberCard.className = 'roster-member-card';

        // Add data attributes for search filtering
        memberCard.setAttribute('data-member-name', member.name.toLowerCase());
        memberCard.setAttribute('data-member-username', member.username.toLowerCase());

        // ========================================
        // BUILD AVATAR
        // ========================================
        let avatarHTML;
        if (member.profile_picture) {
            avatarHTML = `<img src="${member.profile_picture}" alt="${member.name}" class="roster-member-avatar">`;
        } else {
            // Use initials as fallback
            const initials = member.name.split(' ').map(n => n[0]).join('');
            avatarHTML = `<div class="roster-member-initials">${initials}</div>`;
        }

        // ========================================
        // BUILD ROLE BADGES
        // ========================================
        let badgesHTML = '';
        if (typeof buildUniversalRoleBadges === 'function') {
            badgesHTML = buildUniversalRoleBadges({
                userId: member.id,
                roles: member.roles || [],
                contextGameId: null,
                excludeRoles: ['Player'] // Don't show Player badge for team rosters
            });
        } else if (typeof buildRoleBadges === 'function') {
            // Fallback to legacy badge function
            badgesHTML = buildRoleBadges({
                roles: member.roles || [],
                isAssignedGM: false,
                gameIconUrl: null
            });
        }

        // ========================================
        // BUILD REMOVE BUTTON (IF PERMITTED)
        // ========================================
        const removeBtn = canManage ? `
            <button class="btn-icon-danger"
                    onclick="event.stopPropagation(); confirmRemoveMemberNew('${member.id}', '${member.name.replace(/'/g, "\\'")}')"
                    title="Remove member">
                <i class="fas fa-user-minus"></i>
            </button>
        ` : '';

        // ========================================
        // ASSEMBLE MEMBER CARD
        // ========================================
        memberCard.innerHTML = `
            ${avatarHTML}
            <div class="roster-member-info">
                <div class="roster-member-name">${member.name}</div>
                <div class="roster-member-username">@${member.username}</div>
                <div class="roster-member-badges">${badgesHTML}</div>
            </div>
            <div class="roster-member-actions">
                ${removeBtn}
            </div>
        `;

        rosterList.appendChild(memberCard);
    });
}

/**
 * Filter roster members by search input
 * Searches both name and username
 */
function filterRosterMembers() {
    const searchInput = document.getElementById('rosterSearchInput');
    const filter = searchInput.value.toLowerCase();
    const memberCards = document.querySelectorAll('.roster-member-card');

    memberCards.forEach(card => {
        const name = card.getAttribute('data-member-name');
        const username = card.getAttribute('data-member-username');

        // Show card if name or username matches search
        if (name.includes(filter) || username.includes(filter)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

// ============================================
// TEAM MEMBER MANAGEMENT
// ============================================

/**
 * Open add team members modal
 * Loads available members who can be added to the team
 */
function openAddTeamMembersModal() {
    if (!currentSelectedTeamId) {
        alert('Please select a team first');
        return;
    }

    const modal = document.getElementById('addTeamMembersModal');
    if (!modal) {
        console.error('Add team members modal not found');
        return;
    }

    const loading = document.getElementById('availableMembersLoading');
    const list = document.getElementById('availableMembersList');
    const empty = document.getElementById('noAvailableMembers');
    const teamName = document.getElementById('teamDetailTitle')?.textContent || 'Team';

    // Update modal title with team name
    const teamNameElement = document.getElementById('addMembersTeamName');
    if (teamNameElement) {
        teamNameElement.textContent = teamName;
    }

    // Show modal with loading state
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    if (loading) loading.style.display = 'block';
    if (list) list.style.display = 'none';
    if (empty) empty.style.display = 'none';

    // Fetch available members
    fetch(`/api/teams/${currentSelectedTeamId}/available-members`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.members && data.members.length > 0) {
                displayAvailableMembersNew(data.members);
                if (loading) loading.style.display = 'none';
                if (list) list.style.display = 'block';
            } else {
                if (loading) loading.style.display = 'none';
                if (empty) empty.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error loading available members:', error);
            if (loading) loading.style.display = 'none';
            if (empty) empty.style.display = 'block';
        });
}

/**
 * Display available members in add modal
 * Creates selectable list with checkboxes
 *
 * @param {Array} members - Array of available member objects
 */
function displayAvailableMembersNew(members) {
    const list = document.getElementById('availableMembersList');
    list.innerHTML = '';

    members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-item';

        // Add data attributes for search filtering
        memberItem.setAttribute('data-username', member.username.toLowerCase());
        memberItem.setAttribute('data-name', member.name.toLowerCase());

        // Make the whole item clickable to toggle checkbox
        memberItem.onclick = function(e) {
            // Don't toggle if clicking the checkbox itself or badges
            if (e.target.type === 'checkbox' || e.target.closest('.role-badge')) {
                return;
            }
            const checkbox = this.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
            }
        };

        // ========================================
        // BUILD PROFILE PICTURE/INITIALS
        // ========================================
        let profilePicHTML;
        if (member.profile_picture) {
            profilePicHTML = `<img src="${member.profile_picture}" alt="${member.name}" class="member-avatar">`;
        } else {
            const initials = member.name.split(' ').map(n => n[0]).join('');
            profilePicHTML = `<div class="member-avatar-initials">${initials}</div>`;
        }

        // ========================================
        // BUILD ROLE BADGES
        // ========================================
        let badgesHTML = '';
        if (typeof buildUniversalRoleBadges === 'function') {
            badgesHTML = buildUniversalRoleBadges({
                userId: member.id,
                roles: member.roles || [],
                contextGameId: null,
                excludeRoles: ['Player']
            });
        } else if (typeof buildRoleBadges === 'function') {
            badgesHTML = buildRoleBadges({
                roles: member.roles || [],
                isAssignedGM: false,
                gameIconUrl: null
            });
        }

        // ========================================
        // ASSEMBLE MEMBER ITEM
        // ========================================
        memberItem.innerHTML = `
            <input type="checkbox"
                   id="member_${member.id}"
                   value="${member.id}">
            ${profilePicHTML}
            <div class="member-info">
                <div class="member-name">${member.name}</div>
                <div class="member-username">@${member.username}</div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                ${badgesHTML}
            </div>
        `;
        list.appendChild(memberItem);
    });
}

/**
 * Add selected members to team
 * Submits selected member IDs to backend
 */
async function addSelectedMembersToTeam() {
    const checkboxes = document.querySelectorAll('#availableMembersList input[type="checkbox"]:checked');
    const memberIds = Array.from(checkboxes).map(cb => cb.value);

    if (memberIds.length === 0) {
        alert('Please select at least one member');
        return;
    }

    try {
        const response = await fetch(`/api/teams/${currentSelectedTeamId}/add-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_ids: memberIds })
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);
            closeAddTeamMembersModal();
            // Reload team to show new members
            selectTeam(currentSelectedTeamId);
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to add members');
    }
}

/**
 * Close add members modal
 */
function closeAddTeamMembersModal() {
    const modal = document.getElementById('addTeamMembersModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Filter available members by search input
 */
function filterAvailableMembers() {
    const searchInput = document.getElementById('addMemberSearch');
    if (!searchInput) return;

    const filter = searchInput.value.toLowerCase();
    const memberItems = document.querySelectorAll('#availableMembersList .member-item');

    memberItems.forEach(item => {
        const username = item.getAttribute('data-username');
        const name = item.getAttribute('data-name');

        if (username.includes(filter) || name.includes(filter)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

/**
 * Confirm and remove member from team
 *
 * @param {string} memberId - ID of member to remove
 * @param {string} memberName - Name of member for confirmation
 */
function confirmRemoveMemberNew(memberId, memberName) {
    if (confirm(`Remove "${memberName}" from this team?`)) {
        removeMemberNew(memberId, memberName);
    }
}

/**
 * Remove member from current team
 *
 * @param {string} memberId - ID of member to remove
 * @param {string} memberName - Name of member for success message
 */
async function removeMemberNew(memberId, memberName) {
    try {
        const response = await fetch(`/api/teams/${currentSelectedTeamId}/remove-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: memberId })
        });

        const data = await response.json();

        if (data.success) {
            alert(`"${memberName}" removed successfully`);
            // Reload team to show updated roster
            selectTeam(currentSelectedTeamId);
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error removing member:', error);
        alert('Failed to remove member');
    }
}

// ============================================
// TEAM EDITING
// ============================================

/**
 * Open edit team modal
 * Loads team details and available team sizes
 *
 * @param {string} teamId - ID of team to edit
 * @param {string} teamName - Current team name
 * @param {number} currentMaxSize - Current max team size
 * @param {string} availableSizes - Comma-separated available sizes (fallback)
 */
async function openEditTeamModal(teamId, teamName, currentMaxSize, availableSizes) {
    const modal = document.getElementById('editTeamModal');
    const modalTitle = document.getElementById('editTeamModalTitle');
    const teamIdField = document.getElementById('editTeamID');
    const teamTitleInput = document.getElementById('editTeamTitle');
    const sizeContainer = document.getElementById('editTeamSizesContainer');
    const formMessage = document.getElementById('editTeamFormMessage');

    if (!modal) {
        console.error('Edit team modal not found');
        return;
    }

    // Reset form
    document.getElementById('editTeamForm').reset();
    formMessage.style.display = 'none';

    // Set basic values
    modalTitle.textContent = teamName;
    teamIdField.value = teamId;
    teamTitleInput.value = teamName;

    // Fetch team and game details to get available sizes
    try {
        const response = await fetch(`/api/teams/${teamId}/details`);
        const data = await response.json();

        if (data.success) {
            const team = data.team;

            // Get game details for available team sizes
            const gameResponse = await fetch(`/api/game/${team.game_id}/details`);
            const gameData = await gameResponse.json();

            if (gameData.success) {
                const sizes = gameData.game.team_sizes || availableSizes.split(',').map(s => s.trim());

                // Populate team size radio buttons
                sizeContainer.innerHTML = '';
                sizeContainer.className = 'team-size-options';

                sizes.forEach((size) => {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'team-size-option';

                    const radioId = `editTeamSize${size}`;
                    const isSelected = parseInt(size) === parseInt(currentMaxSize);
                    const playerText = size === 1 ? 'player' : 'players';

                    optionDiv.innerHTML = `
                        <input type="radio"
                               name="team_sizes"
                               value="${size}"
                               id="${radioId}"
                               ${isSelected ? 'checked' : ''}>
                        <label for="${radioId}">
                            <div class="size-content">
                                <i class="fas fa-users size-icon"></i>
                                <div class="size-text">
                                    <span class="size-number">${size} ${size == 1 ? 'Player' : 'Players'}</span>
                                    <span class="size-description">Maximum ${size} ${playerText} per team</span>
                                </div>
                            </div>
                        </label>
                    `;

                    sizeContainer.appendChild(optionDiv);
                });
            }
        }
    } catch (error) {
        console.error('Error loading team details for edit:', error);
        alert('Failed to load team information. Please try again.');
        return;
    }

    // Show modal
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Close edit team modal
 */
function closeEditTeamModal() {
    const modal = document.getElementById('editTeamModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Setup edit team form submission handler
 * Called on page load
 */
function setupEditTeamForm() {
    const editTeamForm = document.getElementById('editTeamForm');
    if (!editTeamForm) return;

    editTeamForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const submitBtn = editTeamForm.querySelector('button[type="submit"]');
        const submitBtnText = document.getElementById('updateTeamBtnText');
        const submitBtnSpinner = document.getElementById('updateTeamBtnSpinner');
        const formMessage = document.getElementById('editTeamFormMessage');

        // Show loading state
        submitBtn.disabled = true;
        submitBtnText.style.display = 'none';
        submitBtnSpinner.style.display = 'inline-block';

        // Get form values
        const teamId = document.getElementById('editTeamID').value;
        const teamTitle = document.getElementById('editTeamTitle').value;

        const selectedSize = document.querySelector('input[name="team_sizes"]:checked');
        if (!selectedSize) {
            formMessage.textContent = 'Please select a team size.';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';

            submitBtn.disabled = false;
            submitBtnText.style.display = 'inline';
            submitBtnSpinner.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`/api/teams/${teamId}/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    team_title: teamTitle,
                    team_max_size: selectedSize.value
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                formMessage.textContent = data.message || 'Team updated successfully!';
                formMessage.className = 'form-message success';
                formMessage.style.display = 'block';

                setTimeout(() => {
                    closeEditTeamModal();
                    // Reload teams and re-select the current team
                    loadTeams().then(() => {
                        selectTeam(teamId);
                    });
                }, 1500);
            } else {
                throw new Error(data.message || 'Failed to update team');
            }
        } catch (error) {
            formMessage.textContent = error.message || 'Failed to update team. Please try again.';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';

            submitBtn.disabled = false;
            submitBtnText.style.display = 'inline';
            submitBtnSpinner.style.display = 'none';
        }
    });
}

// ============================================
// TEAM DELETION
// ============================================

/**
 * Confirm and delete selected team
 */
function confirmDeleteSelectedTeam() {
    if (!currentSelectedTeamId) return;

    const teamName = document.getElementById('teamDetailTitle').textContent;
    if (confirm(`Are you sure you want to delete "${teamName}"?\n\nThis action cannot be undone.`)) {
        deleteTeamNew(currentSelectedTeamId);
    }
}

/**
 * Delete team
 *
 * @param {string} teamId - ID of team to delete
 */
async function deleteTeamNew(teamId) {
    try {
        const response = await fetch('/delete-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_id: teamId })
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);
            // Reset selection and show welcome state
            currentSelectedTeamId = null;
            document.getElementById('teamsWelcomeState').style.display = 'flex';
            document.getElementById('teamsDetailContent').style.display = 'none';
            // Reload teams list
            loadTeams();
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error deleting team:', error);
        alert('Failed to delete team');
    }
}

// ============================================
// TAB SWITCHING
// ============================================

/**
 * Initialize tab switching and other event listeners
 */
document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // TAB SWITCHING
    // ========================================
    document.querySelectorAll('.team-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-team-tab');

            // Update active tab styling
            document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // Update active panel
            document.querySelectorAll('.team-tab-panel').forEach(panel => panel.classList.remove('active'));
            document.getElementById(`${targetTab}TabContent`)?.classList.add('active');

            // Load tab-specific data when needed
            if (targetTab === 'schedule' && currentSelectedTeamId) {
                // Load schedule data (handled by scheduled-events.js)
                loadScheduleTab(currentSelectedTeamId);
            }

            if (targetTab === 'stats' && currentSelectedTeamId) {
                // Load stats data
                const team = allTeamsData.find(t => t.TeamID === currentSelectedTeamId);
                if (team && team.gameID) {
                    loadStatsTab(currentSelectedTeamId, team.gameID);
                }
            }

            if (targetTab === 'vods' && currentSelectedTeamId) {
                // Load VODs data
                loadTeamVods(currentSelectedTeamId);
            }
        });
    });

    // ========================================
    // TEAMS TAB CLICK
    // ========================================
    // Load teams when Teams tab is clicked in main navigation
    const teamsTab = document.querySelector('[data-tab="teams"]');
    if (teamsTab) {
        teamsTab.addEventListener('click', loadTeams);
    }

    // ========================================
    // SETUP EDIT FORM
    // ========================================
    setupEditTeamForm();
});

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

/**
 * Export all functions for use by other modules and HTML onclick handlers
 */
window.loadTeams = loadTeams;
window.selectTeam = selectTeam;
window.filterRosterMembers = filterRosterMembers;
window.confirmDeleteSelectedTeam = confirmDeleteSelectedTeam;
window.confirmRemoveMemberNew = confirmRemoveMemberNew;
window.openAddTeamMembersModal = openAddTeamMembersModal;
window.addSelectedMembersToTeam = addSelectedMembersToTeam;
window.closeAddTeamMembersModal = closeAddTeamMembersModal;
window.filterAvailableMembers = filterAvailableMembers;
window.loadNextScheduledEvent = loadNextScheduledEvent;
window.openEditTeamModal = openEditTeamModal;
window.closeEditTeamModal = closeEditTeamModal;
window.toggleGameCollapse = toggleGameCollapse;

//Team Folders functions
window.originalRenderTeamsSidebar = updatedOriginalRenderTeamsSidebar;
window.sortTeamsByDivision = sortTeamsByDivision;
window.getDivisionSortPriority = getDivisionSortPriority;
window.renderTeamsSidebarWithGroups = renderTeamsSidebarWithGroups;

//Division viewer exports
window.initializeViewSwitcher = initializeViewSwitcher;
window.renderViewSwitcher = renderViewSwitcher;
window.handleViewChange = handleViewChange;
window.loadTeams = loadTeams;
window.getSubtitleForView = getSubtitleForView;
window.initializeDivisionFilter = initializeDivisionFilter;
window.showDivisionFilterDropdown = showDivisionFilterDropdown;
window.hideDivisionFilterDropdown = hideDivisionFilterDropdown;
window.handleDivisionFilterChange = handleDivisionFilterChange;