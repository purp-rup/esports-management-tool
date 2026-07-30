/**
 * ============================================================================
 * NOTIFICATION SETTINGS MANAGEMENT
 * ============================================================================
 * Handles all internal and external notification-related functionality:
 * (EXTERNAL)
 * - User notification preferences (enable/disable toggle)
 * - Event type filter buttons (multi-select, auto-save on click)
 * - Advance notice settings
 * - Event subscription management (subscribe/unsubscribe)
 *
 * (INTERNAL)
 * - Notification card message formatting and processing
 * - Notification styles (success, error, info)
 * - Notification queue system for multiple notifications at once
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

// Lightweight debounce
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

// Subscribe to notifications for a specific event
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

// Unsubscribe from notifications for a specific event
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
// NOTIFICATION QUEUE SYSTEM
// ============================================

// Queue state for managing multiple notifications
const NotificationQueue = {
    /** Array of active notifications */
    active: [],

    /** Vertical offset between stacked notifications (in pixels) */
    stackOffset: 80,

    /** Maximum notifications to show at once */
    maxVisible: 4,

    // Add notification to queue and position it
    add(notification) {
        this.active.push(notification);
        this.repositionAll();
    },

    // Remove notification from queue
    remove(notification) {
        const index = this.active.indexOf(notification);
        if (index > -1) {
            this.active.splice(index, 1);
            this.repositionAll();
        }
    },

    // Reposition all active notifications with stacking
    repositionAll() {
        let topPosition = 20;
        this.active.forEach((notif) => {
            notif.style.top = `${topPosition}px`;
            topPosition += notif.offsetHeight + 16;
        });
    }
};

// Show a notification card when called
function showNotificationCard(message, type = 'success', duration = 3000) {
    // Create notification element
    const notification = document.createElement('div');

    // Set colors based on type
    let bgColor, borderColor;
    let icon;
    if (type === 'success') {
        bgColor = '#10b981';
        borderColor = '#059669';
        icon = '<i class="fas fa-check-circle"></i>';
    } else if (type === 'error') {
        bgColor = '#ef4444';
        borderColor = '#dc2626';
        icon = '<i class="fas fa-exclamation-circle"></i>';
    } else if (type === 'info') {
        bgColor = '#3b82f6';
        borderColor = '#2563eb';
        icon = '<i class="fas fa-info-circle"></i>';
    }

    notification.innerHTML = `
        ${icon}
        <p style="margin: 0; flex: 1; line-height: 1.4;">${message}</p>
    `;

    // Apply inline styles directly (bypassing CSS classes that might not work)
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        font-size: 0.9375rem;
        font-weight: 500;
        max-width: 400px;
        background: ${bgColor};
        border: 1px solid ${borderColor};
        color: white;
        transform: translateX(400px);
        opacity: 0;
        transition: all 0.3s ease-out;
    `;

    // Add to body
    document.body.appendChild(notification);

    // Add to queue FIRST (this sets the vertical position via style.top)
    NotificationQueue.add(notification);

    // Trigger slide-in animation
    requestAnimationFrame(() => {
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        }, 50);
    });

    // Remove after duration
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(400px)';

        // Remove from DOM after fade-out animation completes
        setTimeout(() => {
            NotificationQueue.remove(notification);
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, duration);
}

// ============================================
// SUCCESS/ERROR NOTIFICATION SYSTEM
// ============================================

/**
 * Show a success notification card
 *
 * @example
 * showDeleteSuccessMessage('Team deleted successfully!');
 */
function showDeleteSuccessMessage(message, duration = 3000) {
    showNotificationCard(message, 'success', duration);
}

/**
 * Show an error notification card
 *
 * @example
 * showDeleteErrorMessage('Failed to delete team. Please try again.');
 */
function showDeleteErrorMessage(message, duration = 4000) {
    showNotificationCard(message, 'error', duration);
}

/**
 * Show an info notification card
 *
 * @example
 * showInfoMessage('Schedule automatically cleaned up');
 */
function showInfoMessage(message, duration = 4000) {
    showNotificationCard(message, 'info', duration);
}

// ============================================
// EXPORTS
// ============================================
window.autoSaveNotifications = autoSaveNotifications;
window.showNotificationDisabledMessage = showNotificationDisabledMessage;
window.subscribeToEvent = subscribeToEvent;
window.unsubscribeFromEvent = unsubscribeFromEvent;
window.showDeleteSuccessMessage = showDeleteSuccessMessage;
window.showDeleteErrorMessage = showDeleteErrorMessage;
window.showInfoMessage = showInfoMessage;
window.NotificationQueue = NotificationQueue;