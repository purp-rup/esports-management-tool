/**
 * game.js
 * ============================================================================
 * Handles general game functionality including:
 * - Game loading and display
 * - Game details modal
 * - Game dropdowns for event creation
 * - Team creation
 * - Image preview for admin panel
 *
 * ORGANIZED BY CLAUDE AI
 * ============================================================================
 */

// ============================================
// GLOBAL STATE
// ============================================

/**
 * Currently selected game ID for modal operations
 * @type {number|null}
 */
let currentGameId = null;

// ============================================
// MODULE INITIALIZATION
// ============================================

/**
 * Initialize games module
 * Sets up event listeners and loads initial data
 * Called on DOMContentLoaded
 */
function initializeGamesModule() {
    console.log('Games module initialized');

    // Set up event listeners for roster tab
    const rostersTab = document.querySelector('[data-tab="rosters"]');
    if (rostersTab) {
        rostersTab.addEventListener('click', loadGames);
    }

    // Handle mobile dropdown tab selection
    const tabDropdownForRosters = document.getElementById('tabDropdown');
    if (tabDropdownForRosters) {
        tabDropdownForRosters.addEventListener('change', function(e) {
            if (e.target.value === 'rosters') {
                loadGames();
            }
        });
    }

    // Set up game image preview for admin panel
    setupGameImagePreview();
}

/**
 * Set up game image preview functionality for admin game creation
 * Shows preview when admin uploads a game image
 */
function setupGameImagePreview() {
    const gameImageInput = document.getElementById('gameImage');
    const imagePreview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');

    if (gameImageInput && imagePreview && previewImg) {
        gameImageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                // Read file and display preview
                const reader = new FileReader();
                reader.onload = function(event) {
                    previewImg.src = event.target.result;
                    imagePreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                // No file selected, hide preview
                imagePreview.style.display = 'none';
            }
        });
    }
}

// ============================================
// GAME LOADING & DISPLAY
// ============================================

/**
 * Load all games from database
 * Fetches games and displays them in the rosters grid
 * Shows loading state while fetching
 */
async function loadGames() {
    const loadingDiv = document.getElementById('rostersLoading');
    const gridDiv = document.getElementById('rostersGrid');
    const emptyDiv = document.getElementById('rostersEmpty');

    // Show loading state, hide other states
    loadingDiv.style.display = 'block';
    gridDiv.style.display = 'none';
    emptyDiv.style.display = 'none';

    try {
        // Fetch games from API
        const response = await fetch('/games');
        const data = await response.json();

        if (data.success && data.games && data.games.length > 0) {
            // Display games in grid
            displayGames(data.games);
            loadingDiv.style.display = 'none';
            gridDiv.style.display = 'block';
        } else {
            // No games available, show empty state
            loadingDiv.style.display = 'none';
            emptyDiv.style.display = 'block';
        }
    } catch (error) {
        // Handle errors and show empty state
        console.error('Error loading games:', error);
        loadingDiv.style.display = 'none';
        emptyDiv.style.display = 'block';
    }
}

/**
 * Display games in grid layout
 * Creates game cards with stats, actions, and membership status
 * @param {Array} games - Array of game objects from API
 */
async function displayGames(games) {
    const gridDiv = document.getElementById('rostersGrid');
    gridDiv.className = 'rosters-grid';
    gridDiv.innerHTML = '';

    // Check if current user is admin for delete permissions
    const isAdmin = window.userPermissions?.is_admin || false;

    for (const game of games) {
        const card = createGameCard(game, isAdmin);
        gridDiv.appendChild(card);
    }
}

/**
 * Create a game card element
 * @param {Object} game - Game object from API
 * @param {boolean} isAdmin - Whether current user is admin
 * @returns {HTMLElement} The created game card element
 */
function createGameCard(game, isAdmin) {
    const card = document.createElement('div');
    card.className = 'roster-card';

    // Extract game data
    const memberCount = game.member_count || 0;
    const teamCount = game.team_count || 0;
    const isMember = game.is_member || false;
    const isGameManager = game.is_game_manager || false;

    // Build game icon (image or fallback icon)
    const iconHTML = game.ImageURL
        ? `<img src="${game.ImageURL}"
                alt="${game.GameTitle}"
                class="roster-game-image"
                onerror="this.onerror=null; this.parentElement.innerHTML='<i class=&quot;fas fa-gamepad&quot;></i>';">`
        : `<i class="fas fa-gamepad"></i>`;

    // Delete button (admin only)
    const deleteButtonHTML = isAdmin
        ? `<button class="game-delete-btn"
                    onclick="confirmDeleteGame(${game.GameID}, '${escapeHtml(game.GameTitle)}')"
                    title="Delete game">
                <i class="fas fa-trash"></i>
           </button>`
        : '';

    // Join/Leave button based on membership status
    const joinButtonHTML = isMember
        ? `<button class="btn btn-secondary"
                    onclick="confirmLeaveGame(${game.GameID}, '${escapeHtml(game.GameTitle)}')">
                <i class="fas fa-sign-out-alt"></i> Leave Community
           </button>`
        : `<button class="btn btn-success"
                    onclick="confirmJoinGame(${game.GameID}, '${escapeHtml(game.GameTitle)}')">
                <i class="fas fa-user-plus"></i> Join Community
           </button>`;

    // Create Team button (only for GMs of this specific game)
    const createTeamButtonHTML = isGameManager
        ? `<button class="btn btn-primary"
                    onclick="openCreateTeamModal(${game.GameID}, '${escapeHtml(game.GameTitle)}', '${game.TeamSizes}')">
                <i class="fas fa-plus"></i> Create Team
           </button>`
        : '';

    // Member badge for joined communities
    const memberBadge = isMember
        ? `<span class="member-badge">
                <i class="fas fa-check-circle"></i> Joined
           </span>`
        : '';

    // Build complete card HTML
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
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
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

/**
 * Load games for dropdown in event creation
 * Populates dropdown with available games from database
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
        // Fetch games list from API
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
        // Handle network or other errors
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
 * Open game details modal
 * Fetches and displays comprehensive game information
 * @param {number} gameId - Game ID to display details for
 */
async function openGameDetailsModal(gameId) {
    currentGameId = gameId;
    const modal = document.getElementById('gameDetailsModal');
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
            document.getElementById('gameDetailsModalTitle').textContent = game.title;
            document.getElementById('gameDetailsTitle').textContent = game.title;
            document.getElementById('gameDetailsDescription').textContent = game.description;

            // Update stats
            document.getElementById('gameDetailsMemberCount').textContent = game.member_count;
            document.getElementById('gameDetailsTeamCount').textContent = game.team_count;

            // Update game icon/image
            updateGameIcon(game);

            // Populate members list
            populateMembersList(game.members, gameId);

            // Update join/leave buttons
            updateActionButtons(game, gameId);

            // Add GM assignment button for admins
            updateGMAssignmentButton(game, gameId);

            // Show content, hide loading
            loading.style.display = 'none';
            content.style.display = 'block';

            // Load next scheduled event
            await loadGameNextScheduledEvent(gameId);
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

/**
 * Update game icon in details modal
 * @param {Object} game - Game object
 */
function updateGameIcon(game) {
    const iconDiv = document.getElementById('gameDetailsIcon');
    if (game.image_url) {
        iconDiv.innerHTML = `<img src="${game.image_url}" alt="${game.title}" class="game-details-image">`;
    } else {
        iconDiv.innerHTML = '<i class="fas fa-gamepad"></i>';
    }
}

/**
 * Populate members list in game details modal
 * @param {Array} members - Array of member objects
 * @param {number} gameId - Current game ID for context
 */
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

/**
 * Create a member item element
 * @param {Object} member - Member object
 * @param {number} gameId - Current game ID for context highlighting
 * @returns {HTMLElement} The created member item element
 */
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
        contextGameId: gameId  // Pass the game ID for context highlighting
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
 * Update join/leave action buttons based on membership status
 * @param {Object} game - Game object
 * @param {number} gameId - Game ID
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

/**
 * Update GM assignment button in modal header (admin only)
 * @param {Object} game - Game object
 * @param {number} gameId - Game ID
 */
function updateGMAssignmentButton(game, gameId) {
    const gmButtonContainer = document.getElementById('gmButtonContainer');
    const isAdmin = window.userPermissions?.is_admin || false;

    if (isAdmin && gmButtonContainer) {
        gmButtonContainer.innerHTML = ''; // Clear existing

        if (game.assigned_gm_id) {
            // Show "Remove GM" button
            gmButtonContainer.innerHTML = `
                <button class="btn-header-action btn-remove-gm-header"
                        onclick="removeGameManager(${gameId})"
                        title="Remove Game Manager">
                    <i class="fas fa-user-minus"></i>
                </button>
            `;
        } else {
            // Show "Assign GM" button
            gmButtonContainer.innerHTML = `
                <button class="btn-header-action btn-assign-gm-header"
                        onclick="openAssignGMModal(${gameId})"
                        title="Assign Game Manager">
                    <i class="fas fa-user-shield"></i>
                </button>
            `;
        }
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
 * Load next scheduled event for game community
 * Displays the upcoming event in the game details modal
 * @param {number} gameId - Game ID to load event for
 */
async function loadGameNextScheduledEvent(gameId) {
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

/**
 * Filter members in the game details modal
 * Searches by username or full name
 */
function filterMembers() {
    const searchInput = document.getElementById('memberSearch');
    const filter = searchInput.value.toLowerCase();
    const memberItems = document.querySelectorAll('#gameMembersList .member-item');

    memberItems.forEach(item => {
        const username = item.getAttribute('data-username');
        const name = item.getAttribute('data-name');

        // Show item if username or name matches search
        if (username.includes(filter) || name.includes(filter)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// ============================================
// TEAM CREATION
// ============================================

/**
 * Open create team modal
 * Shows form for GMs to create a new team
 * @param {number} gameID - Game ID to create team for
 * @param {string} gameTitle - Game title for display
 * @param {string} teamSizes - Comma-separated team sizes
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
    populateTeamSizeOptions(teamSizes);
}

/**
 * Populate team size options in create team modal
 * @param {string} teamSizes - Comma-separated team sizes
 */
function populateTeamSizeOptions(teamSizes) {
    const sizeContainer = document.getElementById('teamSizesContainer');
    if (!sizeContainer) return;

    sizeContainer.innerHTML = '';
    sizeContainer.className = 'team-size-options';

    const sizes = teamSizes.split(',').map(s => s.trim());

    sizes.forEach((size, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'team-size-option';

        const radioId = `teamSize${size}`;
        const isFirst = index === 0;
        const playerText = size === '1' ? 'player' : 'players';

        optionDiv.innerHTML = `
            <input type="radio"
                   name="team_sizes"
                   value="${size}"
                   id="${radioId}"
                   ${isFirst ? 'checked' : ''}>
            <label for="${radioId}">
                <div class="size-content">
                    <i class="fas fa-users size-icon"></i>
                    <div class="size-text">
                        <span class="size-number">${size} ${size === '1' ? 'Player' : 'Players'}</span>
                        <span class="size-description">Maximum ${size} ${playerText} per team</span>
                    </div>
                </div>
            </label>
        `;

        sizeContainer.appendChild(optionDiv);
    });
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
 * Handles form validation and API submission
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

        // Show loading state
        submitBtn.disabled = true;
        submitBtnText.style.display = 'none';
        submitBtnSpinner.style.display = 'inline-block';

        const formData = new FormData(createTeamForm);
        const gameID = document.getElementById('gameIDField').value;

        // Validate team size selection
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
            // Submit team creation request
            const response = await fetch(`/api/create-team/${gameID}`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Show success message
                formMessage.textContent = data.message || 'Team created successfully! Refreshing...';
                formMessage.className = 'form-message success';
                formMessage.style.display = 'block';

                // Reload page after brief delay
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error(data.message || 'Failed to create team');
            }
        } catch (error) {
            // Show error message
            formMessage.textContent = error.message || 'Failed to create team. Please try again.';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';

            // Reset button state
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

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

// Core module functions
window.initializeGamesModule = initializeGamesModule;
window.setupGameImagePreview = setupGameImagePreview;

// Game loading and display
window.loadGames = loadGames;
window.displayGames = displayGames;
window.loadGamesForDropdown = loadGamesForDropdown;

// Game details modal
window.openGameDetailsModal = openGameDetailsModal;
window.closeGameDetailsModal = closeGameDetailsModal;
window.loadGameNextScheduledEvent = loadGameNextScheduledEvent;
window.filterMembers = filterMembers;

// Team creation
window.openCreateTeamModal = openCreateTeamModal;
window.closeCreateTeamModal = closeCreateTeamModal;
window.setupCreateTeamForm = setupCreateTeamForm;