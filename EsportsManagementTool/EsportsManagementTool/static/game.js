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
 **/
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
    const isAdmin = window.userPermissions?.is_admin || window.userPermissions.is_developer || false;

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
                    onclick="checkSeasonBeforeTeamCreation(${game.GameID}, '${escapeHtml(game.GameTitle)}', '${game.TeamSizes}')">
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
// TEAM CREATION
// ============================================

/**
 * Check if there's an active season before allowing team creation
 */
async function checkSeasonBeforeTeamCreation(gameId, gameTitle, teamSizes) {
    try {
        const response = await fetch('/api/seasons/current');
        const data = await response.json();

        if (data.success && data.season) {
            // Active season exists - proceed with team creation
            openCreateTeamModal(gameId, gameTitle, teamSizes);
        } else {
            // No active season - show error message
            alert(
                'Cannot create team: No active season found.\n\n' +
                'Teams must be assigned to a season. Please ask an administrator to create a season first.'
            );
        }
    } catch (error) {
        console.error('Error checking for active season:', error);
        alert('Failed to check for active season. Please try again.');
    }
}

/**
 * Open create team modal
 * Shows form for GMs to create a new team
 * @param {number} gameID - Game ID to create team for
 * @param {string} gameTitle - Game title for display
 * @param {string} teamSizes - Comma-separated team sizes
 */
async function openCreateTeamModal(gameID, gameTitle, teamSizes) {
    const modal = document.getElementById('createTeamModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Reset the form
    const teamForm = document.getElementById('createTeamForm');
    teamForm.reset();

    const submitBtn = teamForm.querySelector('button[type="submit"]');
    const submitBtnText = document.getElementById('submitTeamBtnText');
    const submitBtnSpinner = document.getElementById('submitTeamBtnSpinner');

    if (submitBtn) submitBtn.disabled = false;
    if (submitBtnText) submitBtnText.style.display = 'inline';
    if (submitBtnSpinner) submitBtnSpinner.style.display = 'none';

    document.getElementById('teamFormMessage').style.display = 'none';

    // Clear any previous league selections
    if (typeof clearSelectedLeagues === 'function') {
        clearSelectedLeagues('create');
    }

    // Store the current game ID
    document.getElementById('gameIDField').value = gameID;

    // Update modal title
    const modalTitle = document.getElementById('teamModalGameTitle');
    if (modalTitle) modalTitle.textContent = gameTitle;

    // Populate team size radio buttons
    populateTeamSizeOptions(teamSizes);

    // Display active season info
    await displayActiveSeasonInfo();

    // Initialize league selector - WAIT FOR IT TO COMPLETE
    if (typeof initializeTeamLeagueSelector === 'function') {
        await initializeTeamLeagueSelector('create', []);

        // EXPLICITLY ENABLE DROPDOWN AFTER INITIALIZATION
        setTimeout(() => {
            const dropdown = document.getElementById('teamLeaguesDropdown');
            if (dropdown) {
                enableDropdown(dropdown);
            }
        }, 50);
    }
}

/**
 * Update the openCreateTeamModal function to display season info
 */
async function displayActiveSeasonInfo() {
    try {
        const response = await fetch('/api/seasons/current');
        const data = await response.json();

        if (data.success && data.season) {
            const season = data.season;

            // Create or update season info display in the modal
            const modalBody = document.querySelector('#createTeamModal .modal-body');
            let seasonInfo = document.getElementById('teamSeasonInfo');

            if (!seasonInfo) {
                seasonInfo = document.createElement('div');
                seasonInfo.id = 'teamSeasonInfo';
                seasonInfo.style.cssText = `
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    border-radius: 6px;
                    padding: 0.75rem;
                    margin-bottom: 1rem;
                    color: var(--text-primary);
                    font-size: 0.875rem;
                `;

                // Insert after the subtitle
                const subtitle = modalBody.querySelector('.modal-subtitle');
                if (subtitle) {
                    subtitle.after(seasonInfo);
                }
            }

            seasonInfo.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-calendar-check" style="color: #22c55e;"></i>
                    <strong>Active Season:</strong> ${season.season_name}
                    <span style="color: var(--text-secondary); margin-left: auto;">
                        ${formatSeasonDate(season.start_date)} - ${formatSeasonDate(season.end_date)}
                    </span>
                </div>
                <div style="margin-top: 0.25rem; font-size: 0.8125rem; color: var(--text-secondary);">
                    This team will be assigned to the current season
                </div>
            `;
        }
    } catch (error) {
        console.error('Error displaying season info:', error);
    }
}

/**
 * Helper function to format season dates
 */
function formatSeasonDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
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
    const form = document.getElementById('createTeamForm');
    const submitBtn = form?.querySelector('button[type="submit"]');
    const submitBtnText = document.getElementById('submitTeamBtnText');
    const submitBtnSpinner = document.getElementById('submitTeamBtnSpinner');
    const formMessage = document.getElementById('teamFormMessage');

    // RESET BUTTON STATE
    if (submitBtn) {
        submitBtn.disabled = false;
    }
    if (submitBtnText) {
        submitBtnText.style.display = 'inline';
    }
    if (submitBtnSpinner) {
        submitBtnSpinner.style.display = 'none';
    }
    if (formMessage) {
        formMessage.style.display = 'none';
    }

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

        // Validate team size selection
        const selectedSize = document.querySelector('input[name="team_sizes"]:checked');
        if (!selectedSize) {
            formMessage.textContent = 'Please select a team size.';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';

            // RESET BUTTON STATE
            submitBtn.disabled = false;
            submitBtnText.style.display = 'inline';
            submitBtnSpinner.style.display = 'none';
            return;
        }

        const formData = new FormData(createTeamForm);
        const gameID = document.getElementById('gameIDField').value;

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
                }, 350);
            } else {
                throw new Error(data.message || 'Failed to create team');
            }
        } catch (error) {
            // Show error message
            formMessage.textContent = error.message || 'Failed to create team. Please try again.';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';

            // RESET BUTTON STATE ON ERROR
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

// Team creation
window.openCreateTeamModal = openCreateTeamModal;
window.closeCreateTeamModal = closeCreateTeamModal;
window.setupCreateTeamForm = setupCreateTeamForm;

//Seasons systems
window.checkSeasonBeforeTeamCreation = checkSeasonBeforeTeamCreation;
window.displayActiveSeasonInfo = displayActiveSeasonInfo;