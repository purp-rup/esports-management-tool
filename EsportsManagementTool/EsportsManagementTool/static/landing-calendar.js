/**
 * landing-calendar.js
 * Landing Page Calendar System with improved error handling
 */

// Global variables - use unique names to avoid conflicts with dashboard scripts
let currentDate = new Date();
let landingEventsData = {};  // Renamed from landingEventsData to avoid conflict with events.js
let isUserLoggedIn = false;

window.currentEventId = null;
window.currentEventData = null;

// Modal close functions (must be defined before modals.js loads)
window.closeEventModal = function() {
    const modal = document.getElementById('eventDetailsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    window.currentEventId = null;
    window.currentEventData = null;
};

window.closeDayModal = function() {
    const modal = document.getElementById('dayEventsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

// Stub functions for dashboard-only modals
window.closeCreateEventModal = function() {};
window.closeCreateGameModal = function() {};
window.closeCreateTeamModal = function() {};
window.closeGameDetailsModal = function() {};
window.closeAssignGMModal = function() {};
window.closeAvatarModal = function() {};
window.closeEditProfileModal = function() {};
window.closeChangePasswordModal = function() {};
window.closeDeleteConfirmModal = function() {};
window.closeAddTeamMembersModal = function() {};
window.closeCreateScheduledEventModal = function() {};
window.closeAddVodModal = function() {};

function closeEventModal() { window.closeEventModal(); }
function closeDayModal() { window.closeDayModal(); }

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

        cell.addEventListener('click', function() {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                'July', 'August', 'September', 'October', 'November', 'December'];
            const dateDisplay = `${monthNames[month]} ${day}, ${year}`;
            openDayModal(dateKey, dateDisplay);
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
            landingEventsData = data;
            displayEvents();
            updateTodayEvents();
        })
        .catch(error => {
            console.error('Error loading events:', error);
            landingEventsData = {};
            displayEvents();
            updateTodayEvents();
        });
}

function displayEvents() {
    document.querySelectorAll('.events-container').forEach(container => {
        container.innerHTML = '';
    });

    let eventCount = 0;

    Object.keys(landingEventsData).forEach(dateKey => {
        const events = landingEventsData[dateKey];
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
            container.appendChild(overflow);
        }
    });

    console.log(`Displayed ${eventCount} events`);
}

function createEventElement(event) {
    const eventEl = document.createElement('div');
    eventEl.className = `event ${event.event_type}`;
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
        openEventModal(event.id);
    });

    return eventEl;
}

function updateTodayEvents() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    const todayEvents = landingEventsData[dateKey] || [];
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

        if (event.time) {
            const time = document.createElement('div');
            time.className = 'today-event-time';
            time.innerHTML = `<i class="fas fa-clock"></i> ${event.time}`;
            item.appendChild(time);
        }

        const title = document.createElement('div');
        title.className = 'today-event-title';
        title.textContent = event.title;
        item.appendChild(title);

        const type = document.createElement('div');
        type.className = `today-event-type ${event.event_type}`;
        type.textContent = event.event_type;
        item.appendChild(type);

        item.addEventListener('click', function() {
            openEventModal(event.id);
        });

        container.appendChild(item);
    });
}

function openEventModal(eventId) {
    const modal = document.getElementById('eventDetailsModal');
    const modalBody = document.getElementById('eventModalBody');

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    window.currentEventId = eventId;

    modalBody.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading event details...</p>
        </div>
    `;

    fetch(`/api/events/${eventId}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                modalBody.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                        <i class="fas fa-exclamation-circle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                        <p>${data.error || 'Failed to load event details'}</p>
                    </div>
                `;
            } else {
                window.currentEventData = data;
                displayEventDetails(data);
            }
        })
        .catch(error => {
            console.error('Error fetching event:', error);
            modalBody.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                    <p>Failed to load event details</p>
                </div>
            `;
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
            <span class="event-detail-label">Date:</span>
            <span class="event-detail-value">${formatEventDate(event.date)}</span>
        </div>
    `;

    // TIME (if not all-day)
    if (event.start_time && event.end_time) {
        html += `
            <div class="event-detail-row">
                <div class="event-detail-icon"><i class="fas fa-clock"></i></div>
                <span class="event-detail-label">Time:</span>
                <span class="event-detail-value">${formatTime(event.start_time)} - ${formatTime(event.end_time)}</span>
            </div>
        `;
    }

    // EVENT TYPE
    html += `
        <div class="event-detail-row">
            <div class="event-detail-icon"><i class="fas fa-tag"></i></div>
            <span class="event-detail-label">Type:</span>
            <span class="event-detail-value">
                <span class="event-type-badge" data-type="${eventType}">${capitalizeFirst(event.event_type || 'Event')}</span>
            </span>
        </div>
    `;

    // GAME
    html += `
        <div class="event-detail-row">
            <div class="event-detail-icon"><i class="fas fa-gamepad"></i></div>
            <span class="event-detail-label">Game:</span>
            <span class="event-detail-value">${event.game_name || 'General'}</span>
        </div>
    `;

    // LOCATION
    if (event.location) {
        html += `
            <div class="event-detail-row">
                <div class="event-detail-icon"><i class="fas fa-map-marker-alt"></i></div>
                <span class="event-detail-label">Location:</span>
                <span class="event-detail-value">${event.location}</span>
            </div>
        `;
    }

    // DESCRIPTION
    if (event.description) {
        html += `
            <div class="event-detail-row">
                <div class="event-detail-icon"><i class="fas fa-info-circle"></i></div>
                <span class="event-detail-label">Description:</span>
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

function openDayModal(dateKey, dateDisplay) {
    const modal = document.getElementById('dayEventsModal');
    const title = document.getElementById('dayModalTitle');
    const body = document.getElementById('dayModalBody');

    title.textContent = `Events on ${dateDisplay}`;
    const events = landingEventsData[dateKey] || [];

    if (events.length === 0) {
        body.innerHTML = '<p style="color: var(--text-secondary);">No events on this day</p>';
    } else {
        let html = '';
        events.forEach(event => {
            html += `
                <div class="modal-event-item" onclick="closeDayModal(); openEventModal(${event.id});">
                    ${event.time ? `<div class="modal-event-time">${event.time}</div>` : ''}
                    <div class="modal-event-title">${event.title}</div>
                    ${event.description ? `<div class="modal-event-description">${event.description}</div>` : ''}
                    <div class="modal-event-meta">
                        <span><i class="fas fa-tag"></i> ${event.event_type}</span>
                        ${event.game_name ? `<span><i class="fas fa-gamepad"></i> ${event.game_name}</span>` : ''}
                    </div>
                </div>
            `;
        });
        body.innerHTML = html;
    }

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
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
// EVENT SUBSCRIPTION FUNCTIONS
// ============================================

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

async function toggleEventSubscription() {
    const btn = document.getElementById('notificationBtn');
    const btnText = document.getElementById('notificationBtnText');

    if (!window.currentEventId) return;

    try {
        const response = await fetch(`/api/event/${window.currentEventId}/toggle-subscription`, {
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