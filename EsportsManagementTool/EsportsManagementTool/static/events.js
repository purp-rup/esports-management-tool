/**
 * ============================================
 * EVENTS.JS - REFACTORED & CONSOLIDATED
 * ORGANIZED BY CLAUDEAI
 * ============================================
 * Handles all event-related functionality for the dashboard
 * Including: event loading, filtering, CRUD operations, modals, and notifications
 *
 */

// ============================================
// GLOBAL STATE MANAGEMENT
// ============================================

/**
 * Centralized state object for all event-related data
 * Prevents global variable sprawl and makes state management clearer
 */
const EventState = {
    // Current modal context
    currentEventId: null,
    currentEventData: null,

    // Delete confirmation
    currentDeleteEventId: null,
    currentDeleteEventName: '',
    deletionSource: 'events',
    deletionFromModal: false,

    // User permissions
    permissions: {
        is_developer: false,
        is_admin: false,
        is_gm: false
    },

    // Games cache and selection
    gamesListCache: null,
    selectedGames: [],

    // Calendar day modal data
    eventsData: {},

    /**
     * Reset state to defaults
     */
    reset() {
        this.currentEventId = null;
        this.currentEventData = null;
        this.currentDeleteEventId = null;
        this.currentDeleteEventName = '';
        this.selectedGames = [];
        this.deletionSource = 'events';
    },

    /**
     * Update user permissions
     */
    setPermissions(isAdmin, isGm, isDeveloper) {
        this.permissions.is_admin = isAdmin;
        this.permissions.is_gm = isGm;
        this.permissions.is_developer = isDeveloper;
    }
};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize events module when DOM is ready
 * @param {Object} eventsDataFromServer - Pre-loaded events data from server
 */
function initializeEventsModule(eventsDataFromServer) {
    EventState.eventsData = eventsDataFromServer || {};
    attachEventListeners();
    console.log('Events module initialized');
}

/**
 * Attach all event-related listeners
 * Centralized listener management for easier maintenance
 */
function attachEventListeners() {
    // Events tab click
    const eventsTab = document.querySelector('[data-tab="events"]');
    if (eventsTab) {
        eventsTab.addEventListener('click', () => setTimeout(loadEvents, 100));
    }

    // Delete modal background click (close on backdrop)
    const deleteModal = document.getElementById('deleteEventConfirmModal');
    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) closeDeleteConfirmModal();
        });
    }

    // Create event form submission (debugging removed)
    const createEventForm = document.getElementById('createEventForm');
    if (createEventForm) {
        createEventForm.addEventListener('submit', handleCreateEventSubmit);
    }

    // Location dropdown handler
    const locationSelect = document.getElementById('eventLocation');
    if (locationSelect) {
        locationSelect.addEventListener('change', handleLocationChange);
    }
}

// ============================================
// API & DATA LOADING
// ============================================

/**
 * Load events from the server with optional filtering
 * Handles loading states and error cases
 */
function loadEvents() {
    const elements = {
        loading: document.getElementById('eventsLoading'),
        container: document.getElementById('eventsContainer'),
        emptyState: document.getElementById('eventsEmptyState')
    };

    // Show loading state
    setElementDisplay(elements.loading, 'block');
    setElementDisplay(elements.container, 'none');
    setElementDisplay(elements.emptyState, 'none');

    // Build query parameters
    const queryParams = buildEventFilterParams();

    // Fetch events
    fetch(`/api/events?${queryParams}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                EventState.setPermissions(data.is_admin, data.is_developer, data.is_gm);
                renderEvents(data.events, data.is_admin, data.is_developer, data.is_gm);
            } else {
                console.error('Failed to load events:', data.message);
                showEventsError();
            }
        })
        .catch(error => {
            console.error('Error loading events:', error);
            showEventsError();
        })
        .finally(() => {
            setElementDisplay(elements.loading, 'none');
        });
}

/**
 * Build query parameters for event filtering
 * @returns {string} URL-encoded query string
 */
function buildEventFilterParams() {
    const filterSelect = document.getElementById('eventFilter');
    const filterValue = filterSelect?.value || 'all';

    let params = `filter=${filterValue}`;

    // Add past season filter if active
    if (PastSeasonFilterState.selectedSeasonId) {
        params += `&season_id=${PastSeasonFilterState.selectedSeasonId}`;
    }
    // Otherwise, backend will default to active season

    // Add event type filter if applicable
    if (filterValue === 'type') {
        const typeFilter = document.getElementById('eventTypeFilter')?.value;
        if (typeFilter) params += `&event_type=${typeFilter}`;
    }

    // Add game filter if applicable
    if (filterValue === 'game') {
        const gameFilter = document.getElementById('gameFilter')?.value;
        if (gameFilter) params += `&game=${encodeURIComponent(gameFilter)}`;
    }

    return params;
}

/**
 * Load games list from API (cached after first load)
 * @returns {Promise<Array>} Array of game objects
 */
async function loadGamesList() {
    if (EventState.gamesListCache) {
        return EventState.gamesListCache;
    }

    try {
        const response = await fetch('/api/games-list');
        const data = await response.json();

        if (data.success && data.games) {
            EventState.gamesListCache = data.games;
            return EventState.gamesListCache;
        } else {
            console.error('Failed to load games list');
            return [];
        }
    } catch (error) {
        console.error('Error fetching games list:', error);
        return [];
    }
}

/**
 * Clear the games cache (useful if games are added/updated)
 */
function clearGamesCache() {
    EventState.gamesListCache = null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Set element display style (with null check)
 * @param {HTMLElement|null} element - Element to modify
 * @param {string} displayValue - Display value ('block', 'none', etc.)
 */
function setElementDisplay(element, displayValue) {
    if (element) element.style.display = displayValue;
}

/**
 * Escape single quotes in strings for safe HTML attribute use
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeQuotes(str) {
    return str.replace(/'/g, "\\'");
}

/**
 * Convert 12-hour time format to 24-hour format for input[type="time"]
 * @param {string} time12h - Time in 12-hour format (e.g., "2:30 PM")
 * @returns {string} Time in 24-hour format (e.g., "14:30")
 */
function convertTo24Hour(time12h) {
    if (!time12h) return '';

    const [time, period] = time12h.split(' ');
    let [hours, minutes] = time.split(':');

    hours = parseInt(hours);

    if (period === 'PM' && hours !== 12) {
        hours += 12;
    } else if (period === 'AM' && hours === 12) {
        hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Check if current user can delete an event
 * Time-based deletion (24-hour window for creators, always for developers)
 * @param {Object} event - Event object
 * @returns {boolean} True if user can delete
 */
function canUserDeleteEvent(event) {
    const is_developer = window.userPermissions?.is_developer || false;
    const is_gm = window.userPermissions?.is_gm || false;
    const is_admin = window.userPermissions?.is_admin || false;
    const sessionUserId = window.currentUserId || 0;

    // Developers can always delete
    if (is_developer) {
        return true;
    }

    // Check if within 24-hour window
    if (!event.created_at) {
        return false;
    }

    const createdAt = new Date(event.created_at);
    const now = new Date();
    const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);
    const within24Hours = hoursSinceCreation <= 24;

    // Admins can delete ANY event within 24 hours
    if (is_admin) {
        return within24Hours;
    }

    // GMs can only delete events they created (within 24-hour window)
    if (is_gm) {
        // Must be the creator
        if (event.created_by !== sessionUserId) {
            return false;
        }

        return within24Hours; // FIXED: Use within24Hours instead of canDelete
    }

    // Non-GM, non-admin, non-developer users cannot delete
    return false;
}

/**
 * Get time remaining for deletion window
 * @param {string} createdAt - ISO timestamp of creation
 * @returns {string} Human-readable time remaining
 */
function getDeletionTimeRemaining(createdAt) {
    if (!createdAt) return null;

    const created = new Date(createdAt);
    const now = new Date();
    const deletionDeadline = new Date(created.getTime() + (24 * 60 * 60 * 1000));

    if (now >= deletionDeadline) {
        return null; // Window expired
    }

    const msRemaining = deletionDeadline - now;
    const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hoursRemaining > 0) {
        return `${hoursRemaining}h ${minutesRemaining}m remaining`;
    } else {
        return `${minutesRemaining}m remaining`;
    }
}

/**
 * Check if current user can edit an event
 * @param {Object} event - Event object
 * @returns {boolean} True if user can edit
 */
function canUserEditEvent(event) {
    const is_admin = window.userPermissions?.is_admin || false;
    const is_developer = window.userPermissions?.is_developer || false;
    const is_gm = window.userPermissions?.is_gm || false;
    const sessionUserId = window.currentUserId || 0;
    return is_admin || is_developer || (is_gm && event.created_by === sessionUserId);
}

// ============================================
// GAME TAG SYSTEM - UNIFIED FOR CREATE & EDIT
// ============================================
// This section consolidates all game selection logic
// Both create and edit modals use the same tag system

/**
 * Game tag configuration object
 * Defines element IDs for different contexts (create vs edit)
 */
const GameTagConfig = {
    create: {
        dropdown: 'gameDropdown',
        container: 'selectedGamesContainer',
        hiddenInput: 'selectedGamesInput',
        loadingIndicator: 'gameLoadingIndicator'
    },
    edit: {
        dropdown: 'editGameDropdown',
        container: 'editSelectedGamesContainer',
        hiddenInput: 'editSelectedGamesInput',
        loadingIndicator: 'editGameLoadingIndicator'
    }
};

/**
 * Initialize game tag selector for a specific context
 * @param {string} context - Either 'create' or 'edit'
 * @param {string} preSelectedGames - Comma-separated list of games to pre-select (for edit)
 */
async function initializeGameTagSelector(context = 'create', preSelectedGames = '') {
    const config = GameTagConfig[context];
    if (!config) {
        console.error(`Invalid context: ${context}`);
        return;
    }

    const dropdown = document.getElementById(config.dropdown);
    const loadingIndicator = document.getElementById(config.loadingIndicator);

    if (!dropdown) {
        console.warn(`${config.dropdown} element not found`);
        return;
    }

    // Show loading indicator
    setElementDisplay(loadingIndicator, 'block');

    try {
        // Load games list
        const games = await loadGamesList();

        // Populate dropdown
        dropdown.innerHTML = '<option value="">+ Add a game</option>';

        if (games.length === 0) {
            dropdown.innerHTML += '<option value="" disabled>No games available</option>';
        } else {
            games.forEach(game => {
                const option = document.createElement('option');
                option.value = game.GameTitle;
                option.textContent = game.GameTitle;
                dropdown.appendChild(option);
            });
        }

        // Parse and add pre-selected games (for edit mode)
        if (preSelectedGames && preSelectedGames !== 'N/A') {
            EventState.selectedGames = preSelectedGames
                .split(',')
                .map(g => g.trim())
                .filter(g => g);
        } else {
            EventState.selectedGames = [];
        }

        // Update display
        updateGameTagsDisplay(context);
        updateHiddenGamesInput(context);

        // Attach change listener
        attachGameDropdownListener(dropdown, context);
        updateDropdownOptions(context);

    } catch (error) {
        console.error('Error initializing game tag selector:', error);
        dropdown.innerHTML = '<option value="">Error loading games</option>';
    } finally {
        // Hide loading and ensure dropdown is enabled
        setElementDisplay(loadingIndicator, 'none');
        enableDropdown(dropdown);
    }
}

/**
 * Attach change listener to game dropdown
 * @param {HTMLElement} dropdown - The dropdown element
 * @param {string} context - Either 'create' or 'edit'
 */
function attachGameDropdownListener(dropdown, context) {
    // Remove existing listener by cloning
    const clone = dropdown.cloneNode(true);
    dropdown.replaceWith(clone);

    // Get fresh reference
    const newDropdown = document.getElementById(GameTagConfig[context].dropdown);
    if (!newDropdown) return;

    newDropdown.addEventListener('change', function() {
        const selectedGame = this.value;
        if (selectedGame && !EventState.selectedGames.includes(selectedGame)) {
            addGameTag(selectedGame, context);
        }
        this.value = ''; // Reset to placeholder
    });
}

/**
 * Enable a dropdown element (removes all disabled states)
 * @param {HTMLElement} dropdown - Dropdown to enable
 */
function enableDropdown(dropdown) {
    if (!dropdown) return;

    dropdown.removeAttribute('disabled');
    dropdown.disabled = false;
    dropdown.style.pointerEvents = 'auto';
    dropdown.style.opacity = '1';
    dropdown.style.cursor = 'pointer';
}

/**
 * Add a game tag to the selected games
 * @param {string} gameTitle - Title of game to add
 * @param {string} context - Either 'create' or 'edit'
 */
function addGameTag(gameTitle, context = 'create') {
    if (EventState.selectedGames.includes(gameTitle)) return;

    EventState.selectedGames.push(gameTitle);
    updateGameTagsDisplay(context);
    updateHiddenGamesInput(context);
    updateDropdownOptions(context);
}

/**
 * Remove a game tag from selected games
 * @param {string} gameTitle - Title of game to remove
 * @param {string} context - Either 'create' or 'edit'
 */
function removeGameTag(gameTitle, context = 'create') {
    EventState.selectedGames = EventState.selectedGames.filter(game => game !== gameTitle);
    updateGameTagsDisplay(context);
    updateHiddenGamesInput(context);
    updateDropdownOptions(context);
}

/**
 * Update the visual display of selected game tags
 * @param {string} context - Either 'create' or 'edit'
 */
function updateGameTagsDisplay(context = 'create') {
    const config = GameTagConfig[context];
    const container = document.getElementById(config.container);
    if (!container) return;

    container.innerHTML = '';

    EventState.selectedGames.forEach(game => {
        const tag = document.createElement('div');
        tag.className = 'game-tag';
        tag.innerHTML = `
            <i class="fas fa-gamepad game-tag-icon"></i>
            <span>${game}</span>
            <button type="button"
                    class="game-tag-remove"
                    onclick="removeGameTag('${escapeQuotes(game)}', '${context}')"
                    title="Remove ${game}">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(tag);
    });
}

/**
 * Update dropdown options to hide already-selected games
 * @param {string} context - Either 'create' or 'edit'
 */
function updateDropdownOptions(context = 'create') {
    const config = GameTagConfig[context];
    const dropdown = document.getElementById(config.dropdown);
    if (!dropdown) return;

    // Get all options except the placeholder
    const options = Array.from(dropdown.options);

    options.forEach(option => {
        if (option.value === '') return; // Skip placeholder

        // Hide if already selected, show if not
        if (EventState.selectedGames.includes(option.value)) {
            option.style.display = 'none';
            option.disabled = true;
        } else {
            option.style.display = '';
            option.disabled = false;
        }
    });
}

/**
 * Update the hidden input with selected games as JSON
 * @param {string} context - Either 'create' or 'edit'
 */
function updateHiddenGamesInput(context = 'create') {
    const config = GameTagConfig[context];
    const hiddenInput = document.getElementById(config.hiddenInput);
    if (hiddenInput) {
        hiddenInput.value = JSON.stringify(EventState.selectedGames);
    }
}

/**
 * Clear all selected games
 * @param {string} context - Either 'create' or 'edit'
 */
function clearSelectedGames(context = 'create') {
    EventState.selectedGames = [];
    updateGameTagsDisplay(context);
    updateHiddenGamesInput(context);
    updateDropdownOptions(context);
}

// ============================================
// SINGLE-SELECT GAME DROPDOWN (FOR FILTERS)
// ============================================

/**
 * Populate a single-select dropdown with games
 * Used for filtering, not for multi-select tag system
 * @param {string} selectId - ID of the select element
 * @param {string} loadingIndicatorId - ID of loading indicator (optional)
 * @param {string} selectedGame - Game to pre-select (optional)
 */
async function populateGameDropdown(selectId, loadingIndicatorId = null, selectedGame = null) {
    const selectElement = document.getElementById(selectId);
    if (!selectElement) return;

    const loadingIndicator = loadingIndicatorId ? document.getElementById(loadingIndicatorId) : null;

    // Show loading
    setElementDisplay(loadingIndicator, 'block');
    selectElement.disabled = true;

    try {
        const games = await loadGamesList();

        // Clear and populate
        selectElement.innerHTML = '<option value="">Select game</option>';

        if (games.length === 0) {
            selectElement.innerHTML += '<option value="" disabled>No games available</option>';
            return;
        }

        games.forEach(game => {
            const option = document.createElement('option');
            option.value = game.GameTitle;
            option.textContent = game.GameTitle;
            option.selected = (selectedGame && game.GameTitle === selectedGame);
            selectElement.appendChild(option);
        });

    } catch (error) {
        console.error('Error populating game dropdown:', error);
        selectElement.innerHTML = '<option value="">Error loading games</option>';
    } finally {
        setElementDisplay(loadingIndicator, 'none');
        selectElement.disabled = false;
    }
}

/**
 * Load games for filter dropdown
 */
async function loadGamesForFilter() {
    await populateGameDropdown('gameFilter', 'gameFilterLoadingIndicator');
}

// ============================================
// EVENT FILTERING
// ============================================

// Global state for season filtering
const PastSeasonFilterState = {
    selectedSeasonId: null,
    selectedSeasonName: '',
    availablePastSeasons: [],
    secondaryFilter: 'all',
    isFilteringPastSeason: false
};

/**
 * Load past seasons for filtering (admin/dev only)
 */
async function loadPastSeasonsForFilter() {
    const seasonSelect = document.getElementById('pastSeasonSelect');
    const loadingIndicator = document.getElementById('pastSeasonLoadingIndicator');

    if (!seasonSelect) return;

    // Show loading
    setElementDisplay(loadingIndicator, 'inline-block');
    seasonSelect.disabled = true;

    try {
        const response = await fetch('/api/seasons/past');
        const data = await response.json();

        if (data.success && data.seasons) {
            PastSeasonFilterState.availablePastSeasons = data.seasons;

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
        setElementDisplay(loadingIndicator, 'none');
        seasonSelect.disabled = false;
    }
}

/**
 * Filter events based on dropdown selection
 * Manages visibility of secondary filter dropdowns
 */
function filterEvents() {
    const filterSelect = document.getElementById('eventFilter');
    const filterValue = filterSelect?.value || 'all';

    const typeFilterContainer = document.getElementById('eventTypeFilterContainer');
    const typeFilterSelect = document.getElementById('eventTypeFilter');
    const gameFilterContainer = document.getElementById('gameFilterContainer');
    const gameFilterSelect = document.getElementById('gameFilter');

    // Past season-specific elements
    const pastSeasonSelectContainer = document.getElementById('pastSeasonSelectContainer');
    const pastSeasonSecondaryFilterContainer = document.getElementById('pastSeasonSecondaryFilterContainer');

    // Hide all secondary filters by default
    setElementDisplay(typeFilterContainer, 'none');
    setElementDisplay(gameFilterContainer, 'none');
    setElementDisplay(pastSeasonSelectContainer, 'none');
    setElementDisplay(pastSeasonSecondaryFilterContainer, 'none');

    // Reset secondary filters
    if (typeFilterSelect) typeFilterSelect.value = '';
    if (gameFilterSelect) gameFilterSelect.value = '';

    // Reset past season filter state
    PastSeasonFilterState.selectedSeasonId = null;
    PastSeasonFilterState.selectedSeasonName = '';
    PastSeasonFilterState.secondaryFilter = 'all';
    PastSeasonFilterState.isFilteringPastSeason = false;

    // Handle past season filter
    if (filterValue === 'past_season') {
        PastSeasonFilterState.isFilteringPastSeason = true;
        setElementDisplay(pastSeasonSelectContainer, 'flex');
        loadPastSeasonsForFilter();
        return; // Don't load events yet, wait for season selection
    }

    // Show appropriate secondary filter for non-season filters
    if (filterValue === 'type') {
        setElementDisplay(typeFilterContainer, 'flex');
        return;
    } else if (filterValue === 'game') {
        setElementDisplay(gameFilterContainer, 'flex');
        loadGamesForFilter();
        return;
    }

    updateFilterColumnsCount();

    // Load events with main filter (defaults to current active season on backend)
    loadEvents();
}

/* ================================
    SEASON FILTERING STUFF
   ================================ */

/**
 * Handle past season selection
 */
function handlePastSeasonSelection() {
    const seasonSelect = document.getElementById('pastSeasonSelect');
    const seasonId = seasonSelect?.value;
    const seasonSecondaryFilterContainer = document.getElementById('pastSeasonSecondaryFilterContainer');

    if (!seasonId) {
        // No season selected, hide secondary filter
        setElementDisplay(seasonSecondaryFilterContainer, 'none');
        PastSeasonFilterState.selectedSeasonId = null;
        PastSeasonFilterState.selectedSeasonName = '';
        return;
    }

    // Store selected past season
    PastSeasonFilterState.selectedSeasonId = seasonId;
    PastSeasonFilterState.selectedSeasonName = seasonSelect.options[seasonSelect.selectedIndex].text;

    // Show secondary filter
    setElementDisplay(seasonSecondaryFilterContainer, 'flex');

    // Reset secondary filter to "All Events"
    const secondaryFilter = document.getElementById('pastSeasonSecondaryFilter');
    if (secondaryFilter) {
        secondaryFilter.value = 'all';
    }

    // Load events for this past season
    loadEventsForPastSeason();

    updateFilterColumnsCount();
}

/**
 * Filter events by past season and secondary filter
 */
function filterEventsByPastSeason() {
    const secondaryFilter = document.getElementById('pastSeasonSecondaryFilter');
    const secondaryValue = secondaryFilter?.value || 'all';

    PastSeasonFilterState.secondaryFilter = secondaryValue;

    const typeFilterContainer = document.getElementById('eventTypeFilterContainer');
    const gameFilterContainer = document.getElementById('gameFilterContainer');

    // Hide both tertiary filters
    setElementDisplay(typeFilterContainer, 'none');
    setElementDisplay(gameFilterContainer, 'none');

    // Show appropriate tertiary filter
    if (secondaryValue === 'type') {
        setElementDisplay(typeFilterContainer, 'flex');
        return; // Wait for type selection
    } else if (secondaryValue === 'game') {
        setElementDisplay(gameFilterContainer, 'flex');
        loadGamesForFilter();
        return; // Wait for game selection
    }

    // Load events with secondary filter
    loadEventsForPastSeason();

    updateFilterColumnsCount();
}

/**
 * Filter by past season and type
 */
function filterBySeasonAndType() {
    const typeFilter = document.getElementById('eventTypeFilter');
    if (typeFilter?.value) {
        loadEventsForPastSeason();
    }
}

/**
 * Filter by past season and game
 */
function filterBySeasonAndGame() {
    const gameFilter = document.getElementById('gameFilter');
    if (gameFilter?.value) {
        loadEventsForPastSeason();
    }
}

/**
 * Handle type filter change - routes to correct function based on context
 */
function handleTypeFilterChange() {
    if (PastSeasonFilterState.isFilteringPastSeason) {
        filterBySeasonAndType();
    } else {
        filterEventsByType();
    }
}

/**
 * Handle game filter change - routes to correct function based on context
 */
function handleGameFilterChange() {
    if (PastSeasonFilterState.isFilteringPastSeason) {
        filterBySeasonAndGame();
    } else {
        filterEventsByGame();
    }
}

/**
 * Load events for selected past season with filters
 */
function loadEventsForPastSeason() {
    if (!PastSeasonFilterState.selectedSeasonId) {
        console.warn('No past season selected');
        return;
    }

    const elements = {
        loading: document.getElementById('eventsLoading'),
        container: document.getElementById('eventsContainer'),
        emptyState: document.getElementById('eventsEmptyState')
    };

    // Show loading state
    setElementDisplay(elements.loading, 'block');
    setElementDisplay(elements.container, 'none');
    setElementDisplay(elements.emptyState, 'none');

    // Build query parameters
    let queryParams = `season_id=${PastSeasonFilterState.selectedSeasonId}`;

    // Add secondary filter
    const secondaryFilter = PastSeasonFilterState.secondaryFilter;

    if (secondaryFilter === 'created_by_me') {
        queryParams += '&filter=created_by_me';
    } else if (secondaryFilter === 'type') {
        const typeFilter = document.getElementById('eventTypeFilter')?.value;
        if (typeFilter) {
            queryParams += `&filter=type&event_type=${typeFilter}`;
        }
    } else if (secondaryFilter === 'game') {
        const gameFilter = document.getElementById('gameFilter')?.value;
        if (gameFilter) {
            queryParams += `&filter=game&game=${encodeURIComponent(gameFilter)}`;
        }
    } else {
        // "all" - just use season filter
        queryParams += '&filter=all';
    }

    // Fetch events
    fetch(`/api/events?${queryParams}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                EventState.setPermissions(data.is_admin, data.is_developer, data.is_gm);
                renderEvents(data.events, data.is_admin, data.is_developer, data.is_gm);

                // Update empty state message for season filtering
                updatePastSeasonEmptyStateMessage();
            } else {
                console.error('Failed to load events:', data.message);
                showEventsError();
            }
        })
        .catch(error => {
            console.error('Error loading events:', error);
            showEventsError();
        })
        .finally(() => {
            setElementDisplay(elements.loading, 'none');
        });
}

/**
 * Update empty state message for past season filtering
 */
function updatePastSeasonEmptyStateMessage() {
    const emptyStateDiv = document.getElementById('eventsEmptyState');
    const emptyStateTitle = emptyStateDiv?.querySelector('h3');
    const emptyStateText = emptyStateDiv?.querySelector('p');

    if (!emptyStateTitle || !emptyStateText) return;

    const seasonName = PastSeasonFilterState.selectedSeasonName;
    const secondaryFilter = PastSeasonFilterState.secondaryFilter;

    let title = `No Events in ${seasonName}`;
    let text = `No events found for ${seasonName}.`;

    if (secondaryFilter === 'created_by_me') {
        title = `No Events Created in ${seasonName}`;
        text = `You haven't created any events in ${seasonName}.`;
    } else if (secondaryFilter === 'type') {
        const typeSelect = document.getElementById('eventTypeFilter');
        const typeName = typeSelect?.options[typeSelect.selectedIndex]?.text || 'Selected';
        title = `No ${typeName} Events in ${seasonName}`;
        text = `No ${typeName.toLowerCase()} events found in ${seasonName}.`;
    } else if (secondaryFilter === 'game') {
        const gameSelect = document.getElementById('gameFilter');
        const gameName = gameSelect?.options[gameSelect.selectedIndex]?.text || 'Selected Game';
        title = `No ${gameName} Events in ${seasonName}`;
        text = `No events found for ${gameName} in ${seasonName}.`;
    }

    emptyStateTitle.textContent = title;
    emptyStateText.textContent = text;
}

/**
 * Filter events by type (called when type dropdown changes)
 */
function filterEventsByType() {
    const typeFilterSelect = document.getElementById('eventTypeFilter');
    if (typeFilterSelect?.value) {
        loadEvents();
    }
}

/**
 * Filter events by game (called when game dropdown changes)
 */
function filterEventsByGame() {
    const gameFilterSelect = document.getElementById('gameFilter');
    if (gameFilterSelect?.value) {
        loadEvents();
    }
}

/**
 * Update the number of visible filter columns
 * Adds data-columns attribute for CSS styling
 */
function updateFilterColumnsCount() {
    const filterContainer = document.querySelector('.event-filters-container');
    if (!filterContainer) return;

    // Count visible filter dropdowns
    const visibleFilters = filterContainer.querySelectorAll('.event-filter-dropdown:not([style*="display: none"])');
    const columnCount = visibleFilters.length > 1 ? '2' : '1';

    filterContainer.setAttribute('data-columns', columnCount);
}

// ============================================
// EVENT RENDERING
// ============================================

/**
 * Render events in the grid
 * @param {Array} events - Array of event objects
 * @param {boolean} isAdmin - Whether user is admin
 * @param {boolean} isGm - Whether user is GM
 */
function renderEvents(events, isAdmin, isGm) {
    const containerDiv = document.getElementById('eventsContainer');
    const emptyStateDiv = document.getElementById('eventsEmptyState');

    if (events.length === 0) {
        setElementDisplay(containerDiv, 'none');
        setElementDisplay(emptyStateDiv, 'block');
        updateEmptyStateMessage();
        return;
    }

    const gridHTML = `<div class="events-grid">${
        events.map(event => createEventCard(event, isAdmin, isGm)).join('')
    }</div>`;

    containerDiv.innerHTML = gridHTML;
    setElementDisplay(containerDiv, 'block');
    setElementDisplay(emptyStateDiv, 'none');
}

function createEventCard(event, isAdmin, isGm) {
    const canDelete = canUserDeleteEvent(event);

    const ongoingIndicator = event.is_ongoing
        ? '<div class="event-ongoing-indicator" title="Event is currently ongoing"></div>'
        : '';

    // Build delete button
    let deleteButton = '';
    if (canDelete) {
        deleteButton = `
            <button class="btn btn-secondary btn-delete"
                    onclick="event.stopPropagation(); openDeleteEventModal(${event.id}, '${escapeQuotes(event.name)}')">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }

    const gameDisplay = formatGameDisplay(event.game);
    const eventTypeClass = (event.event_type || 'event').toLowerCase();
    const scheduledClass = event.is_scheduled ? 'scheduled-event' : '';

    const seasonIndicator = event.season_name ? `
        <div class="event-season-indicator" title="${event.season_is_active ? 'Active Season' : 'Past Season'}">
            <span style="color: ${event.season_is_active ? '#22c55e' : '#94a3b8'};">●</span>
            ${event.season_name}
        </div>
    ` : '';

    return `
        <div class="event-card ${scheduledClass}"
             data-event-type="${eventTypeClass}"
             ${event.is_scheduled ? `data-scheduled="true" data-schedule-id="${event.schedule_id}"` : ''}
             onclick="openEventModal(${event.id})">
            ${ongoingIndicator}
            <div class="event-card-header">
                <h3 class="event-card-title">${event.name}</h3>
                ${seasonIndicator}
            </div>

            <div class="event-card-details">
                ${createEventDetailRow('calendar', 'Date', event.date)}
                ${event.start_time ? createEventDetailRow('clock', 'Time', `${event.start_time} - ${event.end_time}`) : ''}
                ${createEventDetailRow('tag', 'Type', `<span class="event-type-badge" data-type="${eventTypeClass}">${event.event_type}</span>`)}
                ${createEventDetailRow('gamepad', 'Game', gameDisplay)}
                ${createEventDetailRow('map-marker-alt', 'Location', event.location)}
            </div>

            <div class="event-card-actions">
                <button class="btn btn-primary" onclick="event.stopPropagation(); openEventModal(${event.id})">
                    <i class="fas fa-eye"></i> View Details
                </button>
                ${deleteButton}
            </div>
        </div>
    `;
}

/**
 * Create a detail row for event card
 * @param {string} icon - FontAwesome icon name (without 'fa-' prefix)
 * @param {string} label - Label text
 * @param {string} value - Value HTML
 * @returns {string} HTML string for detail row
 */
function createEventDetailRow(icon, label, value) {
    return `
        <div class="event-detail-row">
            <div class="event-detail-icon">
                <i class="fas fa-${icon}"></i>
            </div>
            <span class="event-detail-label">${label}:</span>
            <span class="event-detail-value">${value}</span>
        </div>
    `;
}

/**
 * Format game display (truncate if multiple games)
 * @param {string} gameStr - Comma-separated game string
 * @returns {string} Formatted game display string
 */
function formatGameDisplay(gameStr) {
    if (!gameStr || gameStr === 'N/A') return 'None';

    const games = gameStr.split(', ');
    if (games.length > 2) {
        return `${games.slice(0, 2).join(', ')} +${games.length - 2} more`;
    }
    return gameStr;
}

/**
 * Update empty state message based on current filter
 */
function updateEmptyStateMessage() {
    const emptyStateDiv = document.getElementById('eventsEmptyState');
    const filterSelect = document.getElementById('eventFilter');
    const filterValue = filterSelect?.value || 'all';

    const emptyStateTitle = emptyStateDiv.querySelector('h3');
    const emptyStateText = emptyStateDiv.querySelector('p');

    if (!emptyStateTitle || !emptyStateText) return;

    // Get filter-specific messages
    const message = getEmptyStateMessage(filterValue);
    emptyStateTitle.textContent = message.title;
    emptyStateText.textContent = message.text;
}

/**
 * Get empty state message based on filter type
 * @param {string} filterValue - Current filter value
 * @returns {Object} Object with title and text properties
 */
function getEmptyStateMessage(filterValue) {
    const messages = {
        subscribed: {
            title: 'No Subscribed Events',
            text: 'You haven\'t subscribed to any events yet. Browse "All Events" and subscribe to events you\'re interested in.'
        },
        upcoming: {
            title: 'No Upcoming Events',
            text: 'No events scheduled for the next 7 days. Check "All Events" to see all events.'
        },
        upcoming14: {
            title: 'No Upcoming Events',
            text: 'No events scheduled for the next 14 days. Check "All Events" to see all events.'
        },
        past30: {
            title: 'No Past Events',
            text: 'No events found in the last 30 days. Check "All Events" to see all events.'
        },
        created_by_me: {
            title: 'No Events Created',
            text: 'You haven\'t created any events yet. Click "Create Event" to add your first event.'
        }
    };

    // Handle type filter
    if (filterValue === 'type') {
        const typeSelect = document.getElementById('eventTypeFilter');
        const typeName = typeSelect?.options[typeSelect.selectedIndex]?.text || 'Selected';
        return {
            title: `No ${typeName} Events`,
            text: `No ${typeName.toLowerCase()} events found. Try a different filter.`
        };
    }

    // Handle game filter
    if (filterValue === 'game') {
        const gameSelect = document.getElementById('gameFilter');
        const gameName = gameSelect?.options[gameSelect.selectedIndex]?.text || 'Selected Game';
        return {
            title: `No ${gameName} Events`,
            text: `No events found for ${gameName}. Try a different filter.`
        };
    }

    // Return specific message or default
    if (messages[filterValue]) {
        return messages[filterValue];
    }

    // Default message
    const canCreate = window.userPermissions?.is_admin || window.userPermissions.is_developer || window.userPermissions?.is_gm;
    return {
        title: 'No Events Found',
        text: canCreate
            ? 'Click "Create Event" to add your first event'
            : 'Subscribe to events to see them here, or check back later'
    };
}

/**
 * Show error state when events fail to load
 */
function showEventsError() {
    const containerDiv = document.getElementById('eventsContainer');
    if (!containerDiv) return;

    containerDiv.innerHTML = `
        <div class="events-info-message">
            <i class="fas fa-exclamation-circle"></i>
            <p>Failed to load events. Please refresh the page to try again.</p>
        </div>
    `;
    setElementDisplay(containerDiv, 'block');
}

// ============================================
// EVENT DETAILS MODAL - VIEW & MANAGEMENT
// ============================================

/**
 * Open event details modal
 * @param {number} eventId - ID of event to display
 */
async function openEventModal(eventId, source = 'events') {
    const modal = document.getElementById('eventDetailsModal');
    const spinner = document.getElementById('eventLoadingSpinner');
    const content = document.getElementById('eventDetailsContent');
    const deleteBtn = document.getElementById('deleteEventBtn');
    const titleElement = document.getElementById('eventDetailsTitle');

    EventState.currentEventId = eventId;
    EventState.deletionSource = source;

    // Set initial loading state
    if (titleElement) titleElement.textContent = 'Loading...';
    setModalLoadingState(modal, spinner, content, deleteBtn, true);

    try {
        // Fetch event details
        const response = await fetch(`/api/event/${eventId}`);
        if (!response.ok) throw new Error('Failed to fetch event details');

        const event = await response.json();
        EventState.currentEventData = event;

        // Add event type for styling
        const eventTypeClass = (event.event_type || 'event').toLowerCase();
        modal.setAttribute('data-event-type', eventTypeClass);

        // Update modal content
        if (titleElement) titleElement.textContent = event.name || 'Event Details';
        content.innerHTML = buildEventDetailsHTML(event);

        // Show content and update buttons
        setModalLoadingState(modal, spinner, content, deleteBtn, false);
        updateEventModalButtons(event);

        // Load notification section
        await loadNotificationSection(eventId);

    } catch (error) {
        console.error('Error loading event details:', error);
        handleEventLoadError(titleElement, content, spinner);
    }
}

/**
 * Set modal loading state
 * @param {HTMLElement} modal - Modal element
 * @param {HTMLElement} spinner - Spinner element
 * @param {HTMLElement} content - Content element
 * @param {HTMLElement} deleteBtn - Delete button element
 * @param {boolean} isLoading - Whether modal is loading
 */
function setModalLoadingState(modal, spinner, content, deleteBtn, isLoading) {
    modal.style.display = 'block';
    setElementDisplay(spinner, isLoading ? 'block' : 'none');
    setElementDisplay(content, isLoading ? 'none' : 'block');
    setElementDisplay(deleteBtn, isLoading ? 'none' : 'flex');
    document.body.style.overflow = 'hidden';
}

/**
 * Build event details HTML
 * @param {Object} event - Event object
 * @returns {string} HTML string for event details
 */
function buildEventDetailsHTML(event) {
    const sections = [];

    // Date section
    sections.push(createDetailSection('calendar-alt', 'Date', event.date));

    // Time section (if exists)
    if (event.start_time) {
        const timeStr = `${event.start_time}${event.end_time ? ' - ' + event.end_time : ''}`;
        sections.push(createDetailSection('clock', 'Time', timeStr));
    }

    // Event Type section
    if (event.event_type) {
        sections.push(createDetailSection('tag', 'Event Type', event.event_type));
    }

    // Game section
    if (event.game) {
        sections.push(createDetailSection('gamepad', 'Game', event.game));
    }

    // Location section (full width)
    if (event.location) {
        sections.push(createDetailSection('map-marker-alt', 'Location', event.location, true));
    }

    // Description section (full width)
    sections.push(`
        <div class="event-detail-section full-width">
            <div style="display: flex; gap: 0.75rem;">
                <div class="event-detail-icon"><i class="fas fa-info-circle"></i></div>
                <div class="event-detail-content">
                    <h3>Description</h3>
                    <p>${event.description}</p>
                </div>
            </div>
        </div>
    `);

    // Notification section (full width)
    sections.push(createNotificationSection());

    return `<div class="event-detail-grid">${sections.join('')}</div>`;
}

/**
 * Create a detail section for event modal
 * @param {string} icon - FontAwesome icon name
 * @param {string} title - Section title
 * @param {string} content - Section content
 * @param {boolean} fullWidth - Whether section spans full width
 * @returns {string} HTML string for detail section
 */
function createDetailSection(icon, title, content, fullWidth = false) {
    const style = fullWidth ? ' style="grid-column: 1 / -1;"' : '';
    return `
        <div class="event-detail-section"${style}>
            <div class="event-detail-icon"><i class="fas fa-${icon}"></i></div>
            <div class="event-detail-content">
                <h3>${title}</h3>
                <p>${content}</p>
            </div>
        </div>
    `;
}

/**
 * Create notification section HTML
 * @returns {string} HTML string for notification section
 */
function createNotificationSection() {
    return `
        <div class="event-notification-section full-width"
             id="eventNotificationSection"
             style="grid-column: 1 / -1;">
            <div class="notification-opt-in" style="width: 100%; display: flex; justify-content: center;">
                <div class="notification-icon">
                    <i class="fas fa-bell" style="font-size: 1.5rem;"></i>
                </div>
                <div class="notification-text">
                    <div class="title">Event Reminders</div>
                    <div class="subtitle">Get notified about this event</div>
                </div>
                <button class="notification-btn" id="notificationBtn" onclick="toggleEventSubscription()">
                    <span id="notificationBtnText">Loading...</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Update edit/delete buttons based on permissions
 */
function updateEventModalButtons(event) {
    const editBtn = document.getElementById("editEventBtn");
    const deleteBtn = document.getElementById("deleteEventBtn");

    // Show edit button if user can edit
    if (editBtn && canUserEditEvent(event)) {
        editBtn.style.display = 'flex';
    } else {
        if (editBtn) editBtn.style.display = 'none';
    }

    // Show delete button if user can delete
    if (deleteBtn) {
        const canDelete = canUserDeleteEvent(event);

        if (canDelete) {
            // Simple trash icon only
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = 'Delete event';

            deleteBtn.style.display = 'flex';
        } else {
            deleteBtn.style.display = 'none';
        }
    } else {
        console.error('Delete button element not found!');
    }
}

/**
 * Handle event load error
 * @param {HTMLElement} titleElement - Title element
 * @param {HTMLElement} content - Content element
 * @param {HTMLElement} spinner - Spinner element
 */
function handleEventLoadError(titleElement, content, spinner) {
    if (titleElement) {
        titleElement.textContent = 'Error Loading Event';
    }

    content.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: #ff5252; margin-bottom: 1rem;"></i>
            <p>Failed to load event details. Please try again.</p>
            <button class="btn btn-primary" onclick="closeEventModal()" style="margin-top: 1rem;">Close</button>
        </div>
    `;

    setElementDisplay(spinner, 'none');
    setElementDisplay(content, 'block');
}

/**
 * Close event details modal
 */
function closeEventModal() {
    const modal = document.getElementById('eventDetailsModal');
    const deleteBtn = document.getElementById("deleteEventBtn");
    const editBtn = document.getElementById("editEventBtn");
    const content = document.getElementById("eventDetailsContent");
    const editForm = document.getElementById("eventEditForm");

    // Hide modal and its elements
    setElementDisplay(modal, 'none');
    setElementDisplay(deleteBtn, 'none');
    setElementDisplay(editBtn, 'none');
    setElementDisplay(content, 'none');
    setElementDisplay(editForm, 'none');

    // Check if there are other modals still open before restoring scroll
    const openModals = document.querySelectorAll('.modal');
    const hasOpenModals = Array.from(openModals).some(m => {
        if (m.id === 'eventDetailsModal') return false;
        const style = window.getComputedStyle(m);
        return style.display === 'block' || style.display === 'flex' || m.classList.contains('active');
    });

    if (!hasOpenModals) {
        document.body.style.overflow = "auto";
    }

    EventState.reset();
}

// ============================================
// EVENT NOTIFICATIONS
// ============================================

/**
 * Load notification section for an event
 * @param {number} eventId - Event ID
 */
async function loadNotificationSection(eventId) {
    const btn = document.getElementById('notificationBtn');
    const btnText = document.getElementById('notificationBtnText');

    if (!btn || !btnText) return;

    try {
        const response = await fetch(`/api/event/${eventId}/subscription-status`);
        const data = await response.json();

        // Check if notifications are enabled
        if (!data.notifications_enabled) {
            btn.disabled = true;
            btn.classList.add('disabled');
            btnText.textContent = 'Enable notifications in Profile';
            return;
        }

        // Update subscription status
        btn.disabled = false;
        btn.classList.remove('disabled');
        btn.classList.toggle('subscribed', data.subscribed);
        btnText.textContent = data.subscribed ? 'Subscribed' : 'Subscribe';

    } catch (err) {
        console.error('Error fetching subscription status:', err);
        btn.disabled = true;
        btnText.textContent = 'Error';
    }
}

/**
 * Toggle event subscription
 */
async function toggleEventSubscription() {
    const btn = document.getElementById('notificationBtn');
    const btnText = document.getElementById('notificationBtnText');

    if (!EventState.currentEventId) return;

    try {
        const response = await fetch(
            `/api/event/${EventState.currentEventId}/toggle-subscription`,
            { method: 'POST' }
        );
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        // Update button state
        const isSubscribed = data.status === 'subscribed';
        btn.classList.toggle('subscribed', isSubscribed);
        btnText.textContent = isSubscribed ? 'Subscribed' : 'Subscribe';

    } catch (err) {
        console.error('Error toggling subscription:', err);
        alert('Failed to toggle subscription.');
    }
}

// ============================================
// CREATE EVENT MODAL
// ============================================

/**
 * Open create event modal
 */
function openCreateEventModal() {
    const modal = document.getElementById('createEventModal');
    const form = document.getElementById('createEventForm');
    const customLocationGroup = document.getElementById('customLocationGroup');
    const formMessage = document.getElementById('formMessage');

    // Show modal
    setElementDisplay(modal, 'block');
    document.body.style.overflow = 'hidden';

    // Reset form and state
    form.reset();
    setElementDisplay(customLocationGroup, 'none');
    setElementDisplay(formMessage, 'none');
    clearSelectedGames('create');

    // Load games after modal is rendered
    setTimeout(() => {
        const dropdown = document.getElementById('gameDropdown');
        if (dropdown) {
            enableDropdown(dropdown);
        }
        initializeGameTagSelector('create');
    }, 50);
}

/**
 * Close create event modal
 */
function closeCreateEventModal() {
    const modal = document.getElementById('createEventModal');
    setElementDisplay(modal, 'none');
    document.body.style.overflow = 'auto';
}

/**
 * Handle location dropdown change
 * Shows/hides custom location input
 * @param {Event} e - Change event
 */
function handleLocationChange(e) {
    const customLocationGroup = document.getElementById('customLocationGroup');
    const customLocationInput = document.getElementById('customLocation');

    if (e.target.value === 'other') {
        setElementDisplay(customLocationGroup, 'block');
        customLocationInput.required = true;
    } else {
        setElementDisplay(customLocationGroup, 'none');
        customLocationInput.required = false;
        customLocationInput.value = '';
    }
}

/**
 * Handle event type change - hide game field for Misc events
 */
function handleEventTypeChange() {
    const eventType = document.getElementById('eventType')?.value;
    const gameFieldGroup = document.getElementById('gameFieldGroup');

    if (eventType === 'Misc') {
        setElementDisplay(gameFieldGroup, 'none');
        clearSelectedGames('create');
    } else {
        setElementDisplay(gameFieldGroup, 'block');
    }
}

/**
 * Toggle all-day event button
 * Switches between "All Day?" and "All Day" states
 * Manages time input states accordingly
 */
function toggleAllDayEvent() {
    const allDayCheckbox = document.getElementById('allDayEvent');
    const allDayButton = document.getElementById('allDayButton');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');

    if (!allDayCheckbox || !allDayButton || !startTimeInput || !endTimeInput) return;

    // Toggle checkbox state
    allDayCheckbox.checked = !allDayCheckbox.checked;

    if (allDayCheckbox.checked) {
        // Activate all-day mode
        allDayButton.textContent = 'ALL DAY';
        allDayButton.classList.add('active');

        // Set all-day times
        startTimeInput.value = '00:00';
        endTimeInput.value = '23:59';

        // Make inputs read-only
        startTimeInput.readOnly = true;
        endTimeInput.readOnly = true;
        startTimeInput.style.opacity = '0.5';
        endTimeInput.style.opacity = '0.5';

        // Remove required attribute
        startTimeInput.removeAttribute('required');
        endTimeInput.removeAttribute('required');
    } else {
        // Deactivate all-day mode
        allDayButton.textContent = 'ALL DAY?';
        allDayButton.classList.remove('active');

        // Clear times
        startTimeInput.value = '';
        endTimeInput.value = '';

        // Enable inputs
        startTimeInput.readOnly = false;
        endTimeInput.readOnly = false;
        startTimeInput.style.opacity = '1';
        endTimeInput.style.opacity = '1';

        // Add required attribute back
        startTimeInput.setAttribute('required', 'required');
        endTimeInput.setAttribute('required', 'required');
    }
}

/**
 * Handle create event form submission
 * @param {Event} e - Submit event
 */
async function handleCreateEventSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const submitBtnText = document.getElementById('submitBtnText');
    const submitBtnSpinner = document.getElementById('submitBtnSpinner');
    const formMessage = document.getElementById('formMessage');

    // Set loading state
    submitBtn.disabled = true;
    setElementDisplay(submitBtnText, 'none');
    setElementDisplay(submitBtnSpinner, 'inline-block');

    const formData = new FormData(e.target);

    // Handle custom location
    const location = formData.get('eventLocation');
    if (location === 'other') {
        formData.set('eventLocation', formData.get('customLocation'));
    }
    formData.delete('customLocation');

    try {
        const response = await fetch('/event-register', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Direct manipulation
            formMessage.innerHTML = (data.message || 'Event created successfully! Refreshing calendar...').replace(/\n/g, '<br>');
            formMessage.className = 'form-message success';
            formMessage.style.display = 'block';

            setTimeout(() => window.location.reload(), 350);
        } else {
            throw new Error(data.message || 'Failed to create event');
        }
    } catch (error) {
        // Direct manipulation for error
        formMessage.textContent = error.message || 'Failed to create event. Please try again.';
        formMessage.className = 'form-message error';
        formMessage.style.display = 'block';

        // Reset button state
        submitBtn.disabled = false;
        setElementDisplay(submitBtnText, 'inline');
        setElementDisplay(submitBtnSpinner, 'none');
    }
}

// ============================================
// DAY MODAL (CALENDAR VIEW)
// ============================================

/**
 * Open day events modal (for calendar view)
 * @param {string} date - Date string
 * @param {string} dateTitle - Formatted date title
 */
function openDayModal(date, dateTitle) {
    const modal = document.getElementById('dayEventsModal');
    const modalTitle = document.getElementById('modalDayTitle');
    const modalBody = document.getElementById('modalEventsList');

    modalTitle.textContent = dateTitle;
    const events = EventState.eventsData[date] || [];

    // Clear and populate modal body
    modalBody.innerHTML = '';

    if (events.length > 0) {
        events.forEach(event => {
            const eventItem = createDayModalEventItem(event);
            modalBody.appendChild(eventItem);
        });
    } else {
        modalBody.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No events scheduled for this day.</p>';
    }

    setElementDisplay(modal, 'block');
    document.body.style.overflow = 'hidden';
}

/**
 * Create event item for day modal
 * @param {Object} event - Event object
 * @returns {HTMLElement} Event item element
 */
function createDayModalEventItem(event) {
    const eventItem = document.createElement('div');
    eventItem.className = 'modal-event-item';
    eventItem.onclick = (e) => {
        e.stopPropagation();
        closeDayModal();
        openEventModal(event.id);
    };

    let eventHTML = '';
    if (event.time) {
        eventHTML += `<div class="modal-event-time"><i class="fas fa-clock"></i> ${event.time}</div>`;
    }
    eventHTML += `<div class="modal-event-title">${event.title}</div>`;
    if (event.description) {
        eventHTML += `<div class="modal-event-description">${event.description}</div>`;
    }

    eventItem.innerHTML = eventHTML;
    return eventItem;
}

/**
 * Close day modal
 */
function closeDayModal() {
    const modal = document.getElementById('dayEventsModal');
    setElementDisplay(modal, 'none');
    document.body.style.overflow = 'auto';
}

// ============================================
// EDIT EVENT MODAL
// ============================================

/**
 * Toggle edit mode
 * Switches from view mode to edit mode in the event modal
 */
function toggleEditMode() {
    const content = document.getElementById('eventDetailsContent');
    const editForm = document.getElementById('eventEditForm');
    const editBtn = document.getElementById('editEventBtn');
    const deleteBtn = document.getElementById('deleteEventBtn');
    const titleElement = document.getElementById('eventDetailsTitle');

    // Hide view mode, show edit mode
    setElementDisplay(content, 'none');
    setElementDisplay(editForm, 'block');
    setElementDisplay(editBtn, 'none');
    setElementDisplay(deleteBtn, 'none');

    if (titleElement) {
        titleElement.textContent = 'Edit Event';
    }

    createEditForm();
}

/**
 * Create edit form with pre-populated data
 */
function createEditForm() {
    const editForm = document.getElementById('eventEditForm');
    if (!EventState.currentEventData) return;

    const event = EventState.currentEventData;

    // Set the HTML
    editForm.innerHTML = createEditFormFields(event);

    // Initialize game tag selector
    initializeGameTagSelector('edit', event.game);
    
    // Setup location dropdown
    setupEditLocationDropdown(event.location);
    
    // Handle event type (will show/hide league field)
    handleEditEventTypeChange();
    
    // Load and set league if this is a Match event
    if (event.event_type === 'Match') {
        loadLeaguesForEventEdit().then(() => {
            const leagueDropdown = document.getElementById('editEventLeagueDropdown');
            if (leagueDropdown && event.league_id) {
                leagueDropdown.value = event.league_id;
            }
        });
    }
}

/**
 * Create edit form fields
 * @param {Object} event - Event object
 * @returns {string} HTML string for form fields
 */
function createEditFormFields(event) {
    // Escape the description to prevent HTML injection and quote issues
    const escapedDescription = (event.description || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    return `
        <form id="editEventFormData" class="event-form-modal">
            <div class="form-group">
                <label for="editEventName">Event Name *</label>
                <input type="text" 
                       id="editEventName" 
                       name="eventName" 
                       value="${event.name || ''}" 
                       required>
            </div>

            <div class="form-group">
                <label for="editEventType">Event Type *</label>
                <select id="editEventType" name="eventType" required onchange="handleEditEventTypeChange()">
                    <option value="Event" ${event.event_type === 'Event' ? 'selected' : ''}>Event</option>
                    <option value="Match" ${event.event_type === 'Match' ? 'selected' : ''}>Match</option>
                    <option value="Practice" ${event.event_type === 'Practice' ? 'selected' : ''}>Practice</option>
                    <option value="Tournament" ${event.event_type === 'Tournament' ? 'selected' : ''}>Tournament</option>
                    <option value="Misc" ${event.event_type === 'Misc' ? 'selected' : ''}>Misc</option>
                </select>
            </div>

            <!-- Games Field -->
            <div class="form-group" id="editGameFieldGroup">
                <label for="editGameDropdown">Games (Optional)</label>
                <div style="color: var(--text-secondary); font-size: 0.8125rem; margin-bottom: 0.5rem;">
                    Select games from the dropdown - they'll appear as tags below
                </div>

                <div id="editSelectedGamesContainer" class="selected-games-container"></div>

                <select id="editGameDropdown" class="game-dropdown-single">
                    <option value="">+ Add a game</option>
                </select>

                <div id="editGameLoadingIndicator" style="display: none; margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">
                    <i class="fas fa-spinner fa-spin"></i> Loading games...
                </div>

                <input type="hidden" id="editSelectedGamesInput" name="games" value="[]">
            </div>

            <!-- League Field (only shown for Match events) -->
            <div class="form-group" id="editEventLeagueFieldGroup" style="display: ${event.event_type === 'Match' ? 'flex' : 'none'};">
                <label for="editEventLeagueDropdown">League ${event.event_type === 'Match' ? '*' : '(Optional)'}</label>
                <select id="editEventLeagueDropdown" 
                        name="league_id" 
                        class="game-dropdown-single" 
                        ${event.event_type === 'Match' ? 'required' : ''}>
                    <option value="">Select league</option>
                    <!-- Will be populated by JavaScript -->
                </select>
                <div id="editEventLeagueLoadingIndicator" style="display: none; margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">
                    <i class="fas fa-spinner fa-spin"></i> Loading leagues...
                </div>
            </div>

            <div class="form-group">
                <label for="editDate">Date *</label>
                <input type="date" 
                       id="editDate" 
                       name="eventDate" 
                       value="${event.date_raw || ''}" 
                       required>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="editStartTime">Start Time *</label>
                    <input type="time" 
                           id="editStartTime" 
                           name="startTime"
                           value="${convertTo24Hour(event.start_time)}" 
                           required>
                </div>
                <div class="form-group">
                    <label for="editEndTime">End Time *</label>
                    <input type="time" 
                           id="editEndTime" 
                           name="endTime"
                           value="${convertTo24Hour(event.end_time)}" 
                           required>
                </div>
            </div>

            <div class="form-group">
                <label for="editLocation">Location *</label>
                <select id="editLocation" name="eventLocation" required>
                    <option value="">Select location</option>
                    <option value="Campus Center">Campus Center</option>
                    <option value="Campus Center Coffee House">Campus Center Coffee House</option>
                    <option value="Campus Center Event Room">Campus Center Event Room</option>
                    <option value="D-108">D-108</option>
                    <option value="Esports Lab (Commons Building 80)">Esports Lab (Commons Building 80)</option>
                    <option value="Lakeside Lodge">Lakeside Lodge</option>
                    <option value="Online">Online</option>
                    <option value="other">Other</option>
                </select>
            </div>

            <div class="form-group" id="editCustomLocationGroup" style="display: none;">
                <label for="editCustomLocation">Custom Location</label>
                <input type="text" 
                       id="editCustomLocation" 
                       name="customLocation" 
                       placeholder="Enter custom location">
            </div>

            <div class="form-group">
                <label for="editDescription">Description *</label>
                <textarea id="editDescription" 
                          name="eventDescription" 
                          rows="4"
                          required>${escapedDescription}</textarea>
            </div>

            <div id="editFormMessage" class="form-message" style="display: none;"></div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="cancelEdit()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button type="button" class="btn btn-primary" onclick="submitEventEdit()">
                    <i class="fas fa-save"></i> Save Changes
                </button>
            </div>
        </form>
    `;
}

/**
 * Create event type options
 * @param {string} selectedType - Currently selected type
 * @returns {string} HTML string for options
 */
function createEventTypeOptions(selectedType) {
    const types = ['Event', 'Match', 'Practice', 'Tournament', 'Misc'];
    return types.map(type =>
        `<option value="${type}" ${selectedType === type ? 'selected' : ''}>${type}</option>`
    ).join('');
}

/**
 * Create game tag field
 * @param {string} context - 'create' or 'edit'
 * @returns {string} HTML string for game tag field
 */
function createGameTagField(context) {
    const prefix = context === 'edit' ? 'edit' : '';
    const idPrefix = prefix ? `${prefix}` : '';
    const capitalPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);

    return `
        <div class="form-group" id="${idPrefix}GameFieldGroup">
            <label for="${idPrefix}GameDropdown">Games (Optional)</label>
            <div style="color: var(--text-secondary); font-size: 0.8125rem; margin-bottom: 0.5rem;">
                Select games from the dropdown - they'll appear as tags below
            </div>

            <div id="${idPrefix}SelectedGamesContainer" class="selected-games-container"></div>

            <select id="${idPrefix}GameDropdown" class="game-dropdown-single">
                <option value="">+ Add a game</option>
            </select>

            <div id="${idPrefix}GameLoadingIndicator" style="display: none; margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">
                <i class="fas fa-spinner fa-spin"></i> Loading games...
            </div>

            <input type="hidden" id="${idPrefix}SelectedGamesInput" name="games" value="[]">
        </div>
    `;
}

/**
 * Create time input fields
 * @param {Object} event - Event object
 * @returns {string} HTML string for time fields
 */
function createTimeFields(event) {
    return `
        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group" style="margin: 0;">
                <label for="editStartTime">Start Time</label>
                <input type="time" id="editStartTime" name="startTime"
                       value="${convertTo24Hour(event.start_time)}" required>
            </div>
            <div class="form-group" style="margin: 0;">
                <label for="editEndTime">End Time</label>
                <input type="time" id="editEndTime" name="endTime"
                       value="${convertTo24Hour(event.end_time)}" required>
            </div>
        </div>
    `;
}

/**
 * Create location fields
 * @param {string} context - 'create' or 'edit'
 * @param {string} currentLocation - Current location value
 * @returns {string} HTML string for location fields
 */
function createLocationFields(context, currentLocation = '') {
    const prefix = context === 'edit' ? 'edit' : '';
    const idPrefix = prefix ? `${prefix}` : '';

    return `
        <div class="form-group">
            <label for="${idPrefix}Location">Location</label>
            <select id="${idPrefix}Location" name="eventLocation" required>
                <option value="">Select location</option>
                <option value="Campus Center">Campus Center</option>
                <option value="Campus Center Coffee House">Campus Center Coffee House</option>
                <option value="Campus Center Event Room">Campus Center Event Room</option>
                <option value="D-108">D-108</option>
                <option value="Esports Lab (Commons Building 80)">Esports Lab (Commons Building 80)</option>
                <option value="Lakeside Lodge">Lakeside Lodge</option>
                <option value="Online">Online</option>
                <option value="other">Other</option>
            </select>
        </div>

        <div class="form-group" id="${idPrefix}CustomLocationGroup" style="display: none;">
            <label for="${idPrefix}CustomLocation">Custom Location</label>
            <input type="text" id="${idPrefix}CustomLocation" name="customLocation" placeholder="Enter custom location">
        </div>
    `;
}

/**
 * Create form action buttons
 * @returns {string} HTML string for action buttons
 */
function createFormActionButtons() {
    return `
        <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="cancelEdit()">
                <i class="fas fa-times"></i> Cancel
            </button>
            <button type="button" class="btn btn-primary" onclick="submitEventEdit()">
                <i class="fas fa-save"></i> Save Changes
            </button>
        </div>
    `;
}

/**
 * Setup edit location dropdown with current value
 * @param {string} currentLocation - Current location
 */
function setupEditLocationDropdown(currentLocation) {
    const presetLocations = [
        'Campus Center',
        'Campus Center Coffee House',
        'Campus Center Event Room',
        'D-108',
        'Esports Lab (Commons Building 80)',
        'Lakeside Lodge',
        'Online'
    ];

    const locationSelect = document.getElementById('editLocation');
    const customLocationGroup = document.getElementById('editCustomLocationGroup');
    const customLocationInput = document.getElementById('editCustomLocation');

    if (!locationSelect) return;

    // Set current value
    if (presetLocations.includes(currentLocation)) {
        locationSelect.value = currentLocation;
    } else {
        locationSelect.value = 'other';
        setElementDisplay(customLocationGroup, 'block');
        customLocationInput.value = currentLocation;
        customLocationInput.required = true;
    }

    // Add change listener
    locationSelect.addEventListener('change', function() {
        if (this.value === 'other') {
            setElementDisplay(customLocationGroup, 'block');
            customLocationInput.required = true;
        } else {
            setElementDisplay(customLocationGroup, 'none');
            customLocationInput.required = false;
            customLocationInput.value = '';
        }
    });
}

/**
 * Handle event type change in edit form
 */
function handleEditEventTypeChange() {
    const eventType = document.getElementById('editEventType')?.value;
    const gameFieldGroup = document.getElementById('editGameFieldGroup');
    const leagueFieldGroup = document.getElementById('editEventLeagueFieldGroup');
    const leagueDropdown = document.getElementById('editEventLeagueDropdown');

    if (eventType === 'Misc') {
        setElementDisplay(gameFieldGroup, 'none');
        setElementDisplay(leagueFieldGroup, 'none');
        clearSelectedGames('edit');
        if (leagueDropdown) {
            leagueDropdown.removeAttribute('required');
        }
    } else if (eventType === 'Match') {
        setElementDisplay(gameFieldGroup, 'block');
        setElementDisplay(leagueFieldGroup, 'block');
        
        if (leagueDropdown) {
            leagueDropdown.setAttribute('required', 'required');
            // Update label to show required
            const label = document.querySelector('label[for="editEventLeagueDropdown"]');
            if (label) label.innerHTML = 'League *';
        }
        
        // Load leagues if not already loaded
        loadLeaguesForEventEdit();
    } else {
        setElementDisplay(gameFieldGroup, 'block');
        setElementDisplay(leagueFieldGroup, 'none');
        
        if (leagueDropdown) {
            leagueDropdown.removeAttribute('required');
        }
    }
}

async function loadLeaguesForEventEdit() {
    const leagueDropdown = document.getElementById('editEventLeagueDropdown');
    const loadingIndicator = document.getElementById('editEventLeagueLoadingIndicator');
    
    if (!leagueDropdown) return;
    
    // Don't reload if already populated (more than just the placeholder)
    if (leagueDropdown.options.length > 1) return;
    
    setElementDisplay(loadingIndicator, 'block');
    leagueDropdown.disabled = true;
    
    try {
        const response = await fetch('/league/all');
        const data = await response.json();
        
        if (data.leagues && data.leagues.length > 0) {
            // Keep the placeholder and add leagues
            data.leagues.forEach(league => {
                const option = document.createElement('option');
                option.value = league.id;
                option.textContent = league.name;
                leagueDropdown.appendChild(option);
            });
        } else {
            leagueDropdown.innerHTML = '<option value="">No leagues available</option>';
        }
    } catch (error) {
        console.error('Error loading leagues for edit:', error);
        leagueDropdown.innerHTML = '<option value="">Error loading leagues</option>';
    } finally {
        setElementDisplay(loadingIndicator, 'none');
        leagueDropdown.disabled = false;
    }
}

/**
 * Submit event edit
 */
async function submitEventEdit() {
    const formMessage = document.getElementById('editFormMessage');
    const submitBtn = document.querySelector('#editEventFormData .btn-primary');

    if (!submitBtn) return;

    // Set loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    // Gather form data
    const formData = gatherEditFormData();

    try {
        const response = await fetch('/api/event/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            // Direct manipulation
            formMessage.textContent = data.message;
            formMessage.className = 'form-message success';
            formMessage.style.display = 'block';

            setTimeout(() => {
                window.location.reload();
            }, 350);
        } else {
            throw new Error(data.message || 'Failed to update event');
        }
    } catch (error) {
        console.error('Error updating event:', error);

        // Direct manipulation for error
        formMessage.textContent = error.message || 'An error occurred while updating the event';
        formMessage.className = 'form-message error';
        formMessage.style.display = 'block';

        // Reset button
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
}

/**
 * Gather edit form data
 * @returns {Object} Form data object
 */
function gatherEditFormData() {
    const locationSelect = document.getElementById('editLocation');
    const customLocationInput = document.getElementById('editCustomLocation');
    const locationValue = locationSelect?.value === 'other'
        ? customLocationInput?.value
        : locationSelect?.value;

    const gamesInput = document.getElementById('editSelectedGamesInput');
    const leagueDropdown = document.getElementById('editEventLeagueDropdown');

    return {
        event_id: EventState.currentEventId,
        event_name: document.getElementById('editEventName')?.value,
        event_type: document.getElementById('editEventType')?.value,
        games: gamesInput?.value || '[]',
        event_date: document.getElementById('editDate')?.value,
        start_time: document.getElementById('editStartTime')?.value,
        end_time: document.getElementById('editEndTime')?.value,
        location: locationValue,
        description: document.getElementById('editDescription')?.value,
        league_id: leagueDropdown?.value || null  // ADD THIS LINE
    };
}

/**
 * Cancel edit mode
 */
function cancelEdit() {
    const content = document.getElementById('eventDetailsContent');
    const editForm = document.getElementById('eventEditForm');

    setElementDisplay(content, 'block');
    setElementDisplay(editForm, 'none');

    // Restore buttons if user has permissions
    if (EventState.currentEventData) {
        updateEventModalButtons(EventState.currentEventData);
    }
}

// ============================================
// DELETE EVENT
// ============================================

/**
 * Open delete confirmation modal for events
 * Uses universal delete modal system
 */
async function openDeleteEventModal(eventId, eventName) {
    EventState.currentDeleteEventId = eventId;
    EventState.currentDeleteEventName = eventName;

    // Fetch event data if needed
    if (!EventState.currentEventData || EventState.currentEventData.id !== eventId) {
        try {
            const response = await fetch(`/api/event/${eventId}`);
            if (!response.ok) throw new Error('Failed to fetch event details');
            EventState.currentEventData = await response.json();
        } catch (error) {
            console.error('Error fetching event data for deletion:', error);
        }
    }

    const eventData = EventState.currentEventData;
    const isDeveloper = window.userPermissions?.is_developer || false;
    const timeRemaining = eventData ? getDeletionTimeRemaining(eventData.created_at) : null;

    // Build additional info for time window
    let additionalInfo = '';
    if (!isDeveloper && timeRemaining) {
        additionalInfo = `
            <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(251, 191, 36, 0.1);
                        border: 1px solid #fbbf24; border-radius: 6px; font-size: 0.875rem;">
                <i class="fas fa-clock" style="color: #fbbf24;"></i>
                <strong style="color: #fbbf24;">Deletion window:</strong> ${timeRemaining}
            </div>
        `;
    }

    // Open universal modal with event-specific config
    window.openDeleteConfirmModal({
        title: 'Delete Event?',
        itemName: eventName,
        message: `Are you sure you want to delete ${eventName}? This action cannot be undone.`,
        additionalInfo: additionalInfo,
        buttonText: 'Delete Event',
        onConfirm: confirmDeleteEvent,
        itemId: eventId
    });
}

/**
 * Function triggered when an event is confirmed to be deleted.
 * @param - eventId is the ID of the event being deleted.
 **/
async function confirmDeleteEvent(eventId) {
    try {
        const response = await fetch(`/api/events/${eventId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            window.closeDeleteConfirmModal();

            // If deletion was from event modal, close that too
            if (EventState.deletionFromModal) {
                const eventModal = document.getElementById('eventDetailsModal');
                if (eventModal) {
                    eventModal.style.display = 'none';
                }
                EventState.deletionFromModal = false;
            }

            // Show success notification FIRST
            showDeleteSuccessMessage(data.message);

            // If schedule was auto-deleted, show additional notification with proper delay
            if (data.schedule_deleted && data.schedule_name) {
                // Wait for first notification to appear and settle
                setTimeout(() => {
                    if (typeof window.showInfoMessage === 'function') {
                        window.showInfoMessage(
                            `Schedule "${data.schedule_name}" was automatically removed (no events remaining)`,
                            4000
                        );
                    } else if (typeof window.showScheduleCleanupNotification === 'function') {
                        window.showScheduleCleanupNotification(data.schedule_name);
                    }
                }, 600); // Increased delay to ensure proper stacking
            }

            // Route based on deletion source
            setTimeout(() => {
                if (EventState.deletionSource === 'events') {
                    // Reload events tab only
                    loadEvents();
                    // Manually restore scrolling
                    document.body.style.overflow = 'auto';
                } else {
                    // Calendar view - ALWAYS full page reload
                    window.location.reload();
                }
            }, data.schedule_deleted ? 2000 : 1000); // Longer delay if showing two notifications
        } else {
            handleDeleteError(data.message);
        }
    } catch (error) {
        console.error('Error deleting event:', error);
        showDeleteErrorMessage('An error occurred while deleting the event');
        window.closeDeleteConfirmModal();
    }
}

/**
 * Handle delete error messages
 */
function handleDeleteError(message) {
    window.closeDeleteConfirmModal();

    if (message.includes('expired') || message.includes('24')) {
        showDeleteErrorMessage(`⏰ ${message}\n\nOnly developers can delete events after 24 hours.`);
    } else if (message.includes('creator')) {
        showDeleteErrorMessage(`🚫 ${message}`);
    } else {
        showDeleteErrorMessage('Error: ' + message);
    }
}

/**
 * Delete event (called from event details modal)
 * Uses the same confirmation modal as card deletion
 */
async function deleteEvent() {
    if (!EventState.currentEventId) {
        alert("Event ID not found.");
        return;
    }

    const event = EventState.currentEventData;
    if (!event) {
        alert("Event data not found.");
        return;
    }

    // Check if user can delete
    if (!canUserDeleteEvent(event)) {
        const is_developer = window.userPermissions?.is_developer || false;

        if (!is_developer && event.created_by === (window.currentUserId || 0)) {
            alert("⏰ The 24-hour deletion window has expired.\n\nOnly developers can delete events after 24 hours.");
        } else {
            alert("🚫 You don't have permission to delete this event.");
        }
        return;
    }

    // Track that deletion was initiated from modal
    EventState.deletionFromModal = true;

    // DON'T close the event modal - just open delete confirmation on top
    openDeleteEventModal(event.id, event.name);
}

// ============================================
// GLOBAL EXPORTS
// ============================================
// Export all public functions to the global window object
// This maintains compatibility with existing HTML onclick handlers
// and other external references

window.initializeEventsModule = initializeEventsModule;
window.loadEvents = loadEvents;
window.filterEvents = filterEvents;
window.filterEventsByType = filterEventsByType;
window.filterEventsByGame = filterEventsByGame;

// Event Modal Functions
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.toggleEventSubscription = toggleEventSubscription;

// Day Modal Functions (Calendar)
window.openDayModal = openDayModal;
window.closeDayModal = closeDayModal;

// Create Event Functions
window.openCreateEventModal = openCreateEventModal;
window.closeCreateEventModal = closeCreateEventModal;
window.handleEventTypeChange = handleEventTypeChange;
window.toggleAllDayEvent = toggleAllDayEvent;

// Edit Event Functions
window.toggleEditMode = toggleEditMode;
window.cancelEdit = cancelEdit;
window.submitEventEdit = submitEventEdit;
window.handleEditEventTypeChange = handleEditEventTypeChange;

// Delete Event Functions
window.deleteEvent = deleteEvent;
window.confirmDeleteEvent = confirmDeleteEvent;
window.canUserDeleteEvent = canUserDeleteEvent;
window.getDeletionTimeRemaining = getDeletionTimeRemaining;

// Game Tag System Functions
window.addGameTag = addGameTag;
window.removeGameTag = removeGameTag;
window.clearSelectedGames = clearSelectedGames;

//Filtering with seasons
window.loadPastSeasonsForFilter = loadPastSeasonsForFilter;
window.handlePastSeasonSelection = handlePastSeasonSelection;
window.filterEventsByPastSeason = filterEventsByPastSeason;
window.filterBySeasonAndType = filterBySeasonAndType;
window.filterBySeasonAndGame = filterBySeasonAndGame;
window.loadEventsForPastSeason = loadEventsForPastSeason;

// Utility Functions
window.loadGamesForFilter = loadGamesForFilter;
window.clearGamesCache = clearGamesCache;