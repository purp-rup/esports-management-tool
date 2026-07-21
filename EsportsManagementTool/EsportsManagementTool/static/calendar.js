/**
 * Handles logic & rendering for both calendars.
 */

// Global variables - use unique names to avoid conflicts with dashboard scripts
let currentDate = new Date();
let calendarEventsData = {};  
let isUserLoggedIn = false;
let clickOutsideHandler = null; // Listens for clicks outside popups
let activeAnchorElement = null;
let currentFetchController = null; // AbortController for the in-flight event fetch

window.currentEventId = null;
window.currentEventData = null;

const CALENDAR_MOBILE_BREAKPOINT = 768; // matches .mobile-sheet breakpoint in dashboard-base.css

function isCalendarMobileView() {
    return window.innerWidth <= CALENDAR_MOBILE_BREAKPOINT;
}

// Creates the shared backdrop for the mobile event popup sheet.
// Reuses the same .sheet-backdrop class/behavior as the Events tab

function ensureCalendarPopupBackdrop() {
    let backdrop = document.getElementById('calendarPopupBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'calendarPopupBackdrop';
        backdrop.className = 'sheet-backdrop';
        backdrop.addEventListener('click', () => window.closeEventPopup());
        document.body.appendChild(backdrop);
    }
    return backdrop;
}

// If the viewport crosses the mobile breakpoint while a popup is open,
// close it rather than leaving it in a mismatched state (sheet vs anchored popover)
window.addEventListener('resize', () => {
    const popup = document.getElementById('landingEventPopup');
    if (!popup) return;
    const isSheet = popup.classList.contains('mobile-sheet');
    if (isSheet !== isCalendarMobileView()) {
        window.closeEventPopup();
    }
});

// Popup close function
window.closeEventPopup = function() {
    // Cancel any in-flight fetch so rapid clicks don't send concurrent
    // requests to Flask's single-threaded dev server
    if (currentFetchController) {
        currentFetchController.abort();
        currentFetchController = null;
    }

    const existingPopup = document.getElementById('landingEventPopup');
    if (existingPopup) {
        existingPopup.remove();
    }

    document.getElementById('calendarPopupBackdrop')?.classList.remove('open');
    unlockBodyScroll('calendarEventPopup');

    if (clickOutsideHandler) {
        document.removeEventListener('click', clickOutsideHandler);
        clickOutsideHandler = null;
    }

    window.removeEventListener('resize', handleDynamicReposition);
    window.removeEventListener('scroll', handleDynamicReposition, true);

    window.currentEventId = null;
    window.currentEventData = null;
    activeAnchorElement = null;
};

// Helper function to properly resize popups with window changes
let resizeTimeout = null;
function handleDynamicReposition() {
    const popup = document.getElementById('landingEventPopup');
    if (popup && activeAnchorElement) {
        if (resizeTimeout) cancelAnimationFrame(resizeTimeout);
        resizeTimeout = requestAnimationFrame(() => {
            positionPopup(popup, activeAnchorElement);
        });
    }
}

[
    'closeCreateEventModal',
    'closeCreateGameModal', 
    'closeCreateTeamModal',
    'closeCommunityModal',
    'closeAssignGMModal',
    'closeAvatarModal',
    'closeEditProfileModal',
    'closeChangePasswordModal',
    'closeDeleteConfirmModal',
    'closeAddTeamMembersModal',
    'closeCreateScheduleModal',
    'closeAddVodModal'
].forEach(function(name) {
    if (typeof window[name] !== 'function') {
        window[name] = function() {};
    }
});

// Initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('Landing calendar initializing...');
    isUserLoggedIn = typeof window.currentUserId !== 'undefined';
    console.log('User logged in:', isUserLoggedIn);

    initializeCalendar();
    setupNavigation();
    loadCalendarEvents();
});

function initializeCalendar() {
    console.log('Initializing calendar for:', currentDate);
    updateCalendarHeader();
    renderCalendar();
}

function setupNavigation() {
    const prevBtn = document.getElementById('prevMonth');
    const nextBtn = document.getElementById('nextMonth');

    if (prevBtn) {
        prevBtn.addEventListener('click', function(e) {
            e.preventDefault();
            currentDate.setMonth(currentDate.getMonth() - 1);
            updateCalendar();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function(e) {
            e.preventDefault();
            currentDate.setMonth(currentDate.getMonth() + 1);
            updateCalendar();
        });
    }
}

function updateCalendar() {
    console.log('Updating calendar to:', currentDate);
    updateCalendarHeader();
    renderCalendar();
    loadCalendarEvents();
}

function updateCalendarHeader() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

    const monthYear = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    const header = document.getElementById('currentMonthYear');

    if (header) {
        header.textContent = monthYear;
        console.log('Updated header to:', monthYear);
    } else {
        console.error('Could not find currentMonthYear element!');
    }
}

function renderCalendar() {
    closeOverflowPanel();
    const grid = document.getElementById('calendarGrid');
    if (!grid) {
        console.error('Calendar grid element not found!');
        return;
    }

    grid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
    const todayDate = today.getDate();

    console.log(`Rendering ${daysInMonth} days, starting on day ${firstDay}`);

    // Empty cells before month starts
    for (let i = 0; i < firstDay; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell empty';
        grid.appendChild(cell);
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        if (isCurrentMonth && day === todayDate) {
            cell.classList.add('today');
        }

        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        cell.appendChild(dayNumber);

        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'events-container';
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        eventsContainer.id = `events-${dateKey}`;
        cell.appendChild(eventsContainer);

        grid.appendChild(cell);
    }

    console.log('Calendar rendered successfully');
}

function loadCalendarEvents() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    console.log(`Loading events for ${year}-${month}`);

    fetch(`/api/calendar/events?year=${year}&month=${month}`)
        .then(response => {
            console.log('API response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Events loaded:', data);
            calendarEventsData = data;
            displayEvents();
            updateTodayEvents();
            revealCalendar();
        })
        .catch(error => {
            console.error('Error loading events:', error);
            calendarEventsData = {};
            displayEvents();
            updateTodayEvents();
            revealCalendar();
        });
}

function revealCalendar() {
    const calendarMain = document.querySelector('.calendar-container');
    const spinner = document.getElementById('calendarLoadingSpinner');
    if (spinner) spinner.style.display = 'none';
    if (calendarMain) calendarMain.style.visibility = 'visible';
}

function displayEvents() {
    document.querySelectorAll('.events-container').forEach(container => {
        container.innerHTML = '';
    });

    let eventCount = 0;

    Object.keys(calendarEventsData).forEach(dateKey => {
        const events = calendarEventsData[dateKey];
        const container = document.getElementById(`events-${dateKey}`);

        if (!container || !events || events.length === 0) return;

        eventCount += events.length;

        const displayEvents = events.slice(0, 3);
        const hasMore = events.length > 3;

        displayEvents.forEach(event => {
            const eventEl = createEventElement(event);
            container.appendChild(eventEl);
        });

        if (hasMore) {
            const overflow = document.createElement('div');
            overflow.className = 'event-overflow';
            overflow.textContent = `+${events.length - 3} more`;
            const hiddenEvents = events.slice(3);
            overflow.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCellOverflow(overflow, hiddenEvents);
            });
            container.appendChild(overflow);
        }
    });

    console.log(`Displayed ${eventCount} events`);
}

function createEventElement(event) {
    const eventEl = document.createElement('div');
    eventEl.className = `event ${event.event_type}${event.is_scheduled ? ' scheduled-event' : ''}`;
    eventEl.setAttribute('data-event-type', event.event_type);

    const title = document.createElement('div');
    title.className = 'event-title';
    title.textContent = event.title;
    eventEl.appendChild(title);

    if (event.time) {
        const time = document.createElement('div');
        time.className = 'event-time';
        time.textContent = event.time;
        eventEl.appendChild(time);
    }

    eventEl.addEventListener('click', function(e) {
        e.stopPropagation();
        openEventPopup(event.id, this);
    });

    return eventEl;
}

function updateTodayEvents() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    const todayEvents = calendarEventsData[dateKey] || [];
    const container = document.getElementById('todayEventsList');

    if (!container) {
        console.error('Today events list container not found');
        return;
    }

    if (todayEvents.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">No events today</p>';
        return;
    }

    container.innerHTML = '';
    todayEvents.forEach(event => {
        const item = document.createElement('div');
        item.className = 'today-event-item';

        const title = document.createElement('div');
        title.className = 'today-event-title';
        title.textContent = event.title;
        item.appendChild(title);

        if (event.time) {
            const time = document.createElement('div');
            time.className = 'today-event-time';
            time.innerHTML = `<i class="fas fa-clock"></i> ${event.time}`;
            item.appendChild(time);
        }

        const type = document.createElement('div');
        type.className = `today-event-type ${event.event_type}`;
        type.textContent = event.event_type;
        item.appendChild(type);

        container.appendChild(item);
    });
}

function displayEventDetails(event) {
    const modalBody = document.getElementById('eventModalBody');
    const modalTitle = document.getElementById('eventModalTitle');

    modalTitle.textContent = event.title;

    const eventType = (event.event_type || 'event').toLowerCase();

    // Match dashboard modal structure with event-detail-row
    let html = `<div class="event-card-details" data-event-type="${eventType}">`;

    // DATE
    html += `
        <div class="event-detail-row">
            <div class="event-detail-icon"><i class="fas fa-calendar"></i></div>
            <span class="event-detail-value">${formatEventDate(event.date)}</span>
        </div>
    `;

    // TIME (if not all-day)
    if (event.start_time && event.end_time) {
        html += `
            <div class="event-detail-row">
                <div class="event-detail-icon"><i class="fas fa-clock"></i></div>
                <span class="event-detail-value">${formatTime(event.start_time)} - ${formatTime(event.end_time)}</span>
            </div>
        `;
    } else {
        html += `
            <div class="event-detail-row">
                <div class="event-detail-icon"><i class="fas fa-clock"></i></div>
                <span class="event-detail-value">All day</span>
            </div>
        `;
    }

    // EVENT TYPE
    html += `
        <div class="event-detail-row">
            <div class="event-detail-icon"><i class="fas fa-tag"></i></div>
            <span class="event-detail-value">
                <span class="event-type-badge" data-type="${eventType}">${capitalizeFirst(event.event_type || 'Event')}</span>
            </span>
        </div>
    `;

    // GAME
    html += `
        <div class="event-detail-row">
            <div class="event-detail-icon"><i class="fas fa-gamepad"></i></div>
            <span class="event-detail-value">${event.game_name || 'General'}</span>
        </div>
    `;

    // LOCATION
    if (event.location) {
        html += `
            <div class="event-detail-row">
                <div class="event-detail-icon"><i class="fas fa-map-marker-alt"></i></div>
                <span class="event-detail-value">${event.location}</span>
            </div>
        `;
    }

    // DESCRIPTION
    if (event.description) {
        html += `
            <div class="event-detail-row">
                <div class="event-detail-icon"><i class="fas fa-info-circle"></i></div>
                <span class="event-detail-value">${event.description}</span>
            </div>
        `;
    }

    html += '</div>';

    // Event Reminders Section
    html += `<div class="event-notification-section">`;

    if (!isUserLoggedIn) {
        html += `
            <div class="notification-opt-in">
                <div class="notification-icon"><i class="fas fa-bell"></i></div>
                <div class="notification-text">
                    <div class="title">Event Reminders</div>
                    <div class="subtitle">Get notified about this event</div>
                </div>
                <a href="${window.location.origin}/login" class="notification-btn"><span>Login to Subscribe</span></a>
            </div>
        `;
    } else {
        html += `
            <div class="notification-opt-in">
                <div class="notification-icon"><i class="fas fa-bell"></i></div>
                <div class="notification-text">
                    <div class="title">Event Reminders</div>
                    <div class="subtitle">Get notified about this event</div>
                </div>
                <button class="notification-btn" id="notificationBtn" onclick="toggleEventSubscription()">
                    <span id="notificationBtnText">Subscribe</span>
                </button>
            </div>
        `;
    }

    html += '</div>';
    modalBody.innerHTML = html;

    if (isUserLoggedIn && event.id) {
        loadNotificationSection(event.id);
    }
}

function openEventPopup(event_id, clickedElement) {
    window.closeEventPopup();
    window.currentEventId = event_id;
    activeAnchorElement = clickedElement;

    const mobileView = isCalendarMobileView();

    const popup = document.createElement('div');
    popup.id = 'landingEventPopup';
    popup.className = mobileView ? 'popup-event-item mobile-sheet' : 'popup-event-item';
    // Sheet reveals immediately (CSS handles the slide-up transition);
    // the anchored popover stays hidden until positionPopup() places it
    popup.style.visibility = mobileView ? 'visible' : 'hidden';

    popup.innerHTML = `
        <div class="popup-arrow"></div>
    `;

    if (mobileView) {

        document.body.appendChild(popup);
        const backdrop = ensureCalendarPopupBackdrop();
        requestAnimationFrame(() => {
            popup.classList.add('sheet-open');
            backdrop.classList.add('open');
        });
        lockBodyScroll('calendarEventPopup');
    } else {
        const container = document.querySelector('.calendar-container') || document.body;
        container.appendChild(popup);

        // Positions relative to the clicked event item
        if (clickedElement) {
            positionPopup(popup, clickedElement, false);
        }

        clickOutsideHandler = function(e) {
            if (!popup.contains(e.target) && (!clickedElement || !clickedElement.contains(e.target))) {
                window.closeEventPopup();
            }
        };

        setTimeout(() => {
            if (window.currentEventId === event_id) {
                document.addEventListener('click', clickOutsideHandler);
                window.addEventListener('resize', handleDynamicReposition);
                window.addEventListener('scroll', handleDynamicReposition, true);
            }
        }, 50);
    }

    const controller = new AbortController();
    currentFetchController = controller;

    fetch(`/api/events/${event_id}`, { signal: controller.signal })
        .then(response => response.json())
        .then(data => {
            currentFetchController = null;
            if (data.error) {
                popup.innerHTML = `<div class="popup-error">Failed to load details</div>`;
            } else {
                window.currentEventData = data;
                displayEventPopupDetails(data, popup, mobileView ? null : clickedElement);
            }
        })
        .catch(error => {
            if (error.name === 'AbortError') return; // intentional cancel, not an error
            console.error('Error fetching event:', error);
            popup.innerHTML = `<div class="popup-error">Failed to load details</div>`;
        });
}

function displayEventPopupDetails(data, popup, clickedElement){
    if (!popup) return;

    const eventType = (data.event_type || 'misc').toLowerCase();
    popup.setAttribute('data-event-type', eventType);

    // Formats start and end time for events
    const startTimeFormatted = data.start_time ? formatTime(data.start_time) : null;
    const endTimeFormatted = data.end_time ? formatTime(data.end_time) : null;

    let timeRange = 'No time specified';

    if (data.start_time && data.end_time) {
        timeRange = `${formatTime(data.start_time)} - ${formatTime(data.end_time)}`;
    } else if (!data.start_time && data.end_time === "23:59") {
        timeRange = "All day";
    }

    popup.innerHTML = `
        <div class="popup-arrow"></div>
        <div class="event-popup-details popup-inner-wrapper" data-event-type="${data.event_type || 'misc'}">

            <h3 class="popup-title">${data.title}</h3>

            <div class="popup-grid-content">
                <div class="popup-row">
                    <span class="popup-icon"><i class="fas fa-calendar-alt"></i></span>
                    <span class="popup-text">
                        ${formatEventDate(data.start_date || data.date)}
                    </span>
                </div>

                <div class="popup-row">
                    <span class="popup-icon"><i class="fas fa-clock"></i></span>
                    <span class="popup-text">
                        ${timeRange || 'No time specified'}
                    </span>
                </div>

                <div class="popup-row">
                    <span class="popup-icon"><i class="fas fa-tag"></i></span>
                    <span class="popup-text" style="text-transform: capitalize;">${data.event_type}</span>
                </div>

                <div class="popup-games-box">
                    <span class="popup-icon"><i class="fas fa-gamepad"></i></span>
                    <span class="popup-text">${data.game_name || 'N/A'}</span>
                </div>

                <div class="popup-row full-width">
                    <span class="popup-icon"><i class="fas fa-map-marker-alt"></i></span>
                    <span class="popup-text">${data.location || 'Online'}</span>
                </div>
            </div>

            ${data.description ? `
                <div class="popup-description-box">
                    <span class="popup-icon"><i class="fas fa-align-left"></i></span>
                    <span class="popup-text">${data.description}</span>
                </div>
            ` : ''}
        </div>
    `;

    popup.innerHTML += `<div class="event-notification-section popup-footer-scale">`;

    if (!isUserLoggedIn) {
        popup.innerHTML += `
            <div class="notification-opt-in popup-footer-scale">
                <div class="notification-icon popup-footer-scale"><i class="fas fa-bell"></i></div>
                <div class="notification-text popup-footer-scale">
                    <div class="title">Event Reminders</div>
                    <div class="subtitle">Get notified about this event</div>
                </div>
                <a href="${window.location.origin}/login" class="notification-btn popup-footer-scale"><span>Login to Subscribe</span></a>
            </div>
        `;
    } else {
        popup.innerHTML += `
            <div class="notification-opt-in popup-footer-scale">
                <div class="notification-icon popup-footer-scale"><i class="fas fa-bell"></i></div>
                <div class="notification-text popup-footer-scale">
                    <div class="title">Event Reminders</div>
                    <div class="subtitle">Get notified about this event</div>
                </div>
                <button class="notification-btn popup-footer-scale" id="notificationBtn" onclick="toggleEventSubscription()">
                    <span id="notificationBtnText">Subscribe</span>
                </button>
            </div>
        `;
    }

    popup.innerHTML += '</div>';

    if (isUserLoggedIn && data.id) {
        loadNotificationSection(data.id);
    }

    if (isUserLoggedIn) {
        const footer = document.getElementById('popupActionFooter');
        if (footer) {
            footer.style.display = 'block';
            loadNotificationSection(data.id);
        }
    }

    // Adjust position after content loads in case width/height changed.
    // No-ops on mobile since clickedElement is passed as null there.
    if (clickedElement) {
        positionPopup(popup, clickedElement, true);
    }
}

function positionPopup(popup, anchorElement, reveal) {
    if (isCalendarMobileView()) return;

    const calendarContainer = document.querySelector('.calendar-container');
    if (!calendarContainer) return;

    // Get bounding boxes
    const containerRect = calendarContainer.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();
    const popupHeight = popup.offsetHeight || 150;
    const popupWidth = popup.offsetWidth || 440;

    const gap = 8;

    // Calculate anchor positioning coordinates relative to the calendar container
    const anchorLeftRelativeToContainer = anchorRect.left - containerRect.left;
    const anchorRightRelativeToContainer = anchorRect.right - containerRect.left;
    const anchorTopRelativeToContainer = anchorRect.top - containerRect.top;

    let left = anchorRightRelativeToContainer + gap;
    arrowDir = 'right';

    // If popup hits the right edge of the calendar grid container, flip to left side
    if (left + popupWidth > containerRect.width || (left + (popupWidth / 2) > containerRect.width)) {
        left = anchorLeftRelativeToContainer - popupWidth - gap;
        arrowDir = 'left';
    }

    if (left < gap) left = gap;

    // Center the popup vertically with the center of the clicked event
    const anchorCenterY = anchorTopRelativeToContainer + (anchorRect.height / 2);
    let top = anchorCenterY - (popupHeight / 2);

    if (top < gap) top = gap;

    popup.style.position = 'absolute';
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    // Update arrow direction and vertical alignment
    const arrow = popup.querySelector('.popup-arrow');
    if (arrow) {
        arrow.classList.remove('popup-arrow--right', 'popup-arrow--left');
        if (arrowDir === 'right') {
            arrow.classList.add('popup-arrow--left');
        } else {
            arrow.classList.add('popup-arrow--right');
        }

        // Vertically align arrow with anchor center
        const anchorMidY = anchorTopRelativeToContainer + (anchorRect.height / 2);
        const arrowOffsetInPopup = anchorMidY - top;
        const clampedOffset = Math.max(12, Math.min(arrowOffsetInPopup, popupHeight - 12));
        arrow.style.top = `${clampedOffset}px`;
    }

    if (reveal) popup.style.visibility = 'visible';
    return arrowDir;
}

function formatEventDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatTime(timeStr) {
    if (!timeStr) return '';

    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================
// CELL OVERFLOW EXPANSION
// ============================================

let _overflowPanel  = null;
let _overflowCell   = null;
let _overflowTrigger = null;

/**
 * Toggle the overflow expansion panel for a day cell.
 * Opens if closed, closes if the same cell is clicked again.
 */
function toggleCellOverflow(overflowEl, hiddenEvents) {
    const cell = overflowEl.closest('.calendar-cell');

    if (_overflowCell === cell) {
        closeOverflowPanel();
        return;
    }

    closeOverflowPanel();

    // Build the panel and populate with the hidden events
    const panel = document.createElement('div');
    panel.className = 'calendar-overflow-panel';

    const cellMirror = document.createElement('div');
    cellMirror.className = 'calendar-cell calendar-overflow-inner';
    hiddenEvents.forEach(event => cellMirror.appendChild(createEventElement(event)));
    panel.appendChild(cellMirror);

    document.body.appendChild(panel);
    overflowEl.style.display = 'none';

    positionOverflowPanel(panel, cell);
    cell.classList.add('calendar-cell--expanded');

    _overflowPanel   = panel;
    _overflowCell    = cell;
    _overflowTrigger = overflowEl;
}

/**
 * Position the panel flush below the cell, overlapping by 1px
 * to bridge the grid gap seamlessly.
 */
function positionOverflowPanel(panel, cell) {
    requestAnimationFrame(() => {
        const rect = cell.getBoundingClientRect();
        panel.style.top   = `${rect.bottom - 8}px`;
        panel.style.left  = `${rect.left}px`;
        panel.style.width = `${rect.width}px`;
    });
}

/**
 * Close and remove the active overflow panel.
 */
function closeOverflowPanel() {
    if (_overflowPanel && activeAnchorElement && _overflowPanel.contains(activeAnchorElement)) {
        window.closeEventPopup();
    }
    if (_overflowPanel)   { _overflowPanel.remove();   _overflowPanel   = null; }
    if (_overflowCell)    { _overflowCell.classList.remove('calendar-cell--expanded'); _overflowCell = null; }
    if (_overflowTrigger) { _overflowTrigger.style.display = ''; _overflowTrigger = null; }
}

// Close when clicking outside the panel
document.addEventListener('click', (e) => {
    if (!_overflowPanel) return;
    if (_overflowPanel.contains(e.target)) return;

    const popup = document.getElementById('landingEventPopup');
    if (popup && popup.contains(e.target)) return;

    closeOverflowPanel();
});

// Reposition panel on scroll/resize so it follows the cell
function handleOverflowReposition() {
    if (!_overflowPanel || !_overflowCell) return;
    positionOverflowPanel(_overflowPanel, _overflowCell);
}

window.addEventListener('scroll', handleOverflowReposition, { passive: true });
window.addEventListener('resize', handleOverflowReposition);

// ============================================
// EVENT SUBSCRIPTION FUNCTIONS
// ============================================

async function loadNotificationSection(eventId) {
    const btn = document.getElementById('notificationBtn');
    const btnText = document.getElementById('notificationBtnText');
    const panelBtn = document.getElementById('detailSubscribeBtn');
    const panelBtnText = document.getElementById('detailSubscribeBtnText');

    // At least one must exist to be worth fetching
    if (!btn && !panelBtn) return;

    try {
        const response = await fetch(`/api/event/${eventId}/subscription-status`);
        const data = await response.json();

        if (!data.notifications_enabled) {
            [btn, panelBtn].forEach(b => { if (b) { b.disabled = true; b.classList.add('disabled'); } });
            [btnText, panelBtnText].forEach(t => { if (t) t.textContent = 'Enable notifications in Profile'; });
            return;
        }

        const isSubscribed = data.subscribed;
        [btn, panelBtn].forEach(b => {
            if (!b) return;
            b.disabled = false;
            b.classList.remove('disabled');
            b.classList.toggle('subscribed', isSubscribed);
        });
        [btnText, panelBtnText].forEach(t => { if (t) t.textContent = isSubscribed ? 'Subscribed' : 'Subscribe'; });

    } catch (err) {
        console.error('Error fetching subscription status:', err);
        [btn, panelBtn].forEach(b => { if (b) b.disabled = true; });
        [btnText, panelBtnText].forEach(t => { if (t) t.textContent = 'Error'; });
    }
}

async function toggleEventSubscription() {
    const btn = document.getElementById('notificationBtn');
    const btnText = document.getElementById('notificationBtnText');
    const panelBtn = document.getElementById('detailSubscribeBtn');
    const panelBtnText = document.getElementById('detailSubscribeBtnText');

    if (!window.currentEventId && !EventState.currentEventId) return;
    const eventId = window.currentEventId || EventState.currentEventId;

    try {
        const response = await fetch(`/api/event/${eventId}/toggle-subscription`, { method: 'POST' });
        const data = await response.json();

        if (data.error) { alert(data.error); return; }

        const isSubscribed = data.status === 'subscribed';
        [btn, panelBtn].forEach(b => { if (b) b.classList.toggle('subscribed', isSubscribed); });
        [btnText, panelBtnText].forEach(t => { if (t) t.textContent = isSubscribed ? 'Subscribed' : 'Subscribe'; });

    } catch (err) {
        console.error('Error toggling subscription:', err);
        alert('Failed to toggle subscription.');
    }
}

function closeEventModal() { window.closeEventModal(); }
function closeEventPopup() { window.closeEventPopup(); }