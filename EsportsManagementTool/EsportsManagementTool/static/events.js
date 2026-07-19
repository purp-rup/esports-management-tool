/**
 * ============================================
 * events.js
 * ============================================
 *
 * Handles all general event-related functionality
 * - CRUD operations for events
 * - Event card and event detail pane display
 * - Event filter system with flyout cards
 * - Mobile event tab compatibility
 * - Dynamic game dropdown construction
 * - Create event modal
 */

// ============================================
// GLOBAL STATE MANAGEMENT
// ============================================
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

    // Partnerships cache and selection
    partnershipsListCache: null,
    selectedPartnerships: [],
    selectedPartnershipFilter: null,

    // Calendar day modal data
    eventsData: {},

    // Reset state to defaults
    reset() {
        this.currentEventId = null;
        this.currentEventData = null;
        this.currentDeleteEventId = null;
        this.currentDeleteEventName = '';
        this.selectedGames = [];
        this.selectedPartnerships = [];
        this.deletionSource = 'events';
    },

    // Update user permissions
    setPermissions(isAdmin, isGm, isDeveloper) {
        this.permissions.is_admin = isAdmin;
        this.permissions.is_gm = isGm;
        this.permissions.is_developer = isDeveloper;
    }
};

// ============================================
// INITIALIZATION
// ============================================

// Pull events from server
function initializeEventsModule(eventsDataFromServer) {
    EventState.eventsData = eventsDataFromServer || {};
    attachEventListeners();
}

// Event listener for easier management
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

    // Filter box flyouts
    initPastSeasonsFlyout();
    initGameFlyouts();
    initPartnershipFilterFlyout();
    initFlyoutTriggers();
}

// ============================================
// Event Loading
// ============================================

// Load events based on filter criteria
function loadEvents() {
    const elements = {
        loading: document.getElementById('eventsLoading'),
        container: document.getElementById('eventsContainer'),
        emptyState: document.getElementById('eventsEmptyState')
    };

    //Show loading for events
    showEventsLoadingState()

    // Build query parameters
    const queryParams = buildEventFilterParams();

    // Fetch events
    Promise.all([
        fetch(`/api/events?${queryParams}`).then(response => response.json()),
        loadGamesList()
    ])
        .then(([data]) => {
            if (data.success) {
                EventState.setPermissions(data.is_admin, data.is_gm, data.is_developer);
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
            hideEventsLoadingState();
        });

        // Check if we were redirected here to view a specific event
        const urlParams = new URLSearchParams(window.location.search);
        const openEventId = parseInt(urlParams.get('openEvent'));
        if (openEventId) {
            window.history.replaceState({}, '', '/dashboard');

            const eventsTab = document.querySelector('[data-tab="events"]');
            if (eventsTab) eventsTab.click();

            // Pre-fetch event data immediately, in parallel with events loading
            const eventDataPromise = fetch(`/api/event/${openEventId}`)
                .then(r => r.json()).catch(() => null);
            const bannerDataPromise = fetch(`/api/event/${openEventId}/games`)
                .then(r => r.json()).catch(() => ({ success: false, games: [] }));

            // Open panel exactly once when events container is ready
            let opened = false;
            const tryOpen = (attempts = 0) => {
                if (opened) return;
                const container = document.getElementById('eventsContainer');
                if (container && container.style.display !== 'none') {
                    opened = true;
                    openEventDetailPanel(openEventId, eventDataPromise, bannerDataPromise);
                } else if (attempts < 30) {
                    setTimeout(() => tryOpen(attempts + 1), 150);
                }
            };
            setTimeout(() => tryOpen(), 200);
        }
}

// Load events for selected past season with filters
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
    showEventsLoadingState();

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
        const gameFilter = PastSeasonFilterState.selectedGame || document.getElementById('gameFilter')?.value;
        if (gameFilter) {
            queryParams += `&filter=game&game=${encodeURIComponent(gameFilter)}`;
        }
    } else if (secondaryFilter === 'partnership') {
        const partnershipFilter = PastSeasonFilterState.selectedPartnership || document.getElementById('partnershipFilter')?.value;
        if (partnershipFilter) {
            queryParams += `&filter=partnership&partnership=${encodeURIComponent(partnershipFilter)}`;
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
                EventState.setPermissions(data.is_admin, data.is_gm, data.is_developer);
                renderEvents(data.events, data.is_admin, data.is_developer, data.is_gm);

                // Update empty state message for season filtering
                updateEmptyStateMessage()
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
            hideEventsLoadingState();
        });
}

// Builds structure for event tab display
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
    setElementDisplay(containerDiv, 'grid');

    // Open detail panel on card click (not the modal)
    containerDiv.querySelectorAll('.event-card').forEach(card => {
        card.addEventListener('click', (e) => {
            openEventDetailPanel(parseInt(card.dataset.eventId));
        });
    });

    // Dynamically match list pane scroll height to detail pane
    const detailPane = document.getElementById('eventsDetailPane');
    const listPane = document.querySelector('.events-list-pane');
    if (detailPane && listPane) {
        if (window._detailPaneObserver) window._detailPaneObserver.disconnect();
        window._detailPaneObserver = new ResizeObserver(() => {
            listPane.style.maxHeight = '';
            const detailHeight = detailPane.offsetHeight;
            const cap = window.innerHeight - 260;
            listPane.style.maxHeight = Math.max(detailHeight, cap) + 'px';
        });
        window._detailPaneObserver.observe(detailPane);
    }

    setElementDisplay(containerDiv, 'block');
    setElementDisplay(emptyStateDiv, 'none');
}

// Builds individual event cards
function createEventCard(event, isAdmin, isGm) {
    const canDelete = canUserDeleteEvent(event);
    const ongoingIndicator = event.is_ongoing
        ? '<div class="event-ongoing-indicator" title="Event is currently ongoing"></div>'
        : '';

    const gameDisplay = formatGameDisplay(event.game, event.team_name, event.is_scheduled);
    const eventTypeClass = (event.event_type || 'event').toLowerCase();
    const scheduledClass = event.is_scheduled ? 'scheduled-event' : '';
    const timeDisplay = event.start_time ? event.start_time : '';

    return `
        <div class="event-card ${scheduledClass}" data-event-type="${eventTypeClass}" data-event-id="${event.id}" ...>
            ${ongoingIndicator}
            <div class="event-card-top">
                <span class="event-card-name">${event.name}</span>
                <span class="event-card-game">${gameDisplay}</span>
            </div>
            <div class="event-card-bottom">
                <span class="event-card-date"><i class="fas fa-calendar"></i>${event.date}</span>
                ${timeDisplay ? `<span class="event-card-time">${timeDisplay}</span>` : ''}
            </div>
        </div>
    `;
}

// Look up a game's abbreviation from the cached games list
function getGameAbbreviation(title) {
    const game = EventState.gamesListCache?.find(g => g.GameTitle === title);
    return game?.Abbreviation || title; // fall back to full title if not found/not loaded yet
}

// Format game display: first game's abbreviation, plus a count of any others
function formatGameDisplay(gameStr, teamName, isScheduled) {
    if (isScheduled && teamName) return teamName;
    if (!gameStr || gameStr === 'N/A') return '';

    const games = gameStr.split(', ').map(getGameAbbreviation);
    return games.length > 1 ? `${games[0]} +${games.length - 1}` : games[0];
}

// Show error state when events fail to load
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

/* =================================
   Create Event
   ================================= */
function openCreateEventModal() {
    const modal = document.getElementById('createEventModal');
    const form = document.getElementById('createEventForm');
    const customLocationGroup = document.getElementById('customLocationGroup');
    const formMessage = document.getElementById('formMessage');
    const leagueGroup = document.getElementById('eventLeagueFieldGroup');

    // Show modal
    setElementDisplay(modal, 'block');
    lockBodyScroll('createEventModal');

    // Reset form and state
    form.reset();
    setElementDisplay(customLocationGroup, 'none');
    setElementDisplay(formMessage, 'none');
    setElementDisplay(leagueGroup, 'none');
    clearSelectedGames('create');
    clearSelectedPartnerships('create');

    // Character Counter
    attachCharacterCounter('eventDescription', 250);

    // Load games after modal is rendered
    setTimeout(() => {
        const dropdown = document.getElementById('gameDropdown');
        if (dropdown) {
            enableDropdown(dropdown);
        }
        initializeGameTagSelector('create');
        initializePartnershipTagSelector('create');
    }, 50);
}

// Close create event modal
function closeCreateEventModal() {
    const modal = document.getElementById('createEventModal');
    setElementDisplay(modal, 'none');
    unlockBodyScroll('createEventModal');
}

// Handle location dropdown change
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

// Handle event type change - hide game field for Misc events
function handleEventTypeChange() {
    const eventType = document.getElementById('eventType')?.value;
    const gameFieldGroup = document.getElementById('gameFieldGroup');

    // Handle game field visibility for Misc events
    if (eventType === 'Misc') {
        setElementDisplay(gameFieldGroup, 'none');
        clearSelectedGames('create');
    } else {
        setElementDisplay(gameFieldGroup, 'block');
    }
}

// Toggle all-day event button
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

// Handle create event form submission
async function handleCreateEventSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const submitBtnText = document.getElementById('submitBtnText');
    const submitBtnSpinner = document.getElementById('submitBtnSpinner');
    const formMessage = document.getElementById('formMessage');

    // Validate league for Match events
    const eventType = document.getElementById('eventType')?.value;
    const leagueDropdown = document.getElementById('eventLeagueDropdown');

    if (eventType === 'Match' && (!leagueDropdown?.value)) {
        formMessage.textContent = 'Please select a league for Match events.';
        formMessage.className = 'form-message error';
        formMessage.style.display = 'block';
        return;
    }

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

/* ==========================================
   Edit Event
   ========================================== */

// Enables and disables event detail panel editing
function togglePanelEditMode() {
    const event = EventState.currentEventData;
    if (!event) return;

    // Replace title with input
    const title = document.querySelector('.events-detail-panel .events-detail-title');
    if (title) {
        title.outerHTML = `<input id="panelEditName" class="events-detail-title panel-edit-input"
                                  value="${escapeQuotes(event.name || '')}" type="text">`;
    }

    // Inject missing rows in correct order before transforming
    const sections = document.querySelector('.events-detail-panel .events-detail-sections');
    const existingLabels = [...sections.querySelectorAll('h4')].map(h => h.textContent.trim());

    // Full ordered field list — Date is always present, skip Game for scheduled events
    const allRows = [
        { label: 'Time',         icon: 'clock'          },
        ...(!event.is_scheduled ? [{ label: 'Game', icon: 'gamepad' }] : []),
        { label: 'Location',     icon: 'map-marker-alt' },
        { label: 'Description',  icon: 'info-circle'    },
        { label: 'Partnerships', icon: 'handshake'      },
    ];

    // Insert missing rows in order relative to existing ones
    allRows.forEach(({ label, icon }) => {
        if (existingLabels.includes(label)) return;

        // Find the row that should come after this one, insert before it
        const allLabels = ['Date', 'Time', 'Game', 'Location', 'Description', 'Partnerships'];
        const afterIndex = allLabels.indexOf(label);
        let inserted = false;

        for (let i = afterIndex + 1; i < allLabels.length; i++) {
            const nextLabel = allLabels[i];
            const nextRow = [...sections.querySelectorAll('.events-detail-row')]
                .find(r => r.querySelector('h4')?.textContent.trim() === nextLabel);
            if (nextRow) {
                nextRow.insertAdjacentHTML('beforebegin', `
                    <div class="events-detail-row">
                        <div class="event-detail-icon"><i class="fas fa-${icon}"></i></div>
                        <div class="events-detail-row-text"><h4>${label}</h4><p></p></div>
                    </div>
                `);
                inserted = true;
                break;
            }
        }

        // If no later row exists, append at end
        if (!inserted) {
            sections.insertAdjacentHTML('beforeend', `
                <div class="events-detail-row">
                    <div class="event-detail-icon"><i class="fas fa-${icon}"></i></div>
                    <div class="events-detail-row-text"><h4>${label}</h4><p></p></div>
                </div>
            `);
        }
    });

    // Transform all rows to editable inputs
    document.querySelectorAll('.events-detail-panel .events-detail-row').forEach(row => {
        const label = row.querySelector('h4')?.textContent?.trim();
        const valueEl = row.querySelector('p') || row.querySelector('.partnership-flair-stage');
        if (!valueEl) return;

        switch (label) {
            case 'Date':
                valueEl.outerHTML = `<input id="panelEditDate" class="panel-edit-input"
                                            type="date" value="${event.date_raw || ''}">`;
                break;
            case 'Time':
                valueEl.outerHTML = `<div class="panel-edit-time-row">
                    <input id="panelEditStartTime" class="panel-edit-input"
                           type="time" value="${event.start_time_raw}">
                    <span>–</span>
                    <input id="panelEditEndTime" class="panel-edit-input"
                           type="time" value="${event.end_time_raw}">
                </div>`;
                break;
            case 'Game':
                if (event.is_scheduled) break;
                valueEl.outerHTML = `
                    <div>
                        <div id="editSelectedGamesContainer" class="selected-games-container"></div>
                        <select id="editGameDropdown" class="panel-edit-input">
                            <option value="">+ Add game</option>
                        </select>
                        <div id="editGameLoadingIndicator" style="display:none; font-size:0.8125rem; color:var(--text-secondary); margin-top:0.5rem;">
                            <i class="fas fa-spinner fa-spin"></i> Loading games...
                        </div>
                        <input type="hidden" id="editSelectedGamesInput" name="games" value="[]">
                    </div>
                `;
                break;
            case 'Location':
                valueEl.outerHTML = `<select id="panelEditLocation" class="panel-edit-input">
                    <option value="Campus Center" ${event.location === 'Campus Center' ? 'selected' : ''}>Campus Center</option>
                    <option value="Campus Center Coffee House" ${event.location === 'Campus Center Coffee House' ? 'selected' : ''}>Campus Center Coffee House</option>
                    <option value="Campus Center Event Room" ${event.location === 'Campus Center Event Room' ? 'selected' : ''}>Campus Center Event Room</option>
                    <option value="D-108" ${event.location === 'D-108' ? 'selected' : ''}>D-108</option>
                    <option value="Esports Lab (Commons Building 80)" ${event.location === 'Esports Lab (Commons Building 80)' ? 'selected' : ''}>Esports Lab</option>
                    <option value="Lakeside Lodge" ${event.location === 'Lakeside Lodge' ? 'selected' : ''}>Lakeside Lodge</option>
                    <option value="Online" ${event.location === 'Online' ? 'selected' : ''}>Online</option>
                </select>`;
                break;
            case 'Description':
                valueEl.outerHTML = `<textarea id="panelEditDescription" class="panel-edit-input"
                                               rows="3">${event.description || ''}</textarea>`;
                break;
            case 'Partnerships':
                valueEl.outerHTML = `
                    <div>
                        <div class="partnership-edit-row">
                            <div class="partnership-edit-side">
                                <input type="text" id="editCustomPartnership" class="panel-edit-input"
                                       placeholder="New partnership">
                                <button type="button" id="editAddCustomPartnershipBtn"
                                        class="partnership-confirm-btn" title="Add partnership">
                                    <i class="fas fa-check"></i>
                                </button>
                            </div>
                            <span class="partnership-edit-or">or</span>
                            <div class="partnership-edit-side">
                                <select id="editPartnershipDropdown" class="panel-edit-input">
                                    <option value="">+ Add existing</option>
                                </select>
                            </div>
                        </div>
                        <div id="editSelectedPartnershipsContainer" class="selected-games-container"
                             data-empty-text="No partnerships selected" style="margin-top:0.5rem;"></div>
                        <input type="hidden" id="editSelectedPartnershipsInput" name="partnerships" value="[]">
                    </div>
                `;
                break;
        }
    });

    // Initialize game editable field if not scheduled event
    if (!event.is_scheduled) {
        initializeGameTagSelector('edit', event.game);
    }

    // Initialize partnership editable field
    initializePartnershipTagSelector('edit', (event.partnerships || []).join(', '));

    //Attach description character counter
    attachCharacterCounter('panelEditDescription', 250);

    // Swap edit button for save/cancel
    const editBtn = document.querySelector('.events-detail-banner-btn:not(.delete)');
    if (editBtn) {
        editBtn.outerHTML = `
            <button class="events-detail-banner-btn panel-save-btn" onclick="submitPanelEdit()" title="Save changes">
                <i class="fas fa-check"></i>
            </button>
            <button class="events-detail-banner-btn panel-cancel-btn" onclick="cancelPanelEdit()" title="Cancel">
                <i class="fas fa-times"></i>
            </button>
        `;
    }
}

// Cancel editing in the event detail panel
function cancelPanelEdit() {
    if (EventState.currentEventId) {
        openEventDetailPanel(EventState.currentEventId);
    }
}

// Confirms edits made in the event detail panel
async function submitPanelEdit() {
    const nameInput = document.getElementById('panelEditName');
    if (!nameInput?.value?.trim()) {
        nameInput?.classList.add('panel-edit-input-error');
        nameInput?.focus();
        return;
    }
    nameInput.classList.remove('panel-edit-input-error');

    const saveBtn = document.querySelector('.panel-save-btn');
    if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const locationSelect = document.getElementById('panelEditLocation');

    const formData = {
        event_id: EventState.currentEventId,
        event_name: document.getElementById('panelEditName')?.value,
        event_type: EventState.currentEventData?.event_type,
        games: document.getElementById('editSelectedGamesInput')?.value ||
                JSON.stringify(EventState.currentEventData?.game ? [EventState.currentEventData.game] : []),
        partnerships: document.getElementById('editSelectedPartnershipsInput')?.value ||
                JSON.stringify(EventState.currentEventData?.partnerships || []),
        event_date: document.getElementById('panelEditDate')?.value,
        start_time: document.getElementById('panelEditStartTime')?.value,
        end_time: document.getElementById('panelEditEndTime')?.value,
        location: locationSelect?.value,
        description: document.getElementById('panelEditDescription')?.value,
        league_id: EventState.currentEventData?.league_id || null
    };

    try {
        const response = await fetch('/api/event/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await response.json();

        if (data.success) {
            // Refresh the panel and card with updated data
            await openEventDetailPanel(EventState.currentEventId);
            loadEvents();
        } else {
            throw new Error(data.message || 'Failed to update event');
        }
    } catch (error) {
        console.error('Error saving event:', error);
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-check"></i>';
        alert(error.message || 'Failed to save changes.');
    }
}

/* ==================================
   Delete Event
   ================================== */
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
    const { is_developer } = EventState.permissions;
    const timeRemaining = eventData ? getDeletionTimeRemaining(eventData.created_at) : null;

    // Build additional info for time window
    let additionalInfo = '';
    if (!is_developer && timeRemaining) {
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

// Function triggered when an event is confirmed to be deleted
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
                window.closeEventModal();
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

// Handle delete error messages
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

// Delete event (called from event details modal)
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
        const { is_developer } = EventState.permissions;

        if (!is_developer && event.created_by === (window.currentUserId || 0)) {
            alert(" The 24-hour deletion window has expired.\n\nOnly developers can delete events after 24 hours.");
        } else {
            alert(" You don't have permission to delete this event.");
        }
        return;
    }

    // Track that deletion was initiated from modal
    EventState.deletionFromModal = true;

    // DON'T close the event modal - just open delete confirmation on top
    openDeleteEventModal(event.id, event.name);
}

/* ================================
   Event Detail Panel Display
   ================================ */
async function openEventDetailPanel(eventId, prefetchedEventData = null, prefetchedBannerData = null) {
    const pane = document.getElementById('eventsDetailPane');
    // Apply scroll lock on mobil
    if (window.innerWidth <= 768) {
        pane.classList.add('sheet-open');
        document.getElementById('sheetBackdrop')?.classList.add('open');
        lockBodyScroll('eventsSheet');
    }
    EventState.currentEventId = eventId;

    // Show loading state
    pane.innerHTML = `
        <div class="events-detail-placeholder">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading event...</p>
        </div>
    `;

    try {
        const response = prefetchedEventData
            ? { ok: true, json: () => prefetchedEventData }
            : await fetch(`/api/event/${eventId}`);
        if (!response.ok) throw new Error('Failed to fetch event');
        const event = await response.json();
        EventState.currentEventData = event;

        const eventTypeClass = (event.event_type || 'event').toLowerCase();

        // Build detail rows
        const rows = [];

        if (event.start_time) {
            const timeStr = `${event.start_time}${event.end_time ? ' – ' + event.end_time : ''}`;
            rows.push(detailRow('clock', 'Time', timeStr));
        }

        if (event.game && event.game !== 'N/A') {
            rows.push(detailRow('gamepad', 'Game(s)', event.game));
        }

        if (event.event_type === 'Match' && event.league_name) {
            rows.push(detailRow('trophy', 'League', event.league_name));
        }

        if (event.location) {
            rows.push(detailRow('map-marker-alt', 'Location', event.location));
        }

        if (event.description) {
            rows.push(detailRow('info-circle', 'Description', event.description));
        }

         if (event.partnerships && event.partnerships.length) {
            rows.push(partnershipRow(event.partnerships));
        }

        // Fetch banner and event data concurrently
        const [bannerData] = await Promise.all([
            prefetchedBannerData ||
                fetch(`/api/event/${eventId}/games`).then(r => r.json()).catch(() => ({ success: false, games: [] }))
        ]);

        const banners = bannerData.success
            ? (bannerData.games || []).filter(g => g.GameBanner).map(g => g.GameBanner)
            : [];

        const bannerHTML = banners.length
            ? banners.map((url, i) => `
                <img src="${url}" class="event-detail-banner-img event-detail-banner-slide ${i === 0 ? 'active' : ''}"
                     alt="Game banner ${i + 1}">
              `).join('')
            : '';

        pane.innerHTML = `
            <div class="events-detail-panel" data-event-type="${eventTypeClass}">
                <div class="events-detail-banner-wrapper">
                    <div class="events-detail-banner" id="eventDetailBanner" ${!banners.length ? 'style="display:none"' : ''}>
                        ${bannerHTML}
                    </div>
                    <div class="events-detail-banner-actions">
                        ${canUserEditEvent(event) ? `
                            <button class="events-detail-banner-btn" title="Edit event"
                                    onclick="togglePanelEditMode()">
                                <i class="fas fa-edit"></i>
                            </button>` : ''}
                        ${canUserDeleteEvent(event) ? `
                            <button class="events-detail-banner-btn delete" title="Delete event"
                                    onclick="openDeleteEventModal(${event.id}, '${escapeQuotes(event.name)}')">
                                <i class="fas fa-trash"></i>
                            </button>` : ''}
                    </div>
                </div>
                <h2 class="events-detail-title">${event.name}</h2>
                <div class="events-detail-sections">
                    <div class="events-detail-row">
                        <div class="event-detail-icon"><i class="fas fa-calendar-alt"></i></div>
                        <div class="events-detail-row-text">
                            <h4>Date</h4>
                            <p>${event.date}</p>
                        </div>
                        <span class="game-next-event-type ${eventTypeClass} events-detail-type-badge">${event.event_type || 'Event'}</span>
                    </div>
                    ${rows.join('')}
                </div>
                <div class="notification-opt-in">
                    <div class="notification-icon"><i class="fas fa-bell"></i></div>
                    <div class="notification-text">
                        <div class="title">Event Reminders</div>
                        <div class="subtitle">Get notified about this event</div>
                    </div>
                    <button class="notification-btn" id="detailSubscribeBtn"
                            onclick="toggleEventSubscription()">
                        <span id="detailSubscribeBtnText">Loading...</span>
                    </button>
                </div>
            </div>
        `;

        // Now load the notification section
        await loadNotificationSection(eventId);

        // Start slideshow if multiple banners
        if (banners.length > 1) {
            startBannerSlideshow(document.getElementById('eventDetailBanner'))
        }

        if (event.partnerships && event.partnerships.length) {
            initPartnershipFlairStage(document.getElementById('partnershipFlairStage'));
        }

    } catch (error) {
        console.error('Error loading event detail panel:', error);
        pane.innerHTML = `
            <div class="events-detail-placeholder">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load event details.</p>
            </div>
        `;
    }
}

// Build a single detail row for the panel
function detailRow(icon, label, value) {
    return `
        <div class="events-detail-row">
            <div class="event-detail-icon"><i class="fas fa-${icon}"></i></div>
            <div class="events-detail-row-text">
                <h4>${label}</h4>
                <p>${value}</p>
            </div>
        </div>
    `;
}

// Build a single partnership rows, including multiple partnerships if available
function partnershipRow(partnerships) {
    const flairs = partnerships.map((name, i) => `
        <span class="partnership-flair${i === 0 ? ' active' : ''}">${name}</span>
    `).join('');

    return `
        <div class="events-detail-row">
            <div class="event-detail-icon"><i class="fas fa-handshake"></i></div>
            <div class="events-detail-row-text">
                <h4>Partnerships</h4>
                <div class="partnership-flair-stage" id="partnershipFlairStage">
                    ${flairs}
                </div>
            </div>
        </div>
    `;
}

// Closes the event detail pane in MOBILE VIEW
function closeEventDetailSheet() {
    const pane = document.getElementById('eventsDetailPane');
    pane?.classList.remove('sheet-open');
    document.getElementById('sheetBackdrop')?.classList.remove('open');
    unlockBodyScroll('eventsSheet');
}

/* =======================================
   Build Filter System
   ======================================= */

// Build different filter options for events
function buildEventFilterParams() {
    const filterSelect = document.getElementById('eventFilter');
    const filterValue = filterSelect?.value || 'all';

    let params = `filter=${filterValue}`;

    // Add past season filter if active
    if (PastSeasonFilterState.selectedSeasonId) {
        params += `&season_id=${PastSeasonFilterState.selectedSeasonId}`;
    }

    // Add event type filter if applicable
    if (filterValue === 'type') {
        const typeFilter = document.getElementById('eventTypeFilter')?.value;
        if (typeFilter) params += `&event_type=${typeFilter}`;
    }

    // Add game filter if applicable
    if (filterValue === 'game') {
        const gameFilter = EventState.selectedGame;
        if (gameFilter) params += `&game=${encodeURIComponent(gameFilter)}`;
    }

    // Add partnership filter if applicable
    if (filterValue === 'partnership') {
        const partnershipFilter = EventState.selectedPartnershipFilter;
        if (partnershipFilter) params += `&partnership=${encodeURIComponent(partnershipFilter)}`;
    }

    return params;
}

// Loads games for game filtering
async function loadGamesList() {
    if (EventState.gamesListCache) {
        return EventState.gamesListCache;
    }

    try {
        const response = await fetch('/api/game-list');
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

// Loads the list of partnerships for events
async function loadPartnershipsList() {
    if (EventState.partnershipsListCache) {
        return EventState.partnershipsListCache;
    }

    try {
        const response = await fetch('/api/partnership-list');
        const data = await response.json();

        if (data.success && data.partnerships) {
            EventState.partnershipsListCache = data.partnerships;
            return EventState.partnershipsListCache;
        } else {
            console.error('Failed to load partnerships list');
            return [];
        }
    } catch (error) {
        console.error('Error fetching partnerships list:', error);
        return [];
    }
}

// Populate single-select game dropdown for filter
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

// Load games for filter dropdown
async function loadGamesForFilter() {
    await populateGameDropdown('gameFilter', 'gameFilterLoadingIndicator');
}

/* ===============================
   Partnership Dropdown Tag System
   =============================== */
const PartnershipTagConfig = {
    create: {
        dropdown: 'partnershipDropdown',
        container: 'selectedPartnershipsContainer',
        hiddenInput: 'selectedPartnershipsInput',
        customGroup: 'customPartnershipGroup',
        customInput: 'customPartnership',
        customBtn: 'addCustomPartnershipBtn',
        inlineCustomEntry: false
    },
    edit: {
        dropdown: 'editPartnershipDropdown',
        container: 'editSelectedPartnershipsContainer',
        hiddenInput: 'editSelectedPartnershipsInput',
        customGroup: null,
        customInput: 'editCustomPartnership',
        customBtn: 'editAddCustomPartnershipBtn',
        inlineCustomEntry: true
    }
};

// Initialize partnership tag selector for a specific context
async function initializePartnershipTagSelector(context = 'create', preSelectedPartnerships = '') {
    const config = PartnershipTagConfig[context];
    if (!config) {
        console.error(`Invalid context: ${context}`);
        return;
    }

    const dropdown = document.getElementById(config.dropdown);
    if (!dropdown) {
        console.warn(`${config.dropdown} element not found`);
        return;
    }

    try {
        const partnerships = await loadPartnershipsList();

        // Populate dropdown, keeping the "+ Add new partnership" option last
        dropdown.innerHTML = '<option value="">+ Add partnership</option>';
        partnerships.forEach(p => {
            const option = document.createElement('option');
            option.value = p.partnership_name;
            option.textContent = p.partnership_name;
            dropdown.appendChild(option);
        });

        if (!config.inlineCustomEntry) {
            dropdown.innerHTML += '<option value="__new__">+ Add new partnership</option>';

            if (partnerships.length === 0) {
                setElementDisplay(document.getElementById(config.customGroup), 'block');
            }
        }

        // Parse pre-selected partnerships (for edit mode, added later)
        if (preSelectedPartnerships && preSelectedPartnerships !== 'N/A') {
            EventState.selectedPartnerships = preSelectedPartnerships
                .split(',')
                .map(p => p.trim())
                .filter(p => p);
        } else {
            EventState.selectedPartnerships = [];
        }

        updatePartnershipTagsDisplay(context);
        updateHiddenPartnershipsInput(context);
        attachPartnershipDropdownListener(dropdown, context);
        attachCustomPartnershipListener(context);
        updatePartnershipDropdownOptions(context);

    } catch (error) {
        console.error('Error initializing partnership tag selector:', error);
        dropdown.innerHTML = '<option value="">Error loading partnerships</option>';
    }
}

// Attach change listener for partnership dropdown
function attachPartnershipDropdownListener(dropdown, context) {
    const clone = dropdown.cloneNode(true);
    dropdown.replaceWith(clone);

    const config = PartnershipTagConfig[context];
    const newDropdown = document.getElementById(config.dropdown);
    if (!newDropdown) return;

    newDropdown.addEventListener('change', function() {
        if (this.value === '__new__') {
            setElementDisplay(document.getElementById(config.customGroup), 'block');
            this.value = '';
            return;
        }

        const selected = this.value;
        if (selected && !EventState.selectedPartnerships.includes(selected)) {
            addPartnershipTag(selected, context);
        }
        this.value = '';
    });
}

// Attach listener for the "Add" button next to the custom partnership input
function attachCustomPartnershipListener(context) {
    const config = PartnershipTagConfig[context];
    const addBtn = document.getElementById(config.customBtn);
    const customInput = document.getElementById(config.customInput);
    if (!addBtn || !customInput) return;

    const clone = addBtn.cloneNode(true);
    addBtn.replaceWith(clone);
    const newBtn = document.getElementById(config.customBtn);

    newBtn.addEventListener('click', function() {
        const name = customInput.value.trim();
        if (!name || EventState.selectedPartnerships.includes(name)) return;

        addPartnershipTag(name, context);
        customInput.value = '';
        if (config.customGroup) {
            setElementDisplay(document.getElementById(config.customGroup), 'none');
        }
    });

    customInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            newBtn.click();
        }
    });
}

// Add a tag to selected partnerships for an event
function addPartnershipTag(name, context = 'create') {
    if (EventState.selectedPartnerships.includes(name)) return;

    EventState.selectedPartnerships.push(name);
    updatePartnershipTagsDisplay(context);
    updateHiddenPartnershipsInput(context);
    updatePartnershipDropdownOptions(context);
}

// Remove a tag from the selected partnerships
function removePartnershipTag(name, context = 'create') {
    EventState.selectedPartnerships = EventState.selectedPartnerships.filter(p => p !== name);
    updatePartnershipTagsDisplay(context);
    updateHiddenPartnershipsInput(context);
    updatePartnershipDropdownOptions(context);
}

// Update display of selected partnerships
function updatePartnershipTagsDisplay(context = 'create') {
    const config = PartnershipTagConfig[context];
    const container = document.getElementById(config.container);
    if (!container) return;

    container.innerHTML = '';

    EventState.selectedPartnerships.forEach(name => {
        const tag = document.createElement('div');
        tag.className = 'game-tag';
        tag.innerHTML = `
            <i class="fas fa-handshake game-tag-icon"></i>
            <span>${name}</span>
            <button type="button"
                    class="game-tag-remove"
                    onclick="removePartnershipTag('${escapeQuotes(name)}', '${context}')"
                    title="Remove ${name}">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(tag);
    });
}

// Hide already-selected partnerships from the dropdown (leave "+ Add new" always visible)
function updatePartnershipDropdownOptions(context = 'create') {
    const config = PartnershipTagConfig[context];
    const dropdown = document.getElementById(config.dropdown);
    if (!dropdown) return;

    Array.from(dropdown.options).forEach(option => {
        if (option.value === '' || option.value === '__new__') return;

        if (EventState.selectedPartnerships.includes(option.value)) {
            option.style.display = 'none';
            option.disabled = true;
        } else {
            option.style.display = '';
            option.disabled = false;
        }
    });
}

// Sync hidden input as partnerships are selected or deselected
function updateHiddenPartnershipsInput(context = 'create') {
    const config = PartnershipTagConfig[context];
    const hiddenInput = document.getElementById(config.hiddenInput);
    if (hiddenInput) {
        hiddenInput.value = JSON.stringify(EventState.selectedPartnerships);
    }
}

// Clear all selected partnerships
function clearSelectedPartnerships(context = 'create') {
    EventState.selectedPartnerships = [];
    updatePartnershipTagsDisplay(context);
    updateHiddenPartnershipsInput(context);
    updatePartnershipDropdownOptions(context);
}

/* =================================
   Filter UI
   ================================= */

// Sets active filter using only a primary option from the first box
function applyPrimaryFilter(value, label) {
    document.getElementById('filterBox1Label').textContent = label;
    document.getElementById('eventFilter').value = value;
    EventState.selectedGame = null;
    EventState.selectedPartnershipFilter = null;
    closeAllFilterPanels();

    // Hide Box 2 and reset season state
    document.getElementById('filterBox2').style.display = 'none';
    PastSeasonFilterState.selectedSeasonId = null;
    PastSeasonFilterState.isFilteringPastSeason = false;

    filterEvents();
}

// Sets active filter using submenu flyout in first box
function applyPrimaryFilterWithSub(filterVal, filterLabel, subSelectId, subVal, subLabel) {
    document.getElementById('filterBox1Label').textContent = `${filterLabel}: ${subLabel}`;
    document.getElementById('eventFilter').value = filterVal;
    document.getElementById(subSelectId).value = subVal;
    if (filterVal === 'game') EventState.selectedGame = subVal;
    if (filterVal === 'partnership') EventState.selectedPartnershipFilter = subVal;
    closeAllFilterPanels();

    document.getElementById('filterBox2').style.display = 'none';
    PastSeasonFilterState.selectedSeasonId = null;
    PastSeasonFilterState.isFilteringPastSeason = false;

    if (filterVal === 'game') {
        filterEventsByGame();
    } else if (filterVal === 'partnership') {
        filterEventsByPartnership();
    } else {
        handleTypeFilterChange();
    }
}

// Sets active filter using the selected past season
function applyPastSeasonFilter(seasonId, seasonName) {
    document.getElementById('filterBox1Label').textContent = seasonName;
    document.getElementById('eventFilter').value = 'past_season';
    document.getElementById('pastSeasonSelect').value = seasonId;
    closeAllFilterPanels();

    PastSeasonFilterState.isFilteringPastSeason = true;
    PastSeasonFilterState.selectedSeasonId = seasonId;
    PastSeasonFilterState.selectedSeasonName = seasonName;
    PastSeasonFilterState.secondaryFilter = 'all';

    // Show Box 2 with reset label
    document.getElementById('filterBox2Label').textContent = 'All Events';
    document.getElementById('filterBox2').style.display = 'block';

    loadEventsForPastSeason();
}

// Sets active filter using past season and the primary selection from second filter box
function applySecondaryFilter(value, label) {
    document.getElementById('filterBox2Label').textContent = label;
    document.getElementById('pastSeasonSecondaryFilter').value = value;
    closeAllFilterPanels();
    PastSeasonFilterState.secondaryFilter = value;
    PastSeasonFilterState.selectedGame = null;
    PastSeasonFilterState.selectedPartnership = null;
    loadEventsForPastSeason();
}

// Sets active filter using past season and the submenu flyout option selected in the second box
function applySecondaryFilterWithSub(filterVal, filterLabel, subSelectId, subVal, subLabel) {
    document.getElementById('filterBox2Label').textContent = `${filterLabel}: ${subLabel}`;
    document.getElementById('pastSeasonSecondaryFilter').value = filterVal;
    document.getElementById(subSelectId).value = subVal;
    PastSeasonFilterState.secondaryFilter = filterVal;
    if (filterVal === 'game') PastSeasonFilterState.selectedGame = subVal;
    if (filterVal === 'partnership') PastSeasonFilterState.selectedPartnership = subVal;
    closeAllFilterPanels();
    loadEventsForPastSeason();
}

// Populate past seasons flyout on hover
function initPastSeasonsFlyout() {
    const trigger = document.getElementById('pastSeasonsFlyoutTrigger');
    const flyout = document.getElementById('pastSeasonsFlyout');
    if (!trigger || !flyout) return;

    let loaded = false;
    trigger.addEventListener('mouseenter', async () => {
        if (loaded) return;
        loaded = true;
        try {
            const response = await fetch('/api/seasons/past');
            const data = await response.json();
            if (data.success && data.seasons?.length) {
                flyout.innerHTML = data.seasons.map(s => `
                    <div class="filter-box-flyout-item"
                         onclick="applyPastSeasonFilter('${s.season_id}', '${s.season_name.replace(/'/g, "\\'")}')">
                        ${s.season_name}
                    </div>
                `).join('');
            } else {
                flyout.innerHTML = '<div class="filter-box-flyout-loading">No past seasons</div>';
            }
        } catch {
            flyout.innerHTML = '<div class="filter-box-flyout-loading">Failed to load</div>';
        } finally {
            positionFlyout(trigger);
        }
    });
}

// Populate game flyouts on hover (both Box 1 and Box 2)
function initGameFlyouts() {
    ['gameFilterFlyoutTrigger1', 'gameFilterFlyoutTrigger2'].forEach((triggerId, i) => {
        const trigger = document.getElementById(triggerId);
        const flyout = document.getElementById(`gameFilterFlyout${i + 1}`);
        if (!trigger || !flyout) return;

        let loaded = false;
        trigger.addEventListener('mouseenter', async () => {
            if (loaded) return;
            loaded = true;
            try {
                const games = await loadGamesList();
                if (games?.length) {
                    flyout.innerHTML = games.map(g => `
                        <div class="filter-box-flyout-item"
                             onclick="${i === 0
                                ? `applyPrimaryFilterWithSub('game','Game','gameFilter','${g.GameTitle.replace(/'/g, "\\'")}','${g.GameTitle.replace(/'/g, "\\'")}')` : `applySecondaryFilterWithSub('game','Game','gameFilter','${g.GameTitle.replace(/'/g, "\\'")}','${g.GameTitle.replace(/'/g, "\\'")}')`
                             }">
                            ${g.GameTitle}
                        </div>
                    `).join('');
                } else {
                    flyout.innerHTML = '<div class="filter-box-flyout-loading">No games found</div>';
                }
            } catch {
                flyout.innerHTML = '<div class="filter-box-flyout-loading">Failed to load</div>';
            } finally {
                positionFlyout(trigger);
            }
        });
    });
}

// Populate the Partnerships filter flyouts (primary + past-season secondary) on hover
function initPartnershipFilterFlyout() {
    [
        { triggerId: 'partnershipFilterFlyoutTrigger', flyoutId: 'partnershipFilterFlyout', isPrimary: true },
        { triggerId: 'partnershipFilterFlyoutTrigger2', flyoutId: 'partnershipFilterFlyout2', isPrimary: false }
    ].forEach(({ triggerId, flyoutId, isPrimary }) => {
        const trigger = document.getElementById(triggerId);
        const flyout = document.getElementById(flyoutId);
        if (!trigger || !flyout) return;

        let loaded = false;
        trigger.addEventListener('mouseenter', async () => {
            if (loaded) return;
            loaded = true;
            try {
                const partnerships = await loadPartnershipsList();
                if (partnerships?.length) {
                    flyout.innerHTML = partnerships.map(p => `
                        <div class="filter-box-flyout-item"
                             onclick="${isPrimary
                                ? `applyPrimaryFilterWithSub('partnership','Partnerships','partnershipFilter','${p.partnership_name.replace(/'/g, "\\'")}','${p.partnership_name.replace(/'/g, "\\'")}')`
                                : `applySecondaryFilterWithSub('partnership','Partnerships','partnershipFilter','${p.partnership_name.replace(/'/g, "\\'")}','${p.partnership_name.replace(/'/g, "\\'")}')`
                             }">
                            ${p.partnership_name}
                        </div>
                    `).join('');
                } else {
                    flyout.innerHTML = '<div class="filter-box-flyout-loading">No partnerships found</div>';
                }
            } catch {
                flyout.innerHTML = '<div class="filter-box-flyout-loading">Failed to load</div>';
            } finally {
                positionFlyout(trigger);
            }
        });
    });
}

/* ===============================
   Event Filtering
   =============================== */
function filterEvents() {
    const filterSelect = document.getElementById('eventFilter');
    const filterValue = filterSelect?.value || 'all';

    const typeFilterContainer = document.getElementById('eventTypeFilterContainer');
    const typeFilterSelect = document.getElementById('eventTypeFilter');
    const gameFilterContainer = document.getElementById('gameFilterContainer');
    const gameFilterSelect = document.getElementById('gameFilter');
    const partnershipFilterSelect = document.getElementById('partnershipFilter');

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
    if (partnershipFilterSelect) partnershipFilterSelect.value = '';
    EventState.selectedPartnershipFilter = null;

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

    // Load events with main filter (defaults to current active season on backend)
    loadEvents();
}

// Handle type filter change
function handleTypeFilterChange() {
    if (PastSeasonFilterState.isFilteringPastSeason) {
        if (document.getElementById('eventTypeFilter')?.value) loadEventsForPastSeason();
    } else {
        filterEventsByType();
    }
}

// Handle game filter change
function handleGameFilterChange() {
    if (PastSeasonFilterState.isFilteringPastSeason) {
        if (document.getElementById('gameFilter')?.value) loadEventsForPastSeason();
    } else {
        filterEventsByGame();
    }
}

// Filter events by type (called when type dropdown changes)
function filterEventsByType() {
    const typeFilterSelect = document.getElementById('eventTypeFilter');
    if (typeFilterSelect?.value) {
        loadEvents();
    }
}

// Filter events by game (called when game dropdown changes)
function filterEventsByGame() {
    const gameFilterSelect = document.getElementById('gameFilter');
    if (gameFilterSelect?.value || EventState.selectedGame) {
        loadEvents();
    }
}

// Filter events by partnership (called when a partnership is selected from the flyout)
function filterEventsByPartnership() {
    const partnershipFilterSelect = document.getElementById('partnershipFilter');
    if (partnershipFilterSelect?.value || EventState.selectedPartnershipFilter) {
        loadEvents();
    }
}

/* ================================
    SEASON FILTERING
   ================================ */

// Global state for season filtering
const PastSeasonFilterState = {
    selectedSeasonId: null,
    selectedSeasonName: '',
    availablePastSeasons: [],
    secondaryFilter: 'all',
    isFilteringPastSeason: false,
    selectedGame: null,
    selectedPartnership: null
};

// Filter events by past season and secondary filter
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
}

/* ===============================
   Game Dropdown Tag System
   =============================== */
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

// Initialize game tag selector for a specific context
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
        dropdown.innerHTML = '<option value="">+ Add game</option>';

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

// Attach change listeners for game dropdown
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

// Add a tag to selected games for an event
function addGameTag(gameTitle, context = 'create') {
    if (EventState.selectedGames.includes(gameTitle)) return;

    EventState.selectedGames.push(gameTitle);
    updateGameTagsDisplay(context);
    updateHiddenGamesInput(context);
    updateDropdownOptions(context);
}

// Remove a tag from the selected games
function removeGameTag(gameTitle, context = 'create') {
    EventState.selectedGames = EventState.selectedGames.filter(game => game !== gameTitle);
    updateGameTagsDisplay(context);
    updateHiddenGamesInput(context);
    updateDropdownOptions(context);
}

// Update display of selected games
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

// Update dropdown when games are selected or deselected
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

// Update list of hidden games as games are selected or deselected
function updateHiddenGamesInput(context = 'create') {
    const config = GameTagConfig[context];
    const hiddenInput = document.getElementById(config.hiddenInput);
    if (hiddenInput) {
        hiddenInput.value = JSON.stringify(EventState.selectedGames);
    }
}

// Clear all selected games
function clearSelectedGames(context = 'create') {
    EventState.selectedGames = [];
    updateGameTagsDisplay(context);
    updateHiddenGamesInput(context);
    updateDropdownOptions(context);
}

/* ==============================
   State Messages
   ============================== */

// Get empty state message based on filter type
function getEmptyStateMessage(filterValue) {
     if (PastSeasonFilterState.isFilteringPastSeason) {
        const seasonName = PastSeasonFilterState.selectedSeasonName;
        const secondaryFilter = PastSeasonFilterState.secondaryFilter;

        if (secondaryFilter === 'created_by_me') {
            return { title: `No Events Created in ${seasonName}`, text: `You haven't created any events in ${seasonName}.` };
        } else if (secondaryFilter === 'type') {
            const typeSelect = document.getElementById('eventTypeFilter');
            const typeName = typeSelect?.options[typeSelect.selectedIndex]?.text || 'Selected';
            return { title: `No ${typeName} Events in ${seasonName}`, text: `No ${typeName.toLowerCase()} events found in ${seasonName}.` };
        } else if (secondaryFilter === 'game') {
            const gameSelect = document.getElementById('gameFilter');
            const gameName = gameSelect?.options[gameSelect.selectedIndex]?.text || 'Selected Game';
            return { title: `No ${gameName} Events in ${seasonName}`, text: `No events found for ${gameName} in ${seasonName}.` };
        }
        return { title: `No Events in ${seasonName}`, text: `No events found for ${seasonName}.` };
    }

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

// Update empty state message based on current filter
function updateEmptyStateMessage() {
    const emptyStateDiv = document.getElementById('eventsEmptyState');
    const emptyStateTitle = emptyStateDiv?.querySelector('h3');
    const emptyStateText = emptyStateDiv?.querySelector('p');
    if (!emptyStateTitle || !emptyStateText) return;

    const filterValue = document.getElementById('eventFilter')?.value || 'all';
    const message = getEmptyStateMessage(filterValue);
    emptyStateTitle.textContent = message.title;
    emptyStateText.textContent = message.text;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Set element display style (with null check)
function setElementDisplay(element, displayValue) {
    if (element) element.style.display = displayValue;
}

// Escape single quotes in strings for safe HTML attribute use
function escapeQuotes(str) {
    return str.replace(/'/g, "\\'");
}

// Builds a loading state for events
function showEventsLoadingState() {
    setElementDisplay(document.getElementById('eventsLoading'), 'block');
    setElementDisplay(document.getElementById('eventsContainer'), 'none');
    setElementDisplay(document.getElementById('eventsEmptyState'), 'none');
}

// Hides the loading state for events
function hideEventsLoadingState() {
    setElementDisplay(document.getElementById('eventsLoading'), 'none');
}

// ===================================
// HELPERS
// ===================================

// Check if current user can delete an event
function canUserDeleteEvent(event) {
    const { is_developer, is_gm, is_admin } = EventState.permissions;
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

        return within24Hours;
    }

    // Non-GM, non-admin, non-developer users cannot delete
    return false;
}

// Get time remaining for deletion window
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

// Check if current user can edit an event
function canUserEditEvent(event) {
    const { is_admin, is_developer, is_gm } = EventState.permissions;
    const sessionUserId = window.currentUserId || 0;
    return is_admin || is_developer || (is_gm && event.created_by === sessionUserId);
}

// Loads and activates the banner slideshow system in the event detail pane
function startBannerSlideshow(bannerEl) {
    const slides = bannerEl.querySelectorAll('.event-detail-banner-slide');
    if (slides.length <= 1) return;
    let current = 0;
    clearInterval(bannerEl._slideInterval);
    bannerEl._slideInterval = setInterval(() => {
        slides[current].classList.remove('active');
        current = (current + 1) % slides.length;
        slides[current].classList.add('active');
    }, 3500);
}

// Starts the partnership slideshow if multiple present
function initPartnershipFlairStage(stageEl) {
    if (!stageEl) return;
    const flairs = Array.from(stageEl.querySelectorAll('.partnership-flair'));
    if (!flairs.length) return;

    const maxWidth = Math.max(...flairs.map(f => f.offsetWidth));
    stageEl.style.width = `${maxWidth}px`;

    if (flairs.length > 1) {
        let current = 0;
        clearInterval(stageEl._flairInterval);
        stageEl._flairInterval = setInterval(() => {
            flairs[current].classList.remove('active');
            current = (current + 1) % flairs.length;
            flairs[current].classList.add('active');
        }, 2500);
    }
}

// ============================================
// GLOBAL EXPORTS
// ============================================
window.initializeEventsModule = initializeEventsModule;
window.loadEvents = loadEvents;

// Create Event
window.openCreateEventModal = openCreateEventModal;
window.closeCreateEventModal = closeCreateEventModal;
window.handleEventTypeChange = handleEventTypeChange;
window.toggleAllDayEvent = toggleAllDayEvent;

// Delete Event
window.deleteEvent = deleteEvent;

// Filtering
window.filterEvents = filterEvents;
window.filterEventsByPastSeason = filterEventsByPastSeason;

// Event Detail Panel
window.openEventDetailPanel = openEventDetailPanel;
window.closeEventDetailSheet = closeEventDetailSheet;