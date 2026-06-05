/**
 * ============================================================================
 * Handles community-specific functionality including:
 * - Community membership (join/leave)
 * - GM assignment and management
 * - User's communities display (profile tab)
 * ============================================================================
 */

// Currently selected game ID for GM assignment operations
let currentGameIdForGM = null;

/**
 * Initialize communities module
 * Sets up event listeners for profile tab
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

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function() {
    initializeCommunitiesModule();
});

// ============================================
// COMMUNITY MEMBERSHIP - JOIN/LEAVE
// ============================================

// Confirm joining a game community with confirmation modal
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

// Confirm leaving a game community
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

// Create a membership confirmation modal (joining or leaving)
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
                <button class="btn ${btnClass}" onclick="confirmMembershipModalAction()">
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

// Execute the confirm action stored in the modal
function confirmMembershipModalAction() {
    const modal = document.getElementById('confirmJoinModal');
    if (modal && modal._confirmCallback) {
        modal._confirmCallback();
    }
}

// Close membership confirmation modal
function closeConfirmModal() {
    const modal = document.getElementById('confirmJoinModal');
    if (modal) {
        modal.remove();
    }
}

// Execute joining a game community
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
            if (typeof closeCommunityModal === 'function') {
                closeCommunityModal();
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

// Execute leaving a game community
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
            if (typeof closeCommunityModal === 'function') {
                closeCommunityModal();
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
// COMMUNITY DIVISION FOLDER SYSTEM
// ============================================
const COLLAPSED_DIVISIONS_KEY = 'communities_collapsed_divisions';

// Get set of collapsed division names from sessionStorage
function getCollapsedDivisions() {
    const stored = sessionStorage.getItem(COLLAPSED_DIVISIONS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
}

// Toggle collapse state for a division
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

// Save collapsed divisions to sessionStorage
function saveCollapsedDivisions(collapsedDivisions) {
    sessionStorage.setItem(COLLAPSED_DIVISIONS_KEY, JSON.stringify([...collapsedDivisions]));
}

/**
 * Display games grouped by division with collapsible folders
 */
function displayGamesWithDivisions(games) {
    const gridDiv = document.getElementById('rostersGrid');
    gridDiv.className = 'rosters-grid-divisions';
    gridDiv.innerHTML = '';

    // Store games data globally for re-rendering
    window.currentGamesData = games;

    // Check if current user is admin or developer for delete permissions
    const isAdmin = window.userPermissions?.is_admin || window.userPermissions.is_developer || false;

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

// Render a collapsed division folder
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

// Render an expanded division with all game cards separate
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

// Get division icon
function getDivisionIcon(division) {
    const icons = {
        'Strategy': '<i class="fas fa-chess"></i>',
        'Shooter': '<i class="fas fa-crosshairs"></i>',
        'Sports': '<i class="fas fa-football-ball"></i>',
        'Other': '<i class="fas fa-star"></i>'
    };

    return icons[division] || '<i class="fas fa-gamepad"></i>';
}

// ============================================
// COMMUNITY MODAL
// ============================================
async function openCommunityModal(gameId) {
    currentGameId = gameId;
    const modal = document.getElementById('communityModal');
    const loading = document.getElementById('gameDetailsLoading');
    const content = document.getElementById('gameDetailsContent');

    // Show modal and loading state
    modal.style.display = 'block';
    loading.style.display = 'block';
    content.style.display = 'none';
    document.body.style.overflow = 'hidden';

    try {
        // Fetch game details from API
        const response = await fetch(`/api/game/${gameId}/details`);
        const data = await response.json();

        if (data.success) {
            const game = data.game;

            // Update modal header with game title
            document.getElementById('communityModalTitle').textContent = game.title;
            document.getElementById('gameDetailsTitle').textContent = game.title;
            document.getElementById('gameDetailsDescription').textContent = game.description;

            // Update game icon/image
            updateGameIcon(game);

            // Load and display leagues + stats
            await displayCommunityStats(gameId, game);

            // Populate members list
            populateMembersList(game.members, gameId);

            // Update join/leave buttons
            updateActionButtons(game, gameId);

            // Show content, hide loading
            loading.style.display = 'none';
            content.style.display = 'block';

            // Load next scheduled event
            await loadNextCommunityEvent(gameId);
        } else {
            throw new Error(data.message || 'Failed to load game details');
        }
    } catch (error) {
        // Handle errors and show error message
        console.error('Error loading game details:', error);
        loading.innerHTML = `
            <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: #ff5252;"></i>
            <p style="color: var(--text-secondary); margin-top: 1rem;">Failed to load game details</p>
        `;
    }
}

// Update game icon in community page
function updateGameIcon(game) {
    const iconDiv = document.getElementById('gameDetailsIcon');
    if (game.image_url) {
        iconDiv.innerHTML = `<img src="${game.image_url}" alt="${game.title}" class="game-details-image">`;
    } else {
        iconDiv.innerHTML = '<i class="fas fa-gamepad"></i>';
    }
}

// Initialise banner upload behaviour on the community page
function initBannerUpload() {
    const input = document.getElementById('bannerFileInput');
    if (!input) return;

    input.addEventListener('change', function () {
        if (this.files && this.files[0]) {
            openImageCropper(this.files[0], 'banner');
            this.value = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', initBannerUpload);

// Display community stats, including leagues, total members, and total teams for the current season
async function displayCommunityStats(gameId, game) {
    // Load leagues for this game's current season
    let leaguesHtml = '';
    try {
        const leaguesResponse = await fetch(`/api/game/${gameId}/current-leagues`);
        const leaguesData = await leaguesResponse.json();

        if (leaguesData.success && leaguesData.leagues && leaguesData.leagues.length > 0) {
            // Build league badges
            const leagueBadgesHtml = leaguesData.leagues.map(league => {
                const logoHtml = league.logo
                    ? `<img src="${league.logo}" alt="${league.name}" class="game-league-badge-logo">`
                    : '<i class="fas fa-trophy game-league-badge-icon"></i>';

                // If there's a website URL, make it a link
                if (league.website_url) {
                    return `
                        <a href="${league.website_url}"
                           target="_blank"
                           rel="noopener noreferrer"
                           class="game-league-badge"
                           title="Visit ${league.name} website">
                            ${logoHtml}
                            <span class="game-league-badge-name">${league.name}</span>
                            <i class="fas fa-external-link-alt game-league-badge-external"></i>
                        </a>
                    `;
                } else {
                    return `
                        <span class="game-league-badge">
                            ${logoHtml}
                            <span class="game-league-badge-name">${league.name}</span>
                        </span>
                    `;
                }
            }).join('');

            // Create leagues stat card with just icon, label, and badges
            leaguesHtml = `
                <div class="game-stat-card leagues-card">
                    <i class="fas fa-trophy"></i>
                    <div class="game-stat-label">Leagues</div>
                    <div class="game-leagues-badges">
                        ${leagueBadgesHtml}
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading leagues:', error);
    }

    // Build stats row HTML
    const statsRowHtml = `
        ${leaguesHtml}
        <div class="game-stat-card">
            <i class="fas fa-users"></i>
            <div class="game-stat-number">${game.member_count || 0}</div>
            <div class="game-stat-label">Members</div>
        </div>
        <div class="game-stat-card">
            <i class="fas fa-shield-alt"></i>
            <div class="game-stat-number">${game.team_count || 0}</div>
            <div class="game-stat-label">Teams</div>
        </div>
    `;

    // Find the stats row container and update it
    const statsRow = document.querySelector('.game-stats-row');
    if (statsRow) {
        statsRow.innerHTML = statsRowHtml;
    }
}

// Gather membership to populate members list in community modal
function populateMembersList(members, gameId) {
    const membersList = document.getElementById('gameMembersList');
    const noMembers = document.getElementById('gameNoMembers');
    const searchInput = document.getElementById('memberSearch');

    if (members.length > 0) {
        membersList.innerHTML = '';
        membersList.style.display = 'block';
        noMembers.style.display = 'none';

        // Show search input
        if (searchInput) {
            searchInput.style.display = 'block';
            searchInput.value = ''; // Clear previous search
        }

        // Create member item for each member
        members.forEach(member => {
            const memberItem = createMemberItem(member, gameId);
            membersList.appendChild(memberItem);
        });
    } else {
        // No members, show empty state
        membersList.style.display = 'none';
        noMembers.style.display = 'block';
        if (searchInput) {
            searchInput.style.display = 'none';
        }
    }
}

// Create a member card to display in the community modal
function createMemberItem(member, gameId) {
    const memberItem = document.createElement('div');
    const isAssignedGM = member.is_game_manager;

    memberItem.className = 'member-item' + (isAssignedGM ? ' assigned-gm' : '');
    memberItem.setAttribute('data-username', member.username.toLowerCase());
    memberItem.setAttribute('data-name', member.name.toLowerCase());

    // Profile picture or initials
    let profilePicHTML;
    if (member.profile_picture) {
        profilePicHTML = `<img src="${member.profile_picture}" alt="${member.name}" class="member-avatar">`;
    } else {
        const initials = member.name.split(' ').map(n => n[0]).join('');
        profilePicHTML = `<div class="member-avatar-initials">${initials}</div>`;
    }

    // Build role badges using shared function
    const badgesHTML = buildUniversalRoleBadges({
        userId: member.id,
        roles: member.roles || [],
        contextGameId: gameId
    });

    memberItem.innerHTML = `
        ${profilePicHTML}
        <div class="member-info">
            <div class="member-name">${member.name}</div>
            <div class="member-username">@${member.username}</div>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
            ${badgesHTML}
        </div>
    `;

    return memberItem;
}

/**
 * Filter members in the community modal
 * Uses universal filterListItems function
 */
const filterMembers = () =>
    filterListItems('memberSearch', '#gameMembersList .member-item', ['username', 'name']);

/**
 * Update join/leave action buttons based on membership status
 * If a user is currently in community, show leave action. If not a member, show join action.
 */
function updateActionButtons(game, gameId) {
    const joinBtn = document.getElementById('gameDetailsJoinBtn');
    const leaveBtn = document.getElementById('gameDetailsLeaveBtn');

    if (game.is_member) {
        // User is a member, show leave button
        if (joinBtn) joinBtn.style.display = 'none';
        if (leaveBtn) {
            leaveBtn.style.display = 'inline-flex';
            leaveBtn.onclick = () => confirmLeaveGame(gameId, game.title);
        }
    } else {
        // User is not a member, show join button
        if (leaveBtn) leaveBtn.style.display = 'none';
        if (joinBtn) {
            joinBtn.style.display = 'inline-flex';
            joinBtn.onclick = () => confirmJoinGame(gameId, game.title);
        }
    }
}

// Close community modal (needs to be consolidated)
function closeCommunityModal() {
    const modal = document.getElementById('communityModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Load next scheduled event for game community
 * Grabs the closest future event that is visible to communities and has the game's label
 */
async function loadNextCommunityEvent(gameId) {
    const container = document.getElementById('gameNextScheduledEventContainer');

    if (!container) {
        console.error('gameNextScheduledEventContainer not found');
        return;
    }

    // Show loading state
    container.innerHTML = `
        <div style="text-align: center; padding: 1rem; color: var(--text-secondary);">
            <i class="fas fa-spinner fa-spin"></i> Loading...
        </div>
    `;

    try {
        console.log(`Fetching scheduled event for game ${gameId}`);
        const response = await fetch(`/api/games/${gameId}/next-scheduled-event`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Game scheduled event response:', data);

        if (data.success && data.event) {
            const event = data.event;

            // Add a badge to show if it's from a schedule or a regular event
            const sourceBadge = event.source === 'scheduled'
                ? '<span class="event-source-badge scheduled">Recurring</span>'
                : '<span class="event-source-badge regular">One-time</span>';

            // Format event card
            container.innerHTML = `
                <div class="game-next-event-card" onclick="openEventModal(${event.id})">
                    <div class="game-next-event-header">
                        <i class="fas fa-calendar-plus"></i>
                        <h4>Next Community Event</h4>
                        ${sourceBadge}
                    </div>
                    <div class="game-next-event-content">
                        <div class="game-next-event-time">
                            ${event.is_all_day
                                ? '<i class="fas fa-calendar"></i> All Day'
                                : `<i class="fas fa-clock"></i> ${event.start_time}`
                            }
                        </div>
                        <div class="game-next-event-title">${event.name}</div>
                        <div class="game-next-event-date">
                            <i class="fas fa-calendar-day"></i> ${event.date}
                        </div>
                        <span class="game-next-event-type ${event.event_type.toLowerCase()}">
                            ${event.event_type}
                        </span>
                    </div>
                </div>
            `;
        } else {
            // No scheduled events
            container.innerHTML = `
                <div class="game-next-event-empty">
                    <i class="fas fa-calendar-times"></i>
                    <p>No upcoming community events</p>
                </div>
            `;
        }
    } catch (error) {
        // Handle errors
        console.error('Error loading game next scheduled event:', error);
        container.innerHTML = `
            <div class="game-next-event-empty">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load scheduled events</p>
            </div>
        `;
    }
}

// ============================================
// USER'S COMMUNITIES (PROFILE TAB)
// ============================================

// Load and displays all communities a user has joined in profile tab
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

// Build a community card for the user's profile tab
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
        <a class="btn btn-sm btn-primary" href="/community/${community.id}">
            <i class="fas fa-eye"></i> View
        </a>
    `;

    return card;
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

// Community membership
window.closeConfirmModal = closeConfirmModal;

// Community Modal
window.openCommunityModal = openCommunityModal;
window.closeCommunityModal = closeCommunityModal;
window.filterMembers = filterMembers;

//Folder system
window.displayGamesWithDivisions = displayGamesWithDivisions;