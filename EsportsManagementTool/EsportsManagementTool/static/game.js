// DISCLAIMER: CODE REWRITTEN AND ORGANIZED BY CLAUDE

// ============================================
// GAMES MODULE
// Handles all game community functionality
// ============================================

// Store current game ID for modal
let currentGameId = null;
let currentGameIdForGM = null;

/**
 * Initialize games module
 */
function initializeGamesModule() {
    console.log('Games module initialized');

    // Set up event listeners for roster tab
    const rostersTab = document.querySelector('[data-tab="rosters"]');
    if (rostersTab) {
        rostersTab.addEventListener('click', loadGames);
    }

    const tabDropdownForRosters = document.getElementById('tabDropdown');
    if (tabDropdownForRosters) {
        tabDropdownForRosters.addEventListener('change', function(e) {
            if (e.target.value === 'rosters') {
                loadGames();
            }
        });
    }

    // Load communities in profile tab
    const profileTab = document.querySelector('[data-tab="profile"]');
    if (profileTab) {
        profileTab.addEventListener('click', loadMyCommunities);
    }

    // Set up game image preview
    setupGameImagePreview();
}

/**
 * Set up game image preview functionality
 */
function setupGameImagePreview() {
    const gameImageInput = document.getElementById('gameImage');
    const imagePreview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');

    if (gameImageInput) {
        gameImageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    previewImg.src = event.target.result;
                    imagePreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                imagePreview.style.display = 'none';
            }
        });
    }
}

/**
 * Load games from database
 */
async function loadGames() {
    const loadingDiv = document.getElementById('rostersLoading');
    const gridDiv = document.getElementById('rostersGrid');
    const emptyDiv = document.getElementById('rostersEmpty');

    // Show loading state
    loadingDiv.style.display = 'block';
    gridDiv.style.display = 'none';
    emptyDiv.style.display = 'none';

    try {
        const response = await fetch('/games');
        const data = await response.json();

        if (data.success && data.games && data.games.length > 0) {
            // Display games
            displayGames(data.games);
            loadingDiv.style.display = 'none';
            gridDiv.style.display = 'block';
        } else {
            // Show empty state
            loadingDiv.style.display = 'none';
            emptyDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading games:', error);
        loadingDiv.style.display = 'none';
        emptyDiv.style.display = 'block';
    }
}

/**
 * Display games in grid
 */
async function displayGames(games) {
    const gridDiv = document.getElementById('rostersGrid');
    gridDiv.className = 'rosters-grid';
    gridDiv.innerHTML = '';

    // Check if current user is admin
    const isAdmin = window.userPermissions?.is_admin || false;

    for (const game of games) {
        const teamSizes = game.TeamSizes ? game.TeamSizes.split(',').map(s => s.trim()) : [];

        // Fetch member count and GM status from API
        let memberCount = 0;
        let teamCount = 0;
        let isMember = false;
        let isGameManager = false;
        try {
            const response = await fetch(`/api/game/${game.GameID}/details`);
            const data = await response.json();
            if (data.success) {
                memberCount = data.game.member_count;
                teamCount = data.game.team_count;
                isMember = data.game.is_member;
                isGameManager = data.game.is_game_manager; // Get GM status
            }
        } catch (error) {
            console.error('Error fetching member count:', error);
        }

        // Determine if we have an image or use icon
        let iconHTML;
        if (game.ImageURL) {
            iconHTML = `<img src="${game.ImageURL}"
                             alt="${game.GameTitle}"
                             class="roster-game-image"
                             onerror="this.onerror=null; this.parentElement.innerHTML='<i class=&quot;fas fa-gamepad&quot;></i>';">`;
        } else {
            iconHTML = `<i class="fas fa-gamepad"></i>`;
        }

        // Delete button for admins
        const deleteButtonHTML = isAdmin ? `
            <button class="game-delete-btn"
                    onclick="confirmDeleteGame(${game.GameID}, '${game.GameTitle.replace(/'/g, "\\'")}')"
                    title="Delete game">
                <i class="fas fa-trash"></i>
            </button>
        ` : '';

        // Join/Leave button
        const joinButtonHTML = isMember ? `
            <button class="btn btn-secondary" onclick="confirmLeaveGame(${game.GameID}, '${game.GameTitle.replace(/'/g, "\\'")}')">
                <i class="fas fa-sign-out-alt"></i> Leave Community
            </button>
        ` : `
            <button class="btn btn-success" onclick="confirmJoinGame(${game.GameID}, '${game.GameTitle.replace(/'/g, "\\'")}')">
                <i class="fas fa-user-plus"></i> Join Community
            </button>
        `;

        // Create Team button - ONLY show if user is the GM for THIS specific game
        const createTeamButtonHTML = isGameManager ? `
            <button class="btn btn-primary" onclick="openCreateTeamModal(${game.GameID}, '${game.GameTitle.replace(/'/g, "\\'")}', '${game.TeamSizes}')">
                <i class="fas fa-plus"></i> Create Team
            </button>
        ` : '';

        const memberBadge = isMember ? `
            <span class="member-badge">
                <i class="fas fa-check-circle"></i> Joined
            </span>
        ` : '';

        const card = document.createElement('div');
        card.className = 'roster-card';
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
        gridDiv.appendChild(card);
    }
}

/**
 * Load games for dropdown in event creation
 */
async function loadGamesForDropdown() {
    const gameSelect = document.getElementById('game');
    const loadingIndicator = document.getElementById('gameLoadingIndicator');

    if (!gameSelect) return;

    // Show loading indicator
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }

    // Disable dropdown while loading
    gameSelect.disabled = true;

    try {
        const response = await fetch('/api/games-list');
        const data = await response.json();

        if (data.success && data.games) {
            // Clear existing options except the first "Select game" option
            gameSelect.innerHTML = '<option value="">Select game</option>';

            // Add games from database
            data.games.forEach(game => {
                const option = document.createElement('option');
                option.value = game.GameTitle;
                option.textContent = game.GameTitle;
                gameSelect.appendChild(option);
            });

            // If no games exist, show message
            if (data.games.length === 0) {
                const option = document.createElement('option');
                option.value = "";
                option.textContent = "No games available";
                option.disabled = true;
                gameSelect.appendChild(option);
            }
        } else {
            // Error loading games
            console.error('Failed to load games');
            gameSelect.innerHTML = '<option value="">Error loading games</option>';
        }
    } catch (error) {
        console.error('Error fetching games:', error);
        gameSelect.innerHTML = '<option value="">Error loading games</option>';
    } finally {
        // Hide loading indicator and re-enable dropdown
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        gameSelect.disabled = false;
    }
}

// ============================================
// GAME DETAILS MODAL
// ============================================

/**
 * Open game details modal with GM assignment functionality
 */
async function openGameDetailsModal(gameId) {
    currentGameId = gameId;
    const modal = document.getElementById('gameDetailsModal');
    const loading = document.getElementById('gameDetailsLoading');
    const content = document.getElementById('gameDetailsContent');

    modal.style.display = 'block';
    loading.style.display = 'block';
    content.style.display = 'none';
    document.body.style.overflow = 'hidden';

    try {
        const response = await fetch(`/api/game/${gameId}/details`);
        const data = await response.json();

        if (data.success) {
            const game = data.game;

            // Update modal title
            document.getElementById('gameDetailsModalTitle').textContent = game.title;
            document.getElementById('gameDetailsTitle').textContent = game.title;
            document.getElementById('gameDetailsDescription').textContent = game.description;
            document.getElementById('gameDetailsMemberCount').textContent = game.member_count;
            document.getElementById('gameDetailsTeamCount').textContent = game.team_count;

            // Update icon
            const iconDiv = document.getElementById('gameDetailsIcon');
            if (game.image_url) {
                iconDiv.innerHTML = `<img src="${game.image_url}" alt="${game.title}" class="game-details-image">`;
            } else {
                iconDiv.innerHTML = '<i class="fas fa-gamepad"></i>';
            }

            // Populate members list
            const membersList = document.getElementById('gameMembersList');
            const noMembers = document.getElementById('gameNoMembers');
            const searchInput = document.getElementById('memberSearch');

            if (game.members.length > 0) {
                membersList.innerHTML = '';
                membersList.style.display = 'block';
                noMembers.style.display = 'none';

                // Show search input
                if (searchInput) {
                    searchInput.style.display = 'block';
                    searchInput.value = ''; // Clear previous search
                }

                game.members.forEach(member => {
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
                    const badgesHTML = buildRoleBadges({
                        roles: member.roles || [],
                        isAssignedGM: member.is_game_manager,
                        gameIconUrl: game.image_url
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
                    membersList.appendChild(memberItem);
                });
            } else {
                membersList.style.display = 'none';
                noMembers.style.display = 'block';
            }

            // Update action buttons
            const joinBtn = document.getElementById('gameDetailsJoinBtn');
            const leaveBtn = document.getElementById('gameDetailsLeaveBtn');

            if (game.is_member) {
                if (joinBtn) joinBtn.style.display = 'none';
                if (leaveBtn) {
                    leaveBtn.style.display = 'inline-flex';
                    leaveBtn.onclick = () => confirmLeaveGame(gameId, game.title);
                }
            } else {
                if (leaveBtn) leaveBtn.style.display = 'none';
                if (joinBtn) {
                    joinBtn.style.display = 'inline-flex';
                    joinBtn.onclick = () => confirmJoinGame(gameId, game.title);
                }
            }

            // Add GM assignment button for admins IN HEADER
            const gmButtonContainer = document.getElementById('gmButtonContainer');
            const isAdmin = window.userPermissions?.is_admin || false;

            if (isAdmin && gmButtonContainer) {
                gmButtonContainer.innerHTML = ''; // Clear existing

                if (game.assigned_gm_id) {
                    // Show "Remove GM" button
                    gmButtonContainer.innerHTML = `
                        <button class="btn-header-action btn-remove-gm-header" onclick="removeGameManager(${gameId})" title="Remove Game Manager">
                            <i class="fas fa-user-minus"></i>
                        </button>
                    `;
                } else {
                    // Show "Assign GM" button
                    gmButtonContainer.innerHTML = `
                        <button class="btn-header-action btn-assign-gm-header" onclick="openAssignGMModal(${gameId})" title="Assign Game Manager">
                            <i class="fas fa-user-shield"></i>
                        </button>
                    `;
                }
            }

            // Show content, hide loading
            loading.style.display = 'none';
            content.style.display = 'block';
        } else {
            throw new Error(data.message || 'Failed to load game details');
        }
    } catch (error) {
        console.error('Error loading game details:', error);
        loading.innerHTML = `
            <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: #ff5252;"></i>
            <p style="color: var(--text-secondary); margin-top: 1rem;">Failed to load game details</p>
        `;
    }
}

/**
 * Close game details modal
 */
function closeGameDetailsModal() {
    const modal = document.getElementById('gameDetailsModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentGameId = null;
}

/**
 * Filter members in the game details modal
 */
function filterMembers() {
    const searchInput = document.getElementById('memberSearch');
    const filter = searchInput.value.toLowerCase();
    const memberItems = document.querySelectorAll('#gameMembersList .member-item');

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

// ============================================
// GM ASSIGNMENT FUNCTIONS
// ============================================

/**
 * Open assign GM modal
 */
async function openAssignGMModal(gameId) {
    currentGameIdForGM = gameId;
    const modal = document.getElementById('assignGMModal');
    const loading = document.getElementById('gmListLoading');
    const container = document.getElementById('gmListContainer');
    const empty = document.getElementById('gmListEmpty');
    const gmList = document.getElementById('gmList');

    modal.style.display = 'block';
    loading.style.display = 'block';
    container.style.display = 'none';
    empty.style.display = 'none';
    document.body.style.overflow = 'hidden';

    try {
        const response = await fetch(`/api/game/${gameId}/available-gms`);
        const data = await response.json();

        if (data.success && data.game_managers.length > 0) {
            gmList.innerHTML = '';

            data.game_managers.forEach(gm => {
                const gmItem = document.createElement('div');
                gmItem.className = 'gm-selection-item';
                gmItem.onclick = () => confirmAssignGM(gameId, gm.id, gm.name);

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

                gmList.appendChild(gmItem);
            });

            loading.style.display = 'none';
            container.style.display = 'block';
        } else {
            loading.style.display = 'none';
            empty.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading GMs:', error);
        loading.innerHTML = '<p style="color: #ff5252;">Failed to load Game Managers</p>';
    }
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
            // Refresh the game details modal
            openGameDetailsModal(gameId);
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error assigning GM:', error);
        alert('Failed to assign Game Manager');
    }
}

/**
 * Remove GM assignment
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
            // Refresh the game details modal
            openGameDetailsModal(gameId);
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error removing GM:', error);
        alert('Failed to remove Game Manager');
    }
}

// ============================================
// JOIN/LEAVE GAME COMMUNITY
// ============================================

/**
 * Confirm joining a game community
 */
function confirmJoinGame(gameId, gameTitle) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.id = 'confirmJoinModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h2><i class="fas fa-user-plus"></i> Join Community</h2>
            </div>
            <div class="modal-body">
                <p>Would you like to join the <strong>${gameTitle}</strong> community?</p>
                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 1rem;">
                    You'll be able to participate in events, join teams, and connect with other players.
                </p>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="closeConfirmModal()">Cancel</button>
                <button class="btn btn-success" onclick="joinGame(${gameId}, '${gameTitle.replace(/'/g, "\\'")}')">
                    <i class="fas fa-check"></i> Join
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeConfirmModal();
    });
}

/**
 * Confirm leaving a game community
 */
function confirmLeaveGame(gameId, gameTitle) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.id = 'confirmJoinModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header" style="background-color: #ff9800;">
                <h2><i class="fas fa-sign-out-alt"></i> Leave Community</h2>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to leave the <strong>${gameTitle}</strong> community?</p>
                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 1rem;">
                    You can always rejoin later if you change your mind.
                </p>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="closeConfirmModal()">Cancel</button>
                <button class="btn btn-warning" onclick="leaveGame(${gameId}, '${gameTitle.replace(/'/g, "\\'")}')">
                    <i class="fas fa-sign-out-alt"></i> Leave
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeConfirmModal();
    });
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
            closeGameDetailsModal();

            // Reload games to update UI
            loadGames();
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
            closeGameDetailsModal();

            // Reload games to update UI
            loadGames();
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error leaving community:', error);
        alert('Failed to leave community. Please try again.');
    }
}

// ============================================
// MY COMMUNITIES (PROFILE TAB)
// ============================================

/**
 * Load user's communities for profile tab
 */
async function loadMyCommunities() {
    const loading = document.getElementById('myCommunitiesLoading');
    const grid = document.getElementById('myCommunitiesGrid');
    const empty = document.getElementById('myCommunitiesEmpty');

    loading.style.display = 'block';
    grid.style.display = 'none';
    empty.style.display = 'none';

    try {
        const response = await fetch('/api/user/communities');
        const data = await response.json();

        if (data.success && data.communities.length > 0) {
            grid.innerHTML = '';

            data.communities.forEach(community => {
                const card = document.createElement('div');
                card.className = 'community-card-small';

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
                grid.appendChild(card);
            });

            loading.style.display = 'none';
            grid.style.display = 'grid';
        } else {
            loading.style.display = 'none';
            empty.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading communities:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
    }
}

// ============================================
// CREATE TEAM MODAL
// ============================================

/**
 * Open create team modal
 */
function openCreateTeamModal(gameID, gameTitle, teamSizes) {
    const modal = document.getElementById('createTeamModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Reset the form
    const teamForm = document.getElementById('createTeamForm');
    teamForm.reset();
    document.getElementById('teamFormMessage').style.display = 'none';

    // Store the current game ID
    document.getElementById('gameIDField').value = gameID;

    // Update modal title
    const modalTitle = document.getElementById('teamModalGameTitle');
    if (modalTitle) modalTitle.textContent = gameTitle;

    // Populate team size radio buttons
    const sizeContainer = document.getElementById('teamSizesContainer');
    if (sizeContainer) {
        sizeContainer.innerHTML = '';
        const sizes = teamSizes.split(',').map(s => s.trim());
        sizes.forEach(size => {
            const label = document.createElement('label');
            label.className = 'team-size-final';
            label.innerHTML = `
                <input type="radio" name="team_sizes" value="${size}" required>
                <span>${size} Player${size != 1 ? 's' : ''}</span>
            `;
            sizeContainer.appendChild(label);
        });
    }
}

/**
 * Close create team modal
 */
function closeCreateTeamModal() {
    const modal = document.getElementById('createTeamModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

/**
 * Setup create team form submission
 */
function setupCreateTeamForm() {
    const createTeamForm = document.getElementById('createTeamForm');
    if (!createTeamForm) return;

    createTeamForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const submitBtn = createTeamForm.querySelector('button[type="submit"]');
        const submitBtnText = document.getElementById('submitTeamBtnText');
        const submitBtnSpinner = document.getElementById('submitTeamBtnSpinner');
        const formMessage = document.getElementById('teamFormMessage');

        submitBtn.disabled = true;
        submitBtnText.style.display = 'none';
        submitBtnSpinner.style.display = 'inline-block';

        const formData = new FormData(createTeamForm);
        const gameID = document.getElementById('gameIDField').value;

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
            const response = await fetch(`/api/create-team/${gameID}`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success) {
                formMessage.textContent = data.message || 'Team created successfully! Refreshing...';
                formMessage.className = 'form-message success';
                formMessage.style.display = 'block';

                setTimeout(() => { window.location.reload(); }, 1500);
            } else {
                throw new Error(data.message || 'Failed to create team');
            }
        } catch (error) {
            formMessage.textContent = error.message || 'Failed to create team. Please try again.';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';

            submitBtn.disabled = false;
            submitBtnText.style.display = 'inline';
            submitBtnSpinner.style.display = 'none';
        }
    });
}

// ============================================
// INITIALIZE ON DOM LOAD
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    initializeGamesModule();
    setupCreateTeamForm();
});