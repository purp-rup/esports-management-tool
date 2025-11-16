// DISCLAIMER: CODE REWRITTEN AND ORGANIZED BY CLAUDE

/**
 * events.js
 * Handles all event-related functionality for the dashboard
 * Including: event loading, filtering, CRUD operations, modals, and notifications
 */

// ============================================
// GLOBAL STATE
// ============================================
let currentEventId = null;
let currentEventData = null;
let currentDeleteEventId = null;
let currentDeleteEventName = '';
let currentUserPermissions = { is_admin: false, is_gm: false };
let gamesCache = null;

// Store events data for day modal access
let eventsData = {};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize events module when DOM is ready
 */
function initializeEventsModule(eventsDataFromServer) {
    eventsData = eventsDataFromServer || {};

    // Attach event listeners
    attachEventListeners();

    console.log('Events module initialized');
}

/**
 * Attach all event-related listeners
 */
function attachEventListeners() {
    // Events tab click
    const eventsTab = document.querySelector('[data-tab="events"]');
    if (eventsTab) {
        eventsTab.addEventListener('click', function() {
            setTimeout(loadEvents, 100);
        });
    }

    // Delete modal background click
    const deleteModal = document.getElementById('deleteEventConfirmModal');
    if (deleteModal) {
        deleteModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeDeleteConfirmModal();
            }
        });
    }

    // Create event form submission
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
// EVENT LOADING & FILTERING
// ============================================

/**
 * Load events from the server
 */
function loadEvents() {
    const loadingDiv = document.getElementById('eventsLoading');
    const containerDiv = document.getElementById('eventsContainer');
    const emptyStateDiv = document.getElementById('eventsEmptyState');

    // Show loading state
    loadingDiv.style.display = 'block';
    containerDiv.style.display = 'none';
    emptyStateDiv.style.display = 'none';

    // Get current filter value
    const filterSelect = document.getElementById('eventFilter');
    const filterValue = filterSelect ? filterSelect.value : 'all';

    // Fetch events with filter parameter
    fetch(`/api/events?filter=${filterValue}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                currentUserPermissions = {
                    is_admin: data.is_admin,
                    is_gm: data.is_gm
                };

                renderEvents(data.events, data.is_admin, data.is_gm);
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
            loadingDiv.style.display = 'none';
        });
}

/**
 * Filter events based on dropdown selection
 */
function filterEvents() {
    loadEvents();
}

/**
 * Render events in the grid
 */
function renderEvents(events, isAdmin, isGm) {
    const containerDiv = document.getElementById('eventsContainer');
    const emptyStateDiv = document.getElementById('eventsEmptyState');

    if (events.length === 0) {
        containerDiv.style.display = 'none';
        emptyStateDiv.style.display = 'block';
        updateEmptyStateMessage();
        return;
    }

    const gridHTML = '<div class="events-grid">' +
        events.map(event => createEventCard(event, isAdmin, isGm)).join('') +
        '</div>';

    containerDiv.innerHTML = gridHTML;
    containerDiv.style.display = 'block';
    emptyStateDiv.style.display = 'none';
}

/**
 * Update empty state message based on filter
 */
function updateEmptyStateMessage() {
    const emptyStateDiv = document.getElementById('eventsEmptyState');
    const filterSelect = document.getElementById('eventFilter');
    const filterValue = filterSelect ? filterSelect.value : 'all';

    const emptyStateTitle = emptyStateDiv.querySelector('h3');
    const emptyStateText = emptyStateDiv.querySelector('p');

    if (filterValue === 'upcoming') {
        emptyStateTitle.textContent = 'No Upcoming Events';
        emptyStateText.textContent = 'No events scheduled for the next 7 days. Check "All Events" to see all events.';
    } else {
        emptyStateTitle.textContent = 'No Events Found';
        // This will need to be set based on user permissions passed from server
        if (window.userPermissions && (window.userPermissions.is_admin || window.userPermissions.is_gm)) {
            emptyStateText.textContent = 'Click "Create Event" to add your first event';
        } else {
            emptyStateText.textContent = 'Subscribe to events to see them here, or check back later';
        }
    }
}

//Method to get the event type for a created event.
function getEventTypeClass(eventType) {
    return (eventType || 'event').toLowerCase();
}

/**
 * Create an event card HTML
 */
function createEventCard(event, isAdmin, isGm) {
    const sessionUserId = window.currentUserId || 0;
    const canDelete = isAdmin || (isGm && event.created_by === sessionUserId);
    const ongoingIndicator = event.is_ongoing ?
        '<div class="event-ongoing-indicator" title="Event is currently ongoing"></div>' : '';

    const deleteButton = canDelete ? `
        <button class="btn btn-secondary btn-delete" onclick="event.stopPropagation(); openDeleteConfirmModal(${event.id}, '${event.name.replace(/'/g, "\\'")}')">
            <i class="fas fa-trash"></i>
        </button>
    ` : '';

    const gameDisplay = event.game && event.game !== 'N/A' ? event.game : 'None';

    // Normalize event type to lowercase for data attribute ONLY
    const eventTypeClass = (event.event_type || 'event').toLowerCase();

    // REMOVED CLASS FROM event-card DIV - ONLY USE DATA-EVENT-TYPE
    return `
        <div class="event-card" data-event-type="${eventTypeClass}" onclick="openEventModal(${event.id})">
            ${ongoingIndicator}
            <div class="event-card-header">
                <h3 class="event-card-title">${event.name}</h3>
            </div>

            <div class="event-card-details">
                <div class="event-detail-row">
                    <div class="event-detail-icon">
                        <i class="fas fa-calendar"></i>
                    </div>
                    <span class="event-detail-label">Date:</span>
                    <span class="event-detail-value">${event.date}</span>
                </div>

                ${event.start_time ? `
                <div class="event-detail-row">
                    <div class="event-detail-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                    <span class="event-detail-label">Time:</span>
                    <span class="event-detail-value">${event.start_time} - ${event.end_time}</span>
                </div>
                ` : ''}

                <div class="event-detail-row">
                    <div class="event-detail-icon">
                        <i class="fas fa-tag"></i>
                    </div>
                    <span class="event-detail-label">Type:</span>
                    <span class="event-detail-value">
                        <span class="event-type-badge" data-type="${eventTypeClass}">${event.event_type}</span>
                    </span>
                </div>

                <div class="event-detail-row">
                    <div class="event-detail-icon">
                        <i class="fas fa-gamepad"></i>
                    </div>
                    <span class="event-detail-label">Game:</span>
                    <span class="event-detail-value">${gameDisplay}</span>
                </div>

                <div class="event-detail-row">
                    <div class="event-detail-icon">
                        <i class="fas fa-map-marker-alt"></i>
                    </div>
                    <span class="event-detail-label">Location:</span>
                    <span class="event-detail-value">${event.location}</span>
                </div>
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
 * Show error state
 */
function showEventsError() {
    const containerDiv = document.getElementById('eventsContainer');
    containerDiv.innerHTML = `
        <div class="events-info-message">
            <i class="fas fa-exclamation-circle"></i>
            <p>Failed to load events. Please refresh the page to try again.</p>
        </div>
    `;
    containerDiv.style.display = 'block';
}

// ============================================
// EVENT MODAL - VIEW & DETAILS
// ============================================

/**
 * Open event details modal
 */
async function openEventModal(eventId) {
    const modal = document.getElementById('eventDetailsModal');
    const spinner = document.getElementById('eventLoadingSpinner');
    const content = document.getElementById('eventDetailsContent');
    const deleteBtn = document.getElementById('deleteEventBtn');
    const titleElement = document.getElementById('eventDetailsTitle');

    currentEventId = eventId;

    if (titleElement) {
        titleElement.textContent = 'Loading...';
    }

    modal.style.display = 'block';
    spinner.style.display = 'block';
    content.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';
    document.body.style.overflow = 'hidden';

    try {
        const response = await fetch(`/api/event/${eventId}`);
        if (!response.ok) throw new Error('Failed to fetch event details');
        const event = await response.json();

        currentEventData = event;

        // Add event type as data attribute to modal for color styling
        const eventTypeClass = (event.event_type || 'event').toLowerCase();
        modal.setAttribute('data-event-type', eventTypeClass);

        if (titleElement) {
            titleElement.textContent = event.name || 'Event Details';
        }

        const detailsHTML = buildEventDetailsHTML(event);
        content.innerHTML = detailsHTML;

        spinner.style.display = 'none';
        content.style.display = 'block';
        if (deleteBtn) deleteBtn.style.display = 'flex';

        updateEventButtons(event);
        await loadNotificationSection(eventId);

    } catch (error) {
        console.error('Error loading event details:', error);
        handleEventLoadError(titleElement, content, spinner);
    }
}

/**
 * Build event details HTML
 */
function buildEventDetailsHTML(event) {
    let html = '<div class="event-detail-grid">';

    // Date
    html += `
        <div class="event-detail-section">
            <div class="event-detail-icon"><i class="fas fa-calendar-alt"></i></div>
            <div class="event-detail-content">
                <h3>Date</h3>
                <p>${event.date}</p>
            </div>
        </div>
    `;

    // Time
    if (event.start_time) {
        html += `
            <div class="event-detail-section">
                <div class="event-detail-icon"><i class="fas fa-clock"></i></div>
                <div class="event-detail-content">
                    <h3>Time</h3>
                    <p>${event.start_time}${event.end_time ? ' - ' + event.end_time : ''}</p>
                </div>
            </div>
        `;
    }

    // Event Type
    if (event.event_type) {
        html += `
            <div class="event-detail-section">
                <div class="event-detail-icon"><i class="fas fa-tag"></i></div>
                <div class="event-detail-content">
                    <h3>Event Type</h3>
                    <p>${event.event_type}</p>
                </div>
            </div>
        `;
    }

    // Game
    if (event.game) {
        html += `
            <div class="event-detail-section">
                <div class="event-detail-icon"><i class="fas fa-gamepad"></i></div>
                <div class="event-detail-content">
                    <h3>Game</h3>
                    <p>${event.game}</p>
                </div>
            </div>
        `;
    }

    // Location
    if (event.location) {
        html += `
            <div class="event-detail-section" style="grid-column: 1 / -1;">
                <div class="event-detail-icon"><i class="fas fa-map-marker-alt"></i></div>
                <div class="event-detail-content">
                    <h3>Location</h3>
                    <p>${event.location}</p>
                </div>
            </div>
        `;
    }

    // Description
    html += `
        <div class="event-detail-section full-width">
            <div style="display: flex; gap: 0.75rem;">
                <div class="event-detail-icon"><i class="fas fa-info-circle"></i></div>
                <div class="event-detail-content">
                    <h3>Description</h3>
                    <p>${event.description}</p>
                </div>
            </div>
        </div>
    `;

    // Notification section
    html += `
        <div class="event-notification-section full-width" id="eventNotificationSection"
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

    html += '</div>';
    return html;
}

/**
 * Update edit/delete buttons based on permissions
 */
function updateEventButtons(event) {
    const editBtn = document.getElementById("editEventBtn");
    const deleteBtn = document.getElementById("deleteEventBtn");

    const isAdmin = window.userPermissions ? window.userPermissions.is_admin : false;
    const isGM = window.userPermissions ? window.userPermissions.is_gm : false;
    const currentUserId = window.currentUserId || 0;

    const titleElement = document.getElementById('eventDetailsTitle');

    if (editBtn && currentEventData) {
        if (isAdmin || (isGM && currentEventData.created_by === currentUserId)) {
            editBtn.style.display = 'flex';
        }
    }

    if (deleteBtn && isAdmin) {
        deleteBtn.style.display = 'flex';
    }

    if (titleElement && currentEventData) {
        titleElement.textContent = currentEventData.name;
    }
}

/**
 * Submit event edit
 */
async function submitEventEdit() {
    const formMessage = document.getElementById('editFormMessage');
    const submitBtn = document.querySelector('#editEventFormData .btn-primary');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const locationSelect = document.getElementById('editLocation');
    const customLocationInput = document.getElementById('editCustomLocation');
    const locationValue = locationSelect.value === 'other' ? customLocationInput.value : locationSelect.value;

    const formData = {
        event_id: currentEventId,
        event_name: document.getElementById('editEventName').value,
        event_type: document.getElementById('editEventType').value,
        game: document.getElementById('editGame').value,
        event_date: document.getElementById('editDate').value,
        start_time: document.getElementById('editStartTime').value,
        end_time: document.getElementById('editEndTime').value,
        location: locationValue,
        description: document.getElementById('editDescription').value
    };

    try {
        const response = await fetch('/api/event/edit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            formMessage.textContent = data.message;
            formMessage.className = 'form-message success';
            formMessage.style.display = 'block';

            setTimeout(() => {
                closeEventModal();
                window.location.reload();
            }, 1500);
        } else {
            formMessage.textContent = data.message || 'Failed to update event';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';

            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        }
    } catch (error) {
        console.error('Error updating event:', error);
        formMessage.textContent = 'An error occurred while updating the event';
        formMessage.className = 'form-message error';
        formMessage.style.display = 'block';

        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
}

// ============================================
// DELETE EVENT
// ============================================

/**
 * Open delete confirmation modal
 */
function openDeleteConfirmModal(eventId, eventName) {
    currentDeleteEventId = eventId;
    currentDeleteEventName = eventName;

    document.getElementById('deleteEventName').textContent = eventName;
    document.getElementById('deleteEventConfirmModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * Close delete confirmation modal
 */
function closeDeleteConfirmModal() {
    document.getElementById('deleteEventConfirmModal').classList.remove('active');
    document.body.style.overflow = 'auto';
    currentDeleteEventId = null;
    currentDeleteEventName = '';
}

/**
 * Confirm event deletion
 */
async function confirmDeleteEvent() {
    if (!currentDeleteEventId) return;

    try {
        const response = await fetch(`/api/events/${currentDeleteEventId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            closeDeleteConfirmModal();
            alert(data.message);
            window.location.reload();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error deleting event:', error);
        alert('An error occurred while deleting the event. Please try again.');
    }
}

/**
 * Delete event (legacy function for calendar)
 */
async function deleteEvent() {
    if (!currentEventId) {
        alert("Event ID not found.");
        return;
    }

    if (!confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
        return;
    }

    try {
        const response = await fetch('/delete-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ event_id: currentEventId })
        });

        const data = await response.json();

        if (data.success) {
            alert("Event deleted successfully!");
            closeEventModal();
            window.location.reload();
        } else {
            alert("Error: " + (data.message || "Failed to delete event"));
        }
    } catch (error) {
        console.error("Error deleting event:", error);
        alert("Something went wrong while deleting the event.");
    }
}

// ============================================
// GAMES DROPDOWN MANAGEMENT
// ============================================

/**
 * Load games for dropdown
 */
async function loadGamesForDropdown() {
    const gameSelect = document.getElementById('game');
    const loadingIndicator = document.getElementById('gameLoadingIndicator');

    if (!gameSelect) return;

    if (gamesCache) {
        populateGameDropdown(gamesCache);
        return;
    }

    loadingIndicator.style.display = 'block';
    gameSelect.disabled = true;

    try {
        const response = await fetch('/api/games-list');
        const data = await response.json();

        if (data.success && data.games) {
            gamesCache = data.games;
            populateGameDropdown(data.games);
        } else {
            gameSelect.innerHTML = '<option value="">Error loading games</option>';
        }
    } catch (error) {
        console.error('Error fetching games:', error);
        gameSelect.innerHTML = '<option value="">Error loading games</option>';
    } finally {
        loadingIndicator.style.display = 'none';
        gameSelect.disabled = false;
    }
}

/**
 * Populate game dropdown
 */
function populateGameDropdown(games) {
    const gameSelect = document.getElementById('game');

    gameSelect.innerHTML = '<option value="">Select game</option>';

    if (games.length === 0) {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "No games available";
        option.disabled = true;
        gameSelect.appendChild(option);
        return;
    }

    games.forEach(game => {
        const option = document.createElement('option');
        option.value = game.GameTitle;
        option.textContent = game.GameTitle;
        gameSelect.appendChild(option);
    });
}

/**
 * Load games for edit dropdown
 */
async function loadGamesForEditDropdown() {
    const gameSelect = document.getElementById('editGame');
    const loadingIndicator = document.getElementById('editGameLoadingIndicator');

    if (!gameSelect) return;

    loadingIndicator.style.display = 'block';
    gameSelect.disabled = true;

    try {
        const response = await fetch('/api/games-list');
        const data = await response.json();

        if (data.success && data.games) {
            gameSelect.innerHTML = '<option value="">Select game</option>';

            data.games.forEach(game => {
                const option = document.createElement('option');
                option.value = game.GameTitle;
                option.textContent = game.GameTitle;

                if (currentEventData && game.GameTitle === currentEventData.game) {
                    option.selected = true;
                }

                gameSelect.appendChild(option);
            });

            if (data.games.length === 0) {
                const option = document.createElement('option');
                option.value = "";
                option.textContent = "No games available";
                option.disabled = true;
                gameSelect.appendChild(option);
            }
        }
    } catch (error) {
        console.error('Error fetching games:', error);
        gameSelect.innerHTML = '<option value="">Error loading games</option>';
    } finally {
        loadingIndicator.style.display = 'none';
        gameSelect.disabled = false;
    }
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

// Make functions available globally for onclick handlers
window.initializeEventsModule = initializeEventsModule;
window.loadEvents = loadEvents;
window.filterEvents = filterEvents;
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.openDayModal = openDayModal;
window.closeDayModal = closeDayModal;
window.openCreateEventModal = openCreateEventModal;
window.closeCreateEventModal = closeCreateEventModal;
window.toggleEditMode = toggleEditMode;
window.cancelEdit = cancelEdit;
window.submitEventEdit = submitEventEdit;
window.deleteEvent = deleteEvent;
window.openDeleteConfirmModal = openDeleteConfirmModal;
window.closeDeleteConfirmModal = closeDeleteConfirmModal;
window.confirmDeleteEvent = confirmDeleteEvent;
window.toggleEventSubscription = toggleEventSubscription;
window.loadGamesForDropdown = loadGamesForDropdown;
window.toggleAllDayEvent = toggleAllDayEvent;

    const isGM = window.userPermissions ? window.userPermissions.is_gm : false;
    const currentUserId = window.currentUserId || 0;
    const editBtn = document.getElementById("editEventBtn");
    const isAdmin = window.userPermissions ? window.userPermissions.is_admin : false;
    const deleteBtn = document.getElementById("deleteEventBtn");

    if (editBtn) {
        if (isAdmin || (isGM && event.created_by === currentUserId)) {
            editBtn.style.display = "flex";
        } else {
            editBtn.style.display = "none";
        }
    }

    if (deleteBtn && isAdmin) {
        deleteBtn.style.display = "flex";
    }

/**
 * Handle event load error
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
    spinner.style.display = 'none';
    content.style.display = 'block';
}

/**
 * Close event modal
 */
function closeEventModal() {
    const modal = document.getElementById('eventDetailsModal');
    const deleteBtn = document.getElementById("deleteEventBtn");
    const editBtn = document.getElementById("editEventBtn");
    const content = document.getElementById("eventDetailsContent");
    const editForm = document.getElementById("eventEditForm");

    modal.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";
    if (editBtn) editBtn.style.display = "none";
    if (content) content.style.display = "none";
    if (editForm) editForm.style.display = "none";

    document.body.style.overflow = "auto";
    currentEventId = null;
    currentEventData = null;
}

// ============================================
// EVENT NOTIFICATIONS
// ============================================

/**
 * Load notification section for an event
 */
async function loadNotificationSection(eventId) {
    const btn = document.getElementById('notificationBtn');
    const btnText = document.getElementById('notificationBtnText');

    if (!btn || !btnText) return;

    try {
        const response = await fetch(`/api/event/${eventId}/subscription-status`);
        const data = await response.json();

        if (!data.notifications_enabled) {
            btn.disabled = true;
            btn.classList.add('disabled');
            btnText.textContent = 'Enable notifications in Profile';
            return;
        }

        btn.disabled = false;
        btn.classList.remove('disabled');

        if (data.subscribed) {
            btnText.textContent = 'Subscribed';
            btn.classList.add('subscribed');
        } else {
            btnText.textContent = 'Subscribe';
            btn.classList.remove('subscribed');
        }

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

    if (!currentEventId) return;

    try {
        const response = await fetch(`/api/event/${currentEventId}/toggle-subscription`, {
            method: 'POST'
        });
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        if (data.status === 'subscribed') {
            btnText.textContent = 'Subscribed';
            btn.classList.add('subscribed');
        } else {
            btnText.textContent = 'Subscribe';
            btn.classList.remove('subscribed');
        }

    } catch (err) {
        console.error('Error toggling subscription:', err);
        alert('Failed to toggle subscription.');
    }
}

// ============================================
// DAY MODAL (Calendar)
// ============================================

/**
 * Open day events modal
 */
function openDayModal(date, dateTitle) {
    const modal = document.getElementById('dayEventsModal');
    const modalTitle = document.getElementById('modalDayTitle');
    const modalBody = document.getElementById('modalEventsList');

    modalTitle.textContent = dateTitle;
    const events = eventsData[date] || [];
    modalBody.innerHTML = '';

    if (events.length > 0) {
        events.forEach(event => {
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
            modalBody.appendChild(eventItem);
        });
    } else {
        modalBody.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No events scheduled for this day.</p>';
    }

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Close day modal
 */
function closeDayModal() {
    const modal = document.getElementById('dayEventsModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// ============================================
// CREATE EVENT
// ============================================

/**
 * Open create event modal
 */
function openCreateEventModal() {
    const modal = document.getElementById('createEventModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    document.getElementById('createEventForm').reset();
    document.getElementById('customLocationGroup').style.display = 'none';
    document.getElementById('formMessage').style.display = 'none';

    loadGamesForDropdown();
}

/**
 * Close create event modal
 */
function closeCreateEventModal() {
    const modal = document.getElementById('createEventModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

/**
 * Handle location dropdown change
 */
function handleLocationChange(e) {
    const customLocationGroup = document.getElementById('customLocationGroup');
    const customLocationInput = document.getElementById('customLocation');

    if (e.target.value === 'other') {
        customLocationGroup.style.display = 'block';
        customLocationInput.required = true;
    } else {
        customLocationGroup.style.display = 'none';
        customLocationInput.required = false;
        customLocationInput.value = '';
    }
}

/**
 * Toggle all-day event button
 * When clicked, switches between blue "All Day?" and green "All Day"
 * Disables/enables time inputs accordingly
 */
function toggleAllDayEvent() {
    const allDayCheckbox = document.getElementById('allDayEvent');
    const allDayButton = document.getElementById('allDayButton');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');

    // Toggle the hidden checkbox state
    allDayCheckbox.checked = !allDayCheckbox.checked;

    if (allDayCheckbox.checked) {
        // Change to active state (green)
        allDayButton.textContent = 'ALL DAY';
        allDayButton.classList.add('active');

        // Set to all-day times
        startTimeInput.value = '00:00';
        endTimeInput.value = '23:59';

        // Disable inputs visually
        startTimeInput.disabled = true;
        endTimeInput.disabled = true;
        startTimeInput.style.opacity = '0.5';
        endTimeInput.style.opacity = '0.5';

        // Remove required attribute
        startTimeInput.removeAttribute('required');
        endTimeInput.removeAttribute('required');
    } else {
        // Change to inactive state (blue)
        allDayButton.textContent = 'ALL DAY?';
        allDayButton.classList.remove('active');

        // Clear time values
        startTimeInput.value = '';
        endTimeInput.value = '';

        // Enable inputs
        startTimeInput.disabled = false;
        endTimeInput.disabled = false;
        startTimeInput.style.opacity = '1';
        endTimeInput.style.opacity = '1';

        // Add back required attribute
        startTimeInput.setAttribute('required', 'required');
        endTimeInput.setAttribute('required', 'required');
    }
}

/**
 * Handle create event form submission
 */
async function handleCreateEventSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const submitBtnText = document.getElementById('submitBtnText');
    const submitBtnSpinner = document.getElementById('submitBtnSpinner');
    const formMessage = document.getElementById('formMessage');

    submitBtn.disabled = true;
    submitBtnText.style.display = 'none';
    submitBtnSpinner.style.display = 'inline-block';

    const formData = new FormData(e.target);

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
            formMessage.textContent = data.message || 'Event created successfully! Refreshing calendar...';
            formMessage.className = 'form-message success';
            formMessage.style.display = 'block';

            setTimeout(() => { window.location.reload(); }, 1500);
        } else {
            throw new Error(data.message || 'Failed to create event');
        }
    } catch (error) {
        formMessage.textContent = error.message || 'Failed to create event. Please try again.';
        formMessage.className = 'form-message error';
        formMessage.style.display = 'block';

        submitBtn.disabled = false;
        submitBtnText.style.display = 'inline';
        submitBtnSpinner.style.display = 'none';
    }
}

// ============================================
// EDIT EVENT
// ============================================

/**
 * Toggle edit mode
 */
function toggleEditMode() {
    const content = document.getElementById('eventDetailsContent');
    const editForm = document.getElementById('eventEditForm');
    const editBtn = document.getElementById('editEventBtn');
    const deleteBtn = document.getElementById('deleteEventBtn');
    const titleElement = document.getElementById('eventDetailsTitle');

    content.style.display = 'none';
    editForm.style.display = 'block';
    if (editBtn) editBtn.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';

    if (titleElement) {
        titleElement.textContent = 'Edit Event';
    }

    createEditForm();
}

/**
 * Create edit form
 */
function createEditForm() {
    const editForm = document.getElementById('eventEditForm');
    if (!currentEventData) return;

    const event = currentEventData;

    editForm.innerHTML = `
        <form id="editEventFormData" class="event-form-modal">
            <div class="form-group">
                <label for="editEventName">Event Name</label>
                <input type="text" id="editEventName" name="eventName"
                       value="${event.name}" required>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="editEventType">Event Type</label>
                    <select id="editEventType" name="eventType" required>
                        <option value="Event" ${event.event_type === 'Event' ? 'selected' : ''}>Event</option>
                        <option value="Match" ${event.event_type === 'Match' ? 'selected' : ''}>Match</option>
                        <option value="Practice" ${event.event_type === 'Practice' ? 'selected' : ''}>Practice</option>
                        <option value="Tournament" ${event.event_type === 'Tournament' ? 'selected' : ''}>Tournament</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="editGame">Game (Optional)</label>
                    <select id="editGame" name="game">
                        <option value="">Select game</option>
                    </select>
                    <div id="editGameLoadingIndicator" style="display: none; font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                        <i class="fas fa-spinner fa-spin"></i> Loading games...
                    </div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="editDate">Date</label>
                    <input type="date" id="editDate" name="eventDate"
                           value="${event.date_raw}" required>
                </div>

                <div class="form-group">
                    <label for="editStartTime">Start Time</label>
                    <input type="time" id="editStartTime" name="startTime"
                           value="${event.start_time}" required>
                </div>

                <div class="form-group">
                    <label for="editEndTime">End Time</label>
                    <input type="time" id="editEndTime" name="endTime"
                           value="${event.end_time}" required>
                </div>
            </div>

            <div class="form-group">
                <label for="editLocation">Location</label>
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
                <input type="text" id="editCustomLocation" name="customLocation" placeholder="Enter custom location">
            </div>

            <div class="form-group">
                <label for="editDescription">Description</label>
                <textarea id="editDescription" name="eventDescription"
                          required>${event.description}</textarea>
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

    loadGamesForEditDropdown();
    setupEditLocationDropdown(event.location);
}

/**
 * Setup edit location dropdown
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

    if (presetLocations.includes(currentLocation)) {
        locationSelect.value = currentLocation;
    } else {
        locationSelect.value = 'other';
        customLocationGroup.style.display = 'block';
        customLocationInput.value = currentLocation;
        customLocationInput.required = true;
    }

    locationSelect.addEventListener('change', function() {
        if (this.value === 'other') {
            customLocationGroup.style.display = 'block';
            customLocationInput.required = true;
        } else {
            customLocationGroup.style.display = 'none';
            customLocationInput.required = false;
            customLocationInput.value = '';
        }
    });
}

/**
 * Cancel edit
 */
function cancelEdit() {
    const content = document.getElementById('eventDetailsContent');
    const editForm = document.getElementById('eventEditForm');
    const editBtn = document.getElementById('editEventBtn');
    const deleteBtn = document.getElementById('deleteEventBtn');
    const titleElement = document.getElementById('eventDetailsTitle');

    content.style.display = 'block';
    editForm.style.display = 'none';

    const isAdmin = window.userPermissions ? window.userPermissions.is_admin : false;
}