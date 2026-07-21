/**
 * game.js
 * ============================================================================
 * Handles general game functionality including:
 * - Game loading and display
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
    initializeCommunityFilters();
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
        const response = await fetch('/communities');
        const data = await response.json();

        if (data.success && data.games && data.games.length > 0) {
            window.currentGamesData = data.games;
            resetCommunityFilters();
            displayGamesList(data.games);
            loadingDiv.style.display = 'none';
            gridDiv.style.display = 'flex';
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
 * Display all games as a flat banner list
 * @param {Array} games - Array of game objects from the API
 */
function displayGamesList(games) {
    const gridDiv = document.getElementById('rostersGrid');
    gridDiv.className = 'community-list';
    gridDiv.innerHTML = '';

    const isAdmin = window.userPermissions?.is_admin || window.userPermissions?.is_developer || false;

    games.forEach(game => {
        const row = createGameCard(game, isAdmin);
        gridDiv.appendChild(row);
    });
}

/**
 * Create a game card element
 * @param {Object} game - Game object from API
 * @param {boolean} isAdmin - Whether current user is admin
 * @returns {HTMLElement} The created game card element
 */
function createGameCard(game, isAdmin) {
    const row = document.createElement('div');
    row.className = 'community-list-row';

    const memberCount = game.member_count || 0;
    const teamCount   = game.team_count   || 0;
    const isMember    = game.is_member    || false;

    // Game card background, prefer GameBanner, fall back to ImageURL
    const bgUrl = game.GameBanner || game.ImageURL || '';

    const iconHTML = game.ImageURL
        ? `<img src="${game.ImageURL}"
                alt="${escapeHtml(game.GameTitle)}"
                onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-gamepad\\'></i>';">`
        : `<i class="fas fa-gamepad"></i>`;

    // "Joined" badge shown on the left when user is a member
    const memberBadge = isMember
        ? `<span class="member-badge">
               <i class="fas fa-check-circle"></i> Joined
           </span>`
        : '';

    // Join/leave button
    const actionBtnHTML = isMember
        ? `<button class="community-list-btn leave-btn"
                   title="Leave ${escapeHtml(game.GameTitle)}"
                   onclick="event.stopPropagation(); confirmLeaveGame(${game.GameID}, '${escapeHtml(game.GameTitle)}')">
               <i class="fas fa-sign-out-alt"></i>
           </button>`
        : `<button class="community-list-btn join-btn"
                   title="Join ${escapeHtml(game.GameTitle)}"
                   onclick="event.stopPropagation(); confirmJoinGame(${game.GameID}, '${escapeHtml(game.GameTitle)}')">
               <i class="fas fa-user-plus"></i>
           </button>`;

    row.innerHTML = `
        <div class="community-list-bg" style="background-image: url('${bgUrl}');"></div>

        <div class="community-list-left">
            <div class="community-list-icon">${iconHTML}</div>
            <div class="community-list-title-group">
                <span class="community-list-title">${escapeHtml(game.GameTitle)}</span>
                ${memberBadge}
            </div>
        </div>

        <div class="community-list-right">
            <div class="community-list-stat">
                <span class="community-list-stat-number">${memberCount}</span>
                <span class="community-list-stat-label">Members</span>
            </div>
            <div class="community-list-stat">
                <span class="community-list-stat-number">${teamCount}</span>
                <span class="community-list-stat-label">Teams</span>
            </div>
            ${actionBtnHTML}
        </div>
    `;

    // Clicking anywhere on the row navigates to the community page
    row.addEventListener('click', () => {
        window.location.href = `/community/${game.GameID}`;
    });

    return row;
}

/**
 * Initialize division filter buttons for the Communities tab
 */
function initializeCommunityFilters() {
    const buttons = document.querySelectorAll('.communities-filter-container .filter-btn');
    if (!buttons.length) return;

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const division = btn.dataset.division;

            if (division === 'all') {
                // Deactivate all division filters, activate All
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            } else {
                // Toggle this division
                btn.classList.toggle('active');

                // If nothing is active, fall back to All
                const anyActive = [...buttons].some(
                    b => b.dataset.division !== 'all' && b.classList.contains('active')
                );
                const allBtn = document.querySelector('.communities-filter-container .filter-btn[data-division="all"]');
                allBtn.classList.toggle('active', !anyActive);
            }

            applyDivisionFilter();
        });
    });
}

/**
 * Re-render the community list based on active division filters
 */
function applyDivisionFilter() {
    if (!window.currentGamesData) return;

    const allBtn = document.querySelector('.communities-filter-container .filter-btn[data-division="all"]');

    if (allBtn && allBtn.classList.contains('active')) {
        displayGamesList(window.currentGamesData);
        return;
    }

    const activeFilters = [...document.querySelectorAll('.communities-filter-container .filter-btn')]
        .filter(b => b.dataset.division !== 'all' && b.classList.contains('active'))
        .map(b => b.dataset.division);

    const filtered = window.currentGamesData.filter(game =>
        activeFilters.includes(game.Division)
    );

    displayGamesList(filtered);
}

/**
 * Reset all division filter buttons back to the "All" state
 */
function resetCommunityFilters() {
    const buttons = document.querySelectorAll('.communities-filter-container .filter-btn');
    if (!buttons.length) return;

    buttons.forEach(b => b.classList.remove('active'));

    const allBtn = document.querySelector('.communities-filter-container .filter-btn[data-division="all"]');
    if (allBtn) allBtn.classList.add('active');
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

// =============================
// GAME DROPDOWNS
// =============================

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
        const response = await fetch('/api/game-list');
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

/*
 * Refresh all game dropdowns on the current page
 * Loops through common dropdown IDs and refreshes if they exist
 * Used after game creation/deletion to update all dropdowns
 */
async function refreshAllGameDropdowns() {
    // List of all game dropdown IDs that might exist on the page
    // Each includes the select element ID and its loading indicator ID
    const dropdownIds = [
        { selectId: 'game', loadingId: 'gameLoadingIndicator' },           // Create event modal
        { selectId: 'editGame', loadingId: 'editGameLoadingIndicator' },   // Edit event modal
        { selectId: 'gameFilter', loadingId: 'gameFilterLoadingIndicator' } // Events filter
    ];

    // Refresh each dropdown that exists on the page
    for (const dropdown of dropdownIds) {
        const selectElement = document.getElementById(dropdown.selectId);
        if (selectElement && typeof populateGameDropdown === 'function') {
            await populateGameDropdown(dropdown.selectId, dropdown.loadingId);
        }
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
    lockBodyScroll('createTeamModal');

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
    unlockBodyScroll('createTeamModal');
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
window.displayGamesList = displayGamesList;
window.loadGamesForDropdown = loadGamesForDropdown;
window.refreshAllGameDropdowns = refreshAllGameDropdowns;
window.initializeCommunityFilters = initializeCommunityFilters;
window.applyDivisionFilter = applyDivisionFilter;
window.resetCommunityFilters = resetCommunityFilters;

// Team creation
window.openCreateTeamModal = openCreateTeamModal;
window.closeCreateTeamModal = closeCreateTeamModal;
window.setupCreateTeamForm = setupCreateTeamForm;

//Seasons systems
window.checkSeasonBeforeTeamCreation = checkSeasonBeforeTeamCreation;
window.displayActiveSeasonInfo = displayActiveSeasonInfo;