/**
 * Handles logic & rendering for both calendars.
 */

// Global variables - use unique names to avoid conflicts with dashboard scripts
let currentDate = new Date();
let calendarEventsData = {};
let calendarLabReservationsData = {};
let isUserLoggedIn = false;
let clickOutsideHandler = null; // Listens for clicks outside popups
let activeAnchorElement = null;
let currentFetchController = null; // AbortController for the in-flight event fetch

window.currentEventId = null;
window.currentEventData = null;

// Mobile day-sheet state
let _activeDayKey      = null;
let _activeDayEvents   = null;
let _activeDayType     = 'events'; // 'events' or 'labs' - which list _activeDayEvents holds
let _showBackButton    = false;
let _backButtonDayKey  = null;
let _backButtonDayEvents = null;
let _backButtonDayType = 'events';

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
    updateCalendarHeader();

    if (!isCalendarMobileView()) {
        closeDaySheet();
    }

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
    setupCalendarViewTabs();
    loadCalendarEvents();
});

// Events / Lab Reservations view tabs (dashboard calendar only).
// Tracks which calendar view is currently displayed
let currentCalendarView = 'events';

// Builds the tabs that appear in the calendar navigation bar.
function setupCalendarViewTabs() {
    const eventsViewTab = document.querySelector('.calendar-view-tabs .tab-button[data-view="events"]');
    if (eventsViewTab) {
        eventsViewTab.classList.add('active');
    }

    const legendInfoWrapper = document.getElementById('calendarLegendInfoWrapper');
    if (legendInfoWrapper) {
        initInfoIcon(legendInfoWrapper, 'Legend');
    }
    updateCalendarLegendTooltip();
}

// Switches which button is highlighted based on which tab was last selected.
function switchCalendarView(view, btnElement) {
    if (view === currentCalendarView) {
        return;
    }

    document.querySelectorAll('.calendar-view-tabs .tab-button').forEach(function(btn) {
        btn.classList.remove('active');
    });
    btnElement.classList.add('active');

    currentCalendarView = view;
    updateCalendarLegendTooltip();

    const eventLegendCard = document.getElementById('eventLegendCard');
    const labLegendCard = document.getElementById('labLegendCard');
    const todayEventsCard = document.getElementById('todayEventsCard');
    const todayReservationsCard = document.getElementById('todayReservationsCard');

    if (view === 'labs') {
        setElementDisplay(eventLegendCard, 'none');
        setElementDisplay(labLegendCard, 'block');
        setElementDisplay(todayEventsCard, 'none');
        setElementDisplay(todayReservationsCard, 'block');
        loadCalendarLabReservations();
        loadMyLabReservations();
    } else {
        setElementDisplay(labLegendCard, 'none');
        setElementDisplay(eventLegendCard, 'block');
        setElementDisplay(todayReservationsCard, 'none');
        setElementDisplay(todayEventsCard, 'block');
        loadCalendarEvents();
    }
}

// Pulls all lab reservations to display as pills on the reservation calendar
function loadCalendarLabReservations() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    console.log(`Loading lab reservations for ${year}-${month}`);

    fetch(`/api/calendar/labs?year=${year}&month=${month}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Lab reservations loaded:', data);
            calendarLabReservationsData = data;
            displayLabReservations();
            updateTodayLabReservations();
            revealCalendar();
        })
        .catch(error => {
            console.error('Error loading lab reservations:', error);
            calendarLabReservationsData = {};
            displayLabReservations();
            updateTodayLabReservations();
            revealCalendar();
        });
}

// Maps a lab_choice display name to the short key used for CSS/data attributes
function getLabChoiceKey(labChoice) {
    const map = {
        'Blue Lab': 'blue',
        'Gold Lab': 'gold',
        'Center Office': 'center'
    };
    return map[labChoice] || 'center';
}

function displayLabReservations() {
    document.querySelectorAll('.events-container').forEach(container => {
        container.innerHTML = '';
    });
    document.querySelectorAll('.mobile-event-dots').forEach(container => {
        container.innerHTML = '';
    });

    let labCount = 0;

    Object.keys(calendarLabReservationsData).forEach(dateKey => {
        const labs = calendarLabReservationsData[dateKey];
        const container = document.getElementById(`events-${dateKey}`);

        if (!container || !labs || labs.length === 0) return;

        labCount += labs.length;

        const displayLabs = labs.slice(0, 3);
        const hasMore = labs.length > 3;

        displayLabs.forEach(lab => {
            const labEl = createLabReservationElement(lab);
            container.appendChild(labEl);
        });

        if (hasMore) {
            const overflow = document.createElement('div');
            overflow.className = 'event-overflow';
            overflow.textContent = `+${labs.length - 3} more`;
            const hiddenLabs = labs.slice(3);
            overflow.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCellOverflow(overflow, hiddenLabs, createLabReservationElement);
            });
            container.appendChild(overflow);
        }
    });

    Object.keys(calendarLabReservationsData).forEach(dateKey => {
        renderMobileLabDots(dateKey, calendarLabReservationsData[dateKey] || []);
    });

    console.log(`Displayed ${labCount} lab reservations`);
}

// Builds the reservation pill
function createLabReservationElement(lab) {
    const labEl = document.createElement('div');
    labEl.className = 'event lab-reservation';
    labEl.setAttribute('data-lab-choice', getLabChoiceKey(lab.lab_choice));
    labEl.setAttribute('data-priority', lab.priority || '');

    const title = document.createElement('div');
    title.className = 'event-title';
    title.textContent = lab.game_name ? `${lab.lab_choice} · ${lab.game_name}` : lab.lab_choice;
    labEl.appendChild(title);

    if (lab.time) {
        const time = document.createElement('div');
        time.className = 'event-time';
        time.textContent = lab.time;
        labEl.appendChild(time);
    }

    labEl.addEventListener('click', function(e) {
        e.stopPropagation();
        openLabReservationPopup(lab, this);
    });

    return labEl;
}

function initializeCalendar() {
    console.log('Initializing calendar for:', currentDate);
    updateCalendarHeader();
    renderCalendar();
}

// Builds the calendar navigation bar with the month, year, info tooltip, and navigation tabs.
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

// Adjusts which calendar is shown based on which tab is selected.
function updateCalendar() {
    updateCalendarHeader();
    renderCalendar();
    if (currentCalendarView === 'labs') {
        loadCalendarLabReservations();
    } else {
        loadCalendarEvents();
    }
}

/** Keeps the calendar legend info-icon's tooltip content in sync with whichever view is active.
 *  Both the desktop hover tooltip and the mobile info sheet read from this same element. */
function updateCalendarLegendTooltip() {
    const tooltip = document.getElementById('calendarLegendInfoTooltip');
    if (!tooltip) return;

    const sourceCard = currentCalendarView === 'labs'
        ? document.querySelector('.lab-legend-types')
        : document.getElementById('eventLegendCard');

    tooltip.innerHTML = sourceCard ? sourceCard.innerHTML : '';
}

function updateCalendarHeader() {
    const monthNames = ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'];
    const monthAbbrevs = ['Jan','Feb','Mar','Apr','May','Jun',
                          'Jul','Aug','Sep','Oct','Nov','Dec'];

    const header = document.getElementById('currentMonthYear');
    if (!header) return;

    if (isCalendarMobileView()) {
        const yr = String(currentDate.getFullYear());
        header.textContent = `${monthAbbrevs[currentDate.getMonth()]} ${yr}`;
    } else {
        header.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
}

function renderCalendar() {
    closeOverflowPanel();
    closeDaySheet();
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

        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'events-container';
        eventsContainer.id = `events-${dateKey}`;
        cell.appendChild(eventsContainer);

        // Display dots for event types
        const mobileDots = document.createElement('div');
        mobileDots.className = 'mobile-event-dots';
        mobileDots.id = `dots-${dateKey}`;
        cell.appendChild(mobileDots);

        // Open mobile day sheet
        cell.addEventListener('click', function(e) {
            if (!isCalendarMobileView()) return;
            if (e.target.closest('.calendar-overflow-panel')) return;
            if (currentCalendarView === 'labs') {
                openDaySheet(dateKey, calendarLabReservationsData[dateKey] || [], 'labs');
            } else {
                openDaySheet(dateKey, calendarEventsData[dateKey] || [], 'events');
            }
        });

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
    document.querySelectorAll('.mobile-event-dots').forEach(container => {
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

    // Always populate dots, visible on mobile, hidden on desktop
    Object.keys(calendarEventsData).forEach(dateKey => {
        renderMobileDots(dateKey, calendarEventsData[dateKey] || []);
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

// Updates lab reservations to display the current day's reservations
function updateTodayLabReservations() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    const todayLabs = calendarLabReservationsData[dateKey] || [];
    const container = document.getElementById('todayReservationsList');

    if (!container) {
        console.error('Today reservations list container not found');
        return;
    }

    if (todayLabs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">No reservations today</p>';
        return;
    }

    container.innerHTML = '';
    todayLabs.forEach(lab => {
        const item = document.createElement('div');
        item.className = 'today-event-item';

        const title = document.createElement('div');
        title.className = 'today-event-title';
        title.textContent = lab.lab_choice;
        item.appendChild(title);

        if (lab.time) {
            const time = document.createElement('div');
            time.className = 'today-event-time';
            time.innerHTML = `<i class="fas fa-clock"></i> ${lab.time}`;
            item.appendChild(time);
        }

        if (lab.lab_status) {
            const status = document.createElement('div');
            status.className = 'today-reservation-status';
            status.innerHTML = `<i class="fas fa-desktop"></i> ${lab.lab_status}`;
            item.appendChild(status);
        }

        const priority = document.createElement('div');
        priority.className = `today-event-type priority-${lab.priority}`;
        priority.textContent = lab.priority;
        item.appendChild(priority);

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
            <span class="event-detail-value">${formatCalendarGameName(event.game_name, event.team_name, event.is_scheduled) || 'General'}</span>
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

// Helper function designed to format game name correctly for team-only scheduled events
function formatCalendarGameName(gameName, teamName, isScheduled) {
    if (isScheduled && teamName) return teamName;
    return gameName || null;
}

function openLabReservationPopup(lab, clickedElement) {
    window.closeEventPopup();
    const labPopupId = `lab-${lab.id}`;
    window.currentEventId = labPopupId;
    activeAnchorElement = clickedElement;

    const mobileView = isCalendarMobileView();

    const popup = document.createElement('div');
    popup.id = 'landingEventPopup';
    popup.className = mobileView ? 'popup-event-item mobile-sheet' : 'popup-event-item';
    popup.style.visibility = mobileView ? 'visible' : 'hidden';
    popup.innerHTML = `<div class="popup-arrow"></div>`;

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

        if (clickedElement) {
            positionPopup(popup, clickedElement, false);
        }

        clickOutsideHandler = function(e) {
            if (!popup.contains(e.target) && (!clickedElement || !clickedElement.contains(e.target))) {
                window.closeEventPopup();
            }
        };

        setTimeout(() => {
            if (window.currentEventId === labPopupId) {
                document.addEventListener('click', clickOutsideHandler);
                window.addEventListener('resize', handleDynamicReposition);
                window.addEventListener('scroll', handleDynamicReposition, true);
            }
        }, 50);
    }

    // No fetch needed - the month's cached lab data already has every field we show
    displayLabReservationPopupDetails(lab, popup, mobileView ? null : clickedElement);
}

function displayLabReservationPopupDetails(lab, popup, clickedElement) {
    if (!popup) return;

    const labChoiceKey = getLabChoiceKey(lab.lab_choice);
    popup.setAttribute('data-lab-choice', labChoiceKey);

    popup.innerHTML = `
        <div class="popup-arrow"></div>
        <div class="lab-popup-details popup-inner-wrapper" data-lab-choice="${labChoiceKey}">

            <h3 class="popup-title">${lab.lab_choice}${lab.game_name ? ` · ${lab.game_name}` : ''}</h3>

            <div class="popup-grid-content">
                <div class="popup-row">
                    <span class="popup-icon"><i class="fas fa-desktop"></i></span>
                    <span class="popup-text">${lab.lab_choice}</span>
                </div>

                <div class="popup-row">
                    <span class="popup-icon"><i class="fas fa-clock"></i></span>
                    <span class="popup-text">${lab.time || 'No time specified'}</span>
                </div>

                <div class="popup-row">
                    <span class="popup-icon"><i class="fas fa-flag"></i></span>
                    <span class="popup-text" style="text-transform: capitalize;">${lab.priority || 'N/A'}</span>
                </div>

                <div class="popup-games-box">
                    <span class="popup-icon"><i class="fas fa-gamepad"></i></span>
                    <span class="popup-text">${lab.game_name || 'N/A'}</span>
                </div>

                <div class="popup-row full-width">
                    <span class="popup-icon"><i class="fas fa-th-large"></i></span>
                    <span class="popup-text">${lab.lab_status || 'N/A'}</span>
                </div>
            </div>

            ${lab.description ? `
                <div class="popup-description-box">
                    <span class="popup-icon"><i class="fas fa-align-left"></i></span>
                    <span class="popup-text">${lab.description}</span>
                </div>
            ` : ''}
        </div>
    `;

    // If opened from the day sheet on mobile, add a back button
    if (_showBackButton && isCalendarMobileView()) {
        _showBackButton = false;
        const backBtn = document.createElement('button');
        backBtn.className = 'calendar-popup-back-btn';
        backBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        backBtn.addEventListener('click', _handleDaySheetBackButtonClick);
        const inner = popup.querySelector('.lab-popup-details');
        if (inner) inner.insertBefore(backBtn, inner.firstChild);
    }

    if (clickedElement) {
        positionPopup(popup, clickedElement, true);
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

    popup.innerHTML = mobileView
        ? `<div class="calendar-popup-loading"><i class="fas fa-spinner fa-spin"></i></div>`
        : `<div class="popup-arrow"></div>`;

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
                    <span class="popup-text">${formatCalendarGameName(data.game_name, data.team_name, data.is_scheduled) || 'N/A'}</span>
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

    // If opened from the day sheet on mobile, add a back button
    if (_showBackButton && isCalendarMobileView()) {
        _showBackButton = false;
        const backBtn = document.createElement('button');
        backBtn.className = 'calendar-popup-back-btn';
        backBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        backBtn.addEventListener('click', _handleDaySheetBackButtonClick);
        const inner = popup.querySelector('.event-popup-details');
        if (inner) inner.insertBefore(backBtn, inner.firstChild);
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
function toggleCellOverflow(overflowEl, hiddenItems, createElementFn = createEventElement) {
    const cell = overflowEl.closest('.calendar-cell');

    if (_overflowCell === cell) {
        closeOverflowPanel();
        return;
    }

    closeOverflowPanel();

    // Build the panel and populate with the hidden events
    const panel = document.createElement('div');
    panel.className = 'calendar-overflow-panel';

    /* If the day being expanded is "today", extend its blue highlight
     * border down into the panel so the highlight reads as one shape.
     */
    if (cell.classList.contains('today')) {
        panel.classList.add('calendar-overflow-panel--today');
    }

    const cellMirror = document.createElement('div');
    cellMirror.className = 'calendar-cell calendar-overflow-inner';
    hiddenItems.forEach(item => cellMirror.appendChild(createElementFn(item)));
    panel.appendChild(cellMirror);

    document.body.appendChild(panel);
    overflowEl.style.display = 'none';

    cell.classList.add('calendar-cell--expanded');
    positionOverflowPanel(panel, cell);

    _overflowPanel   = panel;
    _overflowCell    = cell;
    _overflowTrigger = overflowEl;
}

/**
 * Position the panel flush below the cell, overlapping by 1px
 * to bridge the grid gap seamlessly.
 */
function positionOverflowPanel(panel, cell) {
    const rect = cell.getBoundingClientRect();

    panel.style.top   = `${rect.bottom + window.scrollY - 8}px`;
    panel.style.left  = `${rect.left + window.scrollX}px`;
    panel.style.width = `${rect.width}px`;
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

window.addEventListener('resize', handleOverflowReposition);

// ============================================
// MOBILE DAY SHEET
// ============================================

/** Render one colored dot per unique lab choice for a day (mobile view) */
function renderMobileLabDots(dateKey, labs) {
    const container = document.getElementById(`dots-${dateKey}`);
    if (!container) return;
    container.innerHTML = '';

    const seen = new Set();
    labs.forEach(l => { if (l.lab_choice) seen.add(getLabChoiceKey(l.lab_choice)); });

    ['blue', 'gold', 'center'].forEach(key => {
        if (seen.has(key)) {
            const dot = document.createElement('div');
            dot.className = `mobile-event-dot mobile-lab-dot--${key}`;
            container.appendChild(dot);
        }
    });
}

/** Render one colored dot per unique event type for a day */
function renderMobileDots(dateKey, events) {
    const container = document.getElementById(`dots-${dateKey}`);
    if (!container) return;
    container.innerHTML = '';

    const seen = new Set();
    events.forEach(e => { if (e.event_type) seen.add(e.event_type.toLowerCase()); });

    ['tournament', 'match', 'practice', 'event', 'misc'].forEach(type => {
        if (seen.has(type)) {
            const dot = document.createElement('div');
            dot.className = `mobile-event-dot mobile-event-dot--${type}`;
            container.appendChild(dot);
        }
    });
}

/** Create the day-sheet and backdrop in the DOM once */
function _ensureDaySheet() {
    if (document.getElementById('calendarDaySheet')) return;

    const sheet = document.createElement('div');
    sheet.id = 'calendarDaySheet';
    sheet.className = 'mobile-sheet';
    document.body.appendChild(sheet);

    const backdrop = document.createElement('div');
    backdrop.id = 'calendarDaySheetBackdrop';
    backdrop.className = 'sheet-backdrop';
    backdrop.addEventListener('click', closeDaySheet);
    document.body.appendChild(backdrop);
}

/** Open the bottom sheet listing all events for a given day */
function openDaySheet(dateKey, items, type = 'events') {
    _ensureDaySheet();

    _activeDayKey    = dateKey;
    _activeDayEvents = items;
    _activeDayType   = type;

    const sheet    = document.getElementById('calendarDaySheet');
    const backdrop = document.getElementById('calendarDaySheetBackdrop');

    const [y, m, d] = dateKey.split('-').map(Number);
    const date  = new Date(y, m - 1, d);
    const title = date.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
    });

    let html = `<h3 class="calendar-day-sheet-title">${title}</h3>`;

    if (!items || items.length === 0) {
        html += `<p class="calendar-day-sheet-empty">No ${type === 'labs' ? 'reservations' : 'events'} this day.</p>`;
    } else if (type === 'labs') {
        html += `<div class="calendar-day-sheet-list">`;
        items.forEach(lab => {
            const priorityKey = (lab.priority || '').toLowerCase();
            const titleText   = lab.game_name ? `${lab.lab_choice} · ${lab.game_name}` : lab.lab_choice;
            html += `
                <div class="calendar-day-sheet-event" data-lab-id="${lab.id}">
                    <div class="calendar-day-sheet-event-meta">
                        <span class="calendar-day-sheet-event-time">${lab.time || 'No time specified'}</span>
                        <span class="today-event-type priority-${priorityKey}">${capitalizeFirst(lab.priority || '')}</span>
                    </div>
                    <div class="calendar-day-sheet-event-title">${titleText}</div>
                </div>
            `;
        });
        html += `</div>`;
    } else {
        html += `<div class="calendar-day-sheet-list">`;
        items.forEach(event => {
            const timeStr   = event.start_time ? formatTime(event.start_time) : 'All day';
            const typeLabel = capitalizeFirst(event.event_type || 'event');
            html += `
                <div class="calendar-day-sheet-event" data-event-id="${event.id}">
                    <div class="calendar-day-sheet-event-meta">
                        <span class="calendar-day-sheet-event-time">${timeStr}</span>
                        <span class="today-event-type ${event.event_type || 'event'}">${typeLabel}</span>
                    </div>
                    <div class="calendar-day-sheet-event-title">${event.title}</div>
                </div>
            `;
        });
        html += `</div>`;
    }

    sheet.innerHTML = html;

    sheet.querySelectorAll('.calendar-day-sheet-event').forEach(item => {
        item.addEventListener('click', () => {
            if (type === 'labs') {
                openLabReservationFromDaySheet(parseInt(item.dataset.labId, 10));
            } else {
                openEventFromDaySheet(parseInt(item.dataset.eventId, 10));
            }
        });
    });

    sheet.classList.add('sheet-open');
    backdrop.classList.add('open');
    lockBodyScroll('calendarDaySheet');
}

/** Close the day sheet */
function closeDaySheet() {
    const sheet    = document.getElementById('calendarDaySheet');
    const backdrop = document.getElementById('calendarDaySheetBackdrop');
    sheet?.classList.remove('sheet-open');
    backdrop?.classList.remove('open');
    unlockBodyScroll('calendarDaySheet');
    _activeDayKey    = null;
    _activeDayEvents = null;
    _activeDayType   = 'events';
}

/**
 * Open an event's detail from the day sheet.
 * Closes the sheet, opens the existing mobile popup, and sets a flag
 * so displayEventPopupDetails injects a back button.
 */
function openEventFromDaySheet(eventId) {
    _backButtonDayKey    = _activeDayKey;
    _backButtonDayEvents = _activeDayEvents;
    _backButtonDayType   = _activeDayType;
    _showBackButton      = true;

    closeDaySheet();
    openEventPopup(eventId, null);
}

/**
 * Open a lab reservation's detail from the day sheet.
 * Mirrors openEventFromDaySheet, but looks the reservation up from the
 * already-loaded day list instead of fetching it (same as clicking a pill).
 */
function openLabReservationFromDaySheet(labId) {
    _backButtonDayKey    = _activeDayKey;
    _backButtonDayEvents = _activeDayEvents;
    _backButtonDayType   = _activeDayType;
    _showBackButton      = true;

    const lab = (_activeDayEvents || []).find(l => l.id === labId);
    closeDaySheet();
    if (lab) {
        openLabReservationPopup(lab, null);
    }
}

/** Shared handler for the popup's back button: returns to the day sheet it was opened from */
function _handleDaySheetBackButtonClick() {
    const dayKey    = _backButtonDayKey;
    const dayEvents = _backButtonDayEvents;
    const dayType   = _backButtonDayType;
    _backButtonDayKey    = null;
    _backButtonDayEvents = null;
    _backButtonDayType   = 'events';
    window.closeEventPopup();
    openDaySheet(dayKey, dayEvents, dayType);
}

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