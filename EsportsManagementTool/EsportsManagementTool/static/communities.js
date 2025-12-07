/**
 * communities.js
 * ============================================================================
 * Handles community-specific functionality including:
 * - Community membership (join/leave)
 * - GM assignment and management
 * - User's communities display (profile tab)
 * - Community member filtering
 *
 * ORGANIZED BY CLAUDE AI
 * ============================================================================
 */

// ============================================
// GLOBAL STATE
// ============================================

/**
 * Currently selected game ID for GM assignment operations
 * @type {number|null}
 */
let currentGameIdForGM = null;

// ============================================
// MODULE INITIALIZATION
// ============================================

/**
 * Initialize communities module
 * Sets up event listeners for profile tab
 * Called on DOMContentLoaded
 */
function initializeCommunitiesModule() {
    console.log('Communities module initialized');

    // Load communities in profile tab
    const profileTab = document.querySelector('[data-tab="profile"]');
    if (profileTab) {
        profileTab.addEventListener('click', loadMyCommunities);
    }

    // Handle mobile dropdown tab selection for profile
    const tabDropdown = document.getElementById('tabDropdown');
    if (tabDropdown) {
        tabDropdown.addEventListener('change', function(e) {
            if (e.target.value === 'profile') {
                loadMyCommunities();
            }
        });
    }
}

// ============================================
// COMMUNITY MEMBERSHIP - JOIN/LEAVE
// ============================================

/**
 * Confirm joining a game community
 * Shows confirmation modal with community benefits
 * @param {number} gameId - Game ID to join
 * @param {string} gameTitle - Game title for display
 */
function confirmJoinGame(gameId, gameTitle) {
    const modal = createConfirmModal(
        'Join Community',
        gameTitle,
        [
            'You can be assigned to a team',
            'You can view this game\'s schedule',
            'You can view exclusive events'
        ],
        'You can always leave later if you change your mind.',
        'success',
        () => joinGame(gameId, gameTitle)
    );

    document.body.appendChild(modal);
}

/**
 * Confirm leaving a game community
 * Shows warning modal about losing access
 * @param {number} gameId - Game ID to leave
 * @param {string} gameTitle - Game title for display
 */
function confirmLeaveGame(gameId, gameTitle) {
    const modal = createConfirmModal(
        'Leave Community',
        gameTitle,
        [
            'You\'ll no longer be able to join a team',
            'You won\'t see this game\'s schedule',
            'You won\'t see this game\'s exclusive events'
        ],
        'You can always rejoin if you change your mind',
        'warning',
        () => leaveGame(gameId, gameTitle)
    );

    document.body.appendChild(modal);
}

/**
 * Create a confirmation modal
 * @param {string} title - Modal title
 * @param {string} gameTitle - Game title
 * @param {Array} benefits - List of points to display
 * @param {string} note - Bottom note text
 * @param {string} type - 'success' or 'warning'
 * @param {Function} onConfirm - Callback function on confirm
 * @returns {HTMLElement} Modal element
 */
function createConfirmModal(title, gameTitle, benefits, note, type, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.id = 'confirmJoinModal';

    const icon = type === 'success' ? 'fa-user-plus' : 'fa-sign-out-alt';
    const headerColor = type === 'success' ? '' : 'style="background-color: #ff9800;"';
    const btnClass = type === 'success' ? 'btn-success' : 'btn-warning';
    const btnIcon = type === 'success' ? 'fa-check' : 'fa-sign-out-alt';
    const btnText = type === 'success' ? 'Join' : 'Leave';

    // Build benefits list
    const benefitsList = benefits.map(b => `<li>${b}</li>`).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header" ${headerColor}>
                <h2><i class="fas ${icon}"></i> ${title}</h2>
            </div>
            <div class="modal-body">
                <p>Would you like to ${type === 'success' ? 'join' : 'leave'} the <strong>${gameTitle}</strong> community?</p>
                <ul style="margin: 1rem 0; padding-left: 1.5rem; color: var(--text-primary); line-height: 1.6;">
                    ${benefitsList}
                </ul>
                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 1rem;">
                    ${note}
                </p>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="closeConfirmModal()">Cancel</button>
                <button class="btn ${btnClass}" onclick="confirmModalAction()">
                    <i class="fas ${btnIcon}"></i> ${btnText}
                </button>
            </div>
        </div>
    `;

    // Store callback on modal element
    modal._confirmCallback = onConfirm;

    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeConfirmModal();
    });

    return modal;
}

/**
 * Execute the confirm action stored in the modal
 */
function confirmModalAction() {
    const modal = document.getElementById('confirmJoinModal');
    if (modal && modal._confirmCallback) {
        modal._confirmCallback();
    }
}

/**
 * Close confirmation modal
 */
function closeConfirmModal() {
    const modal = document.getElementById('confirmJoinModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * Join a game community
 * Makes API request and updates UI on success
 * @param {number} gameId - Game ID to join
 * @param {string} gameTitle - Game title for display
 */
async function joinGame(gameId, gameTitle) {
    closeConfirmModal();

    try {
        const response = await fetch(`/api/game/${gameId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);

            // Close game details modal if open
            if (typeof closeGameDetailsModal === 'function') {
                closeGameDetailsModal();
            }

            // Reload games to update UI
            if (typeof loadGames === 'function') {
                loadGames();
            }
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error joining community:', error);
        alert('Failed to join community. Please try again.');
    }
}

/**
 * Leave a game community
 * Makes API request and updates UI on success
 * @param {number} gameId - Game ID to leave
 * @param {string} gameTitle - Game title for display
 */
async function leaveGame(gameId, gameTitle) {
    closeConfirmModal();

    try {
        const response = await fetch(`/api/game/${gameId}/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);

            // Close game details modal if open
            if (typeof closeGameDetailsModal === 'function') {
                closeGameDetailsModal();
            }

            // Reload games to update UI
            if (typeof loadGames === 'function') {
                loadGames();
            }
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error leaving community:', error);
        alert('Failed to leave community. Please try again.');
    }
}

// ============================================
// DIVISION FOLDER SYSTEM FOR COMMUNITIES
// ============================================

const COLLAPSED_DIVISIONS_KEY = 'communities_collapsed_divisions';

/**
 * Get set of collapsed division names from sessionStorage
 * @returns {Set<string>}
 */
function getCollapsedDivisions() {
    const stored = sessionStorage.getItem(COLLAPSED_DIVISIONS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
}

/**
 * Save collapsed divisions to sessionStorage
 * @param {Set<string>} collapsedDivisions
 */
function saveCollapsedDivisions(collapsedDivisions) {
    sessionStorage.setItem(COLLAPSED_DIVISIONS_KEY, JSON.stringify([...collapsedDivisions]));
}

/**
 * Toggle collapse state for a division
 * @param {string} division - Name of division to toggle
 */
function toggleDivisionCollapse(division) {
    const collapsedDivisions = getCollapsedDivisions();

    if (collapsedDivisions.has(division)) {
        collapsedDivisions.delete(division);
    } else {
        collapsedDivisions.add(division);
    }

    saveCollapsedDivisions(collapsedDivisions);

    // Re-render communities with updated collapse state
    const currentGames = window.currentGamesData || [];
    if (currentGames.length > 0) {
        displayGamesWithDivisions(currentGames);
    }
}

// ============================================
// DISPLAY GAMES WITH DIVISION GROUPING
// ============================================

/**
 * Display games grouped by division with collapsible folders
 * Replaces the original displayGames function
 * @param {Array} games - Array of game objects from API
 */
function displayGamesWithDivisions(games) {
    const gridDiv = document.getElementById('rostersGrid');
    gridDiv.className = 'rosters-grid-divisions'; // New class for division layout
    gridDiv.innerHTML = '';

    // Store games data globally for re-rendering
    window.currentGamesData = games;

    // Check if current user is admin for delete permissions
    const isAdmin = window.userPermissions?.is_admin || false;

    // Group games by division
    const divisionGroups = {};
    games.forEach(game => {
        const division = game.Division || 'Other';

        if (!divisionGroups[division]) {
            divisionGroups[division] = [];
        }
        divisionGroups[division].push(game);
    });

    // Define division order
    const divisionOrder = ['Strategy', 'Shooter', 'Sports', 'Other'];

    // Sort divisions by defined order
    const sortedDivisions = Object.keys(divisionGroups).sort((a, b) => {
        const indexA = divisionOrder.indexOf(a);
        const indexB = divisionOrder.indexOf(b);

        // If both are in the order array, sort by index
        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }
        // If only one is in the order array, it comes first
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        // If neither is in the order array, sort alphabetically
        return a.localeCompare(b);
    });

    // Get collapsed state
    const collapsedDivisions = getCollapsedDivisions();

    // Render each division group
    sortedDivisions.forEach(division => {
        const gamesInDivision = divisionGroups[division];
        const isCollapsed = collapsedDivisions.has(division);

        if (isCollapsed) {
            // Render collapsed folder
            renderCollapsedDivision(division, gamesInDivision.length, gridDiv);
        } else {
            // Render expanded division with games
            renderExpandedDivision(division, gamesInDivision, isAdmin, gridDiv);
        }
    });
}

/**
 * Render a collapsed division folder
 * @param {string} division - Division name
 * @param {number} gameCount - Number of games in division
 * @param {HTMLElement} container - Container to append to
 */
function renderCollapsedDivision(division, gameCount, container) {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'division-folder-collapsed';
    folderDiv.setAttribute('data-division', division);

    const gameWord = gameCount === 1 ? 'game' : 'games';

    // Get division icon
    const divisionIcon = getDivisionIcon(division);

    folderDiv.innerHTML = `
        <div class="division-folder-header">
            <button class="division-collapse-btn"
                    onclick="toggleDivisionCollapse('${division}')"
                    title="Expand ${division}">
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="division-folder-info">
                <div class="division-icon">${divisionIcon}</div>
                <div class="division-details">
                    <h3 class="division-name">${division}</h3>
                    <p class="division-count">${gameCount} ${gameWord}</p>
                </div>
            </div>
        </div>
    `;

    container.appendChild(folderDiv);
}

/**
 * Render an expanded division with all games
 * @param {string} division - Division name
 * @param {Array} games - Games in this division
 * @param {boolean} isAdmin - Whether current user is admin
 * @param {HTMLElement} container - Container to append to
 */
function renderExpandedDivision(division, games, isAdmin, container) {
    const divisionBox = document.createElement('div');
    divisionBox.className = 'division-box-expanded';
    divisionBox.setAttribute('data-division', division);

    // Get division icon
    const divisionIcon = getDivisionIcon(division);

    // Build division header
    const headerHTML = `
        <div class="division-box-header">
            <button class="division-collapse-btn"
                    onclick="toggleDivisionCollapse('${division}')"
                    title="Collapse ${division}">
                <i class="fas fa-chevron-up"></i>
            </button>
            <div class="division-icon">${divisionIcon}</div>
            <h3 class="division-name">${division}</h3>
        </div>
    `;

    // Build games grid
    const gamesGrid = document.createElement('div');
    gamesGrid.className = 'division-games-grid';

    games.forEach(game => {
        const card = createGameCard(game, isAdmin);
        gamesGrid.appendChild(card);
    });

    // Assemble division box
    divisionBox.innerHTML = headerHTML;
    divisionBox.appendChild(gamesGrid);

    container.appendChild(divisionBox);
}

/**
 * Get icon for division
 * @param {string} division - Division name
 * @returns {string} HTML for icon
 */
function getDivisionIcon(division) {
    const icons = {
        'Strategy': '<i class="fas fa-chess"></i>',
        'Shooter': '<i class="fas fa-crosshairs"></i>',
        'Sports': '<i class="fas fa-football-ball"></i>',
        'Other': '<i class="fas fa-star"></i>'
    };

    return icons[division] || '<i class="fas fa-gamepad"></i>';
}

/**
 * Create a game card element
 * (Using existing createGameCard function from game.js, but included here for reference)
 * This is the same as before, no changes needed
 */
function createGameCard(game, isAdmin) {
    const card = document.createElement('div');
    card.className = 'roster-card';

    const memberCount = game.member_count || 0;
    const teamCount = game.team_count || 0;
    const isMember = game.is_member || false;
    const isGameManager = game.is_game_manager || false;

    const iconHTML = game.ImageURL
        ? `<img src="${game.ImageURL}"
                alt="${game.GameTitle}"
                class="roster-game-image"
                onerror="this.onerror=null; this.parentElement.innerHTML='<i class=&quot;fas fa-gamepad&quot;></i>';">`
        : `<i class="fas fa-gamepad"></i>`;

    const deleteButtonHTML = isAdmin
        ? `<button class="game-delete-btn"
                    onclick="confirmDeleteGame(${game.GameID}, '${escapeHtml(game.GameTitle)}')"
                    title="Delete game">
                <i class="fas fa-trash"></i>
           </button>`
        : '';

    const joinButtonHTML = isMember
        ? `<button class="btn btn-secondary"
                    onclick="confirmLeaveGame(${game.GameID}, '${escapeHtml(game.GameTitle)}')">
                <i class="fas fa-sign-out-alt"></i> Leave Community
           </button>`
        : `<button class="btn btn-success"
                    onclick="confirmJoinGame(${game.GameID}, '${escapeHtml(game.GameTitle)}')">
                <i class="fas fa-user-plus"></i> Join Community
           </button>`;

    const createTeamButtonHTML = isGameManager
        ? `<button class="btn btn-primary"
                    onclick="openCreateTeamModal(${game.GameID}, '${escapeHtml(game.GameTitle)}', '${game.TeamSizes}')">
                <i class="fas fa-plus"></i> Create Team
           </button>`
        : '';

    const memberBadge = isMember
        ? `<span class="member-badge">
                <i class="fas fa-check-circle"></i> Joined
           </span>`
        : '';

    card.innerHTML = `
        ${deleteButtonHTML}
        <div class="roster-card-header">
            <div class="roster-icon">
                ${iconHTML}
            </div>
            <h3 class="roster-card-title">
                ${game.GameTitle}
                ${memberBadge}
            </h3>
        </div>
        <p class="roster-card-description">${game.Description}</p>

        <div class="roster-card-meta">
            <div class="roster-stat">
                <i class="fas fa-users roster-stat-icon"></i>
                <div class="roster-stat-number">${memberCount}</div>
                <div class="roster-stat-label">Members</div>
            </div>
            <div class="roster-stat">
                <i class="fas fa-shield-alt roster-stat-icon"></i>
                <div class="roster-stat-number">${teamCount}</div>
                <div class="roster-stat-label">Teams</div>
            </div>
        </div>

        <div class="roster-card-actions">
            <button class="btn btn-primary" onclick="openGameDetailsModal(${game.GameID})">
                <i class="fas fa-eye"></i> View Details
            </button>
            ${joinButtonHTML}
            ${createTeamButtonHTML}
        </div>
    `;

    return card;
}

/**
 * Escape HTML (same as before)
 */
function escapeHtml(text) {
    const map = {
        "'": "\\'",
        '"': '&quot;',
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;'
    };
    return text.replace(/['&<>"]/g, m => map[m]);
}

// ============================================
// OVERRIDE ORIGINAL DISPLAY FUNCTION
// ============================================

// Store original loadGames if it exists
const originalLoadGames = window.loadGames;

/**
 * Updated loadGames to use division grouping
 */
async function loadGames() {
    const loadingDiv = document.getElementById('rostersLoading');
    const gridDiv = document.getElementById('rostersGrid');
    const emptyDiv = document.getElementById('rostersEmpty');

    loadingDiv.style.display = 'block';
    gridDiv.style.display = 'none';
    emptyDiv.style.display = 'none';

    try {
        const response = await fetch('/games');
        const data = await response.json();

        if (data.success && data.games && data.games.length > 0) {
            // Use division grouping display
            displayGamesWithDivisions(data.games);
            loadingDiv.style.display = 'none';
            gridDiv.style.display = 'block';
        } else {
            loadingDiv.style.display = 'none';
            emptyDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading games:', error);
        loadingDiv.style.display = 'none';
        emptyDiv.style.display = 'block';
    }
}

// ============================================
// GM ASSIGNMENT FUNCTIONALITY
// ============================================

/**
 * Open assign GM modal
 * Shows list of available GMs for assignment
 * @param {number} gameId - Game ID to assign GM to
 */
async function openAssignGMModal(gameId) {
    currentGameIdForGM = gameId;
    const modal = document.getElementById('assignGMModal');
    const loading = document.getElementById('gmListLoading');
    const container = document.getElementById('gmListContainer');
    const empty = document.getElementById('gmListEmpty');
    const gmList = document.getElementById('gmList');

    // Show modal and loading state
    modal.style.display = 'block';
    loading.style.display = 'block';
    container.style.display = 'none';
    empty.style.display = 'none';
    document.body.style.overflow = 'hidden';

    try {
        // Fetch available GMs from API
        const response = await fetch(`/api/game/${gameId}/available-gms`);
        const data = await response.json();

        if (data.success && data.game_managers.length > 0) {
            // Display list of available GMs
            gmList.innerHTML = '';

            data.game_managers.forEach(gm => {
                const gmItem = createGMSelectionItem(gm, gameId);
                gmList.appendChild(gmItem);
            });

            loading.style.display = 'none';
            container.style.display = 'block';
        } else {
            // No GMs available
            loading.style.display = 'none';
            empty.style.display = 'block';
        }
    } catch (error) {
        // Handle errors
        console.error('Error loading GMs:', error);
        loading.innerHTML = '<p style="color: #ff5252;">Failed to load Game Managers</p>';
    }
}

/**
 * Create a GM selection item element
 * @param {Object} gm - GM user object
 * @param {number} gameId - Game ID for assignment
 * @returns {HTMLElement} GM selection item element
 */
function createGMSelectionItem(gm, gameId) {
    const gmItem = document.createElement('div');
    gmItem.className = 'gm-selection-item';
    gmItem.onclick = () => confirmAssignGM(gameId, gm.id, gm.name);

    // Profile picture or initials
    let profilePicHTML;
    if (gm.profile_picture) {
        profilePicHTML = `<img src="${gm.profile_picture}" alt="${gm.name}" class="member-avatar">`;
    } else {
        const initials = gm.name.split(' ').map(n => n[0]).join('');
        profilePicHTML = `<div class="member-avatar-initials">${initials}</div>`;
    }

    gmItem.innerHTML = `
        ${profilePicHTML}
        <div class="member-info">
            <div class="member-name">${gm.name}</div>
            <div class="member-username">@${gm.username}</div>
        </div>
        <i class="fas fa-chevron-right" style="margin-left: auto; color: var(--text-secondary);"></i>
    `;

    return gmItem;
}

/**
 * Close assign GM modal
 */
function closeAssignGMModal() {
    const modal = document.getElementById('assignGMModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentGameIdForGM = null;
}

/**
 * Confirm GM assignment
 * Shows confirmation and makes API request
 * @param {number} gameId - Game ID
 * @param {number} gmUserId - User ID of GM to assign
 * @param {string} gmName - GM name for display
 */
async function confirmAssignGM(gameId, gmUserId, gmName) {
    if (!confirm(`Assign ${gmName} as the Game Manager for this community?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/game/${gameId}/assign-gm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gm_user_id: gmUserId })
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);
            closeAssignGMModal();

            // Refresh the game details modal if function exists
            if (typeof openGameDetailsModal === 'function') {
                openGameDetailsModal(gameId);
            }

            // Refresh GM mappings for badge display if function exists
            if (typeof refreshGMGameMappings === 'function') {
                await refreshGMGameMappings();
            }
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error assigning GM:', error);
        alert('Failed to assign Game Manager');
    }
}

/**
 * Remove GM assignment from a game
 * Shows confirmation and makes API request
 * @param {number} gameId - Game ID to remove GM from
 */
async function removeGameManager(gameId) {
    if (!confirm('Remove the Game Manager assignment from this community?')) {
        return;
    }

    try {
        const response = await fetch(`/api/game/${gameId}/remove-gm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);

            // Refresh the game details modal if function exists
            if (typeof openGameDetailsModal === 'function') {
                openGameDetailsModal(gameId);
            }

            // Refresh GM mappings for badge display if function exists
            if (typeof refreshGMGameMappings === 'function') {
                await refreshGMGameMappings();
            }
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error removing GM:', error);
        alert('Failed to remove Game Manager');
    }
}

// ============================================
// USER'S COMMUNITIES (PROFILE TAB)
// ============================================

/**
 * Load user's communities for profile tab
 * Displays all communities the user has joined
 */
async function loadMyCommunities() {
    const loading = document.getElementById('myCommunitiesLoading');
    const grid = document.getElementById('myCommunitiesGrid');
    const empty = document.getElementById('myCommunitiesEmpty');

    // Show loading state
    loading.style.display = 'block';
    grid.style.display = 'none';
    empty.style.display = 'none';

    try {
        // Fetch user's communities from API
        const response = await fetch('/api/user/communities');
        const data = await response.json();

        if (data.success && data.communities.length > 0) {
            // Display communities in grid
            grid.innerHTML = '';

            data.communities.forEach(community => {
                const card = createCommunityCard(community);
                grid.appendChild(card);
            });

            loading.style.display = 'none';
            grid.style.display = 'grid';
        } else {
            // No communities, show empty state
            loading.style.display = 'none';
            empty.style.display = 'block';
        }
    } catch (error) {
        // Handle errors
        console.error('Error loading communities:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
    }
}

/**
 * Create a community card element for profile tab
 * @param {Object} community - Community object
 * @returns {HTMLElement} Community card element
 */
function createCommunityCard(community) {
    const card = document.createElement('div');
    card.className = 'community-card-small';

    // Community icon
    let iconHTML;
    if (community.image_url) {
        iconHTML = `<img src="${community.image_url}" alt="${community.title}" class="community-icon-small">`;
    } else {
        iconHTML = '<i class="fas fa-gamepad"></i>';
    }

    card.innerHTML = `
        <div class="community-icon-container">${iconHTML}</div>
        <div class="community-info-small">
            <h4>${community.title}</h4>
            <p class="community-meta">
                <i class="fas fa-users"></i> ${community.member_count} members
            </p>
            <p class="community-joined">Joined ${community.joined_at}</p>
        </div>
        <button class="btn btn-sm btn-primary" onclick="openGameDetailsModal(${community.id})">
            <i class="fas fa-eye"></i> View
        </button>
    `;

    return card;
}

// ============================================
// INITIALIZE ON DOM LOAD
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    initializeCommunitiesModule();
});

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

// Module initialization
window.initializeCommunitiesModule = initializeCommunitiesModule;

// Community membership
window.confirmJoinGame = confirmJoinGame;
window.confirmLeaveGame = confirmLeaveGame;
window.joinGame = joinGame;
window.leaveGame = leaveGame;
window.closeConfirmModal = closeConfirmModal;
window.confirmModalAction = confirmModalAction;

//Folder system
window.loadGames = loadGames;
window.toggleDivisionCollapse = toggleDivisionCollapse;
window.displayGamesWithDivisions = displayGamesWithDivisions;

// GM assignment
window.openAssignGMModal = openAssignGMModal;
window.closeAssignGMModal = closeAssignGMModal;
window.confirmAssignGM = confirmAssignGM;
window.removeGameManager = removeGameManager;

// User's communities (profile tab)
window.loadMyCommunities = loadMyCommunities;