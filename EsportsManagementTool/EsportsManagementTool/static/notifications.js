/**
 * notifications.js
 * ============================================================================
 * NOTIFICATION SETTINGS MANAGEMENT
 * ============================================================================
 * Handles all notification-related functionality:
 * - User notification preferences (enable/disable toggle)
 * - Event type filter buttons (multi-select, auto-save on click)
 * - Advance notice settings
 * - Event subscription management (subscribe/unsubscribe)
 * ============================================================================
 */

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    initializeNotificationSettings();
});

// ============================================
// NOTIFICATION SETTINGS
// ============================================

function initializeNotificationSettings() {
    const toggle = document.getElementById('enableNotifications');
    const options = document.getElementById('notificationOptions');
    const days = document.getElementById('adviceNoticeDays');
    const hours = document.getElementById('adviceNoticeHours');

    // Shows/hides the event-type buttons + advance notice,
    // then immediately saves the new enabled state.
    if (toggle && options) {
        toggle.addEventListener('change', function () {
            options.style.display = this.checked ? 'block' : 'none';
            autoSaveNotifications();
        });
    }

    // Event type buttons
    // Each click toggles .active and triggers an immediate save.
    document.querySelectorAll('[data-notif-type]').forEach(btn => {
        btn.addEventListener('click', function () {
            this.classList.toggle('active');
            autoSaveNotifications();
        });
    });

    // Waits 600 ms after the user stops typing before saving
    const debouncedSave = _debounce(autoSaveNotifications, 600);
    if (days)  days.addEventListener('input',  debouncedSave);
    if (hours) hours.addEventListener('input', debouncedSave);
}

// ============================================
// AUTO-SAVE
// ============================================

/**
 * Read current UI state, POST to the backend, and show the
 * Saved indicator on success.
 */
async function autoSaveNotifications() {
    const msgEl = document.getElementById('notifSavedMessage');

    const fd = new FormData();

    const toggle = document.getElementById('enableNotifications');
    if (toggle?.checked) fd.append('enable_notifications', 'on');

    // Collect whichever event-type buttons are active
    document.querySelectorAll('[data-notif-type]').forEach(btn => {
        if (btn.classList.contains('active')) {
            fd.append(btn.dataset.notifType, 'on');
        }
    });

    const days  = document.getElementById('adviceNoticeDays');
    const hours = document.getElementById('adviceNoticeHours');
    if (days)  fd.append('advance_notice_days',  days.value  || '0');
    if (hours) fd.append('advance_notice_hours', hours.value || '0');

    try {
        const response = await fetch('/eventnotificationsettings', {
            method:  'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body:    fd
        });
        const data = await response.json();

        if (response.ok && data.success) {
            _showSavedIndicator(msgEl);
        }
    } catch (err) {
        console.error('Failed to save notification settings:', err);
    }
}

// ============================================
// HELPERS
// ============================================

/**
 * Show the Saved indicator and auto-hide it after 2s.
 * Rapid saves safely reset the timer via clearTimeout.
 * Reuses the .visible/.preferred-tab-saved pattern.
 */
function _showSavedIndicator(el) {
    if (!el) return;
    clearTimeout(el._hideTimer);
    clearTimeout(el._displayTimer);

    el.style.display = 'block';
    void el.offsetHeight; // force reflow so opacity transition plays
    el.classList.add('visible');

    el._hideTimer = setTimeout(() => {
        el.classList.remove('visible');
        el._displayTimer = setTimeout(() => {
            el.style.display = 'none';
        }, 250);
    }, 2000);
}

/**
 * Lightweight debounce
 */
const _debounce = window.debounce || function (fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
};

// ============================================
// EVENT NOTIFICATION SECTION
// ============================================

/**
 * Show a message when the user has notifications disabled
 * (displayed inside the event detail modal)
 */
function showNotificationDisabledMessage() {
    const section = document.getElementById('eventNotificationSection');
    if (!section) return;

    section.innerHTML = `
        <div class="notification-disabled">
            <div class="notification-icon"><i class="fas fa-bell-slash"></i></div>
            <h4>Notifications Disabled</h4>
            <p>You've turned off event notifications in your settings.</p>
            <button class="notification-btn settings" onclick="window.location.href='/eventnotificationsettings'">
                Go to Settings
            </button>
        </div>
    `;
}

/**
 * Subscribe to notifications for a specific event
 * @param {number} eventId
 */
async function subscribeToEvent(eventId) {
    try {
        const response = await fetch(`/api/subscribe-event/${eventId}`, { method: 'POST' });
        const data = await response.json();
        alert(data.message || 'Subscribed successfully!');
        await loadNotificationSection(eventId);
    } catch (err) {
        console.error('Error subscribing to event:', err);
        alert('Failed to subscribe. Please try again.');
    }
}

/**
 * Unsubscribe from notifications for a specific event
 * @param {number} eventId
 */
async function unsubscribeFromEvent(eventId) {
    try {
        const response = await fetch(`/api/unsubscribe-event/${eventId}`, { method: 'POST' });
        const data = await response.json();
        alert(data.message || 'Unsubscribed successfully!');
        await loadNotificationSection(eventId);
    } catch (err) {
        console.error('Error unsubscribing from event:', err);
        alert('Failed to unsubscribe. Please try again.');
    }
}

// ============================================
// EXPORTS
// ============================================

window.autoSaveNotifications = autoSaveNotifications;
window.showNotificationDisabledMessage = showNotificationDisabledMessage;
window.subscribeToEvent = subscribeToEvent;
window.unsubscribeFromEvent = unsubscribeFromEvent;