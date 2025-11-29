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

// GM assignment
window.openAssignGMModal = openAssignGMModal;
window.closeAssignGMModal = closeAssignGMModal;
window.confirmAssignGM = confirmAssignGM;
window.removeGameManager = removeGameManager;

// User's communities (profile tab)
window.loadMyCommunities = loadMyCommunities;