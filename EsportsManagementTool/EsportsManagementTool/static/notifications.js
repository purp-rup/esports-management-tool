/**
 * notifications.js
 * ============================================================================
 * NOTIFICATION SETTINGS MANAGEMENT
 * ORGANIZED BY CLAUDEAI
 * ============================================================================
 * Handles all notification-related functionality:
 * - User notification preferences (enable/disable)
 * - Advance notice settings (days and hours before events)
 * - Event type filtering (practices, matches, tournaments, events, misc)
 * - Real-time preview of notification settings
 * - Event subscription management (subscribe/unsubscribe)
 * - Form validation and submission
 *
 * This module manages how users receive notifications for events they're
 * subscribed to, including timing and event type preferences.
 * ============================================================================
 */

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize all notification-related functionality on page load
 */
document.addEventListener('DOMContentLoaded', function() {
    initializeNotificationSettings();
    initializeNotificationForm();
});

// ============================================
// NOTIFICATION SETTINGS INITIALIZATION
// ============================================

/**
 * Initialize notification settings UI and event listeners
 * Sets up toggle behavior, input listeners, and initial preview
 */
function initializeNotificationSettings() {
    // Get UI elements
    const enableNotifToggle = document.getElementById('enableNotifications');
    const notificationOptions = document.getElementById('notificationOptions');
    const daysInput = document.getElementById('adviceNoticeDays');
    const hoursInput = document.getElementById('adviceNoticeHours');

    // Event type checkboxes
    const eventTypeCheckboxes = {
        practices: document.getElementById('notifyPractices'),
        matches: document.getElementById('notifyMatches'),
        tournaments: document.getElementById('notifyTournaments'),
        events: document.getElementById('notifyEvents'),
        misc: document.getElementById('notifyMisc')
    };

    // ========================================
    // TOGGLE NOTIFICATION OPTIONS VISIBILITY
    // ========================================
    if (enableNotifToggle && notificationOptions) {
        enableNotifToggle.addEventListener('change', function() {
            // Show/hide notification options based on toggle state
            notificationOptions.style.display = this.checked ? 'block' : 'none';
        });
    }

    // ========================================
    // UPDATE PREVIEW ON INPUT CHANGES
    // ========================================
    if (daysInput && hoursInput) {
        // Listen for changes to time inputs
        daysInput.addEventListener('input', updateNotificationPreview);
        hoursInput.addEventListener('input', updateNotificationPreview);

        // Listen for changes to all event type checkboxes
        Object.values(eventTypeCheckboxes).forEach(checkbox => {
            if (checkbox) {
                checkbox.addEventListener('change', updateNotificationPreview);
            }
        });

        // Display initial preview based on current settings
        updateNotificationPreview();
    }
}

// ============================================
// NOTIFICATION PREVIEW
// ============================================

/**
 * Update the notification preview text based on current settings
 * Shows users exactly when and for what types of events they'll be notified
 *
 * Examples:
 * - "2 days and 3 hours for all event types"
 * - "1 day for matches, tournaments, and general events"
 * - "at the time of the event for practices"
 */
function updateNotificationPreview() {
    // Get input elements
    const daysInput = document.getElementById('adviceNoticeDays');
    const hoursInput = document.getElementById('adviceNoticeHours');
    const previewText = document.getElementById('previewTime');

    // Event type checkboxes
    const eventTypeCheckboxes = {
        practices: document.getElementById('notifyPractices'),
        matches: document.getElementById('notifyMatches'),
        tournaments: document.getElementById('notifyTournaments'),
        events: document.getElementById('notifyEvents'),
        misc: document.getElementById('notifyMisc')
    };

    // Safety check
    if (!daysInput || !hoursInput || !previewText) return;

    // Get time values
    const days = parseInt(daysInput.value) || 0;
    const hours = parseInt(hoursInput.value) || 0;

    // ========================================
    // BUILD TIME PREVIEW
    // ========================================
    let previewParts = [];

    if (days > 0) {
        previewParts.push(`${days} day${days !== 1 ? 's' : ''}`);
    }
    if (hours > 0) {
        previewParts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    }

    // Determine time text
    let timeText = '';
    if (previewParts.length === 0) {
        timeText = 'at the time of the event';
    } else {
        timeText = previewParts.join(' and ');
    }

    // ========================================
    // BUILD EVENT TYPES PREVIEW
    // ========================================
    let eventTypes = [];

    if (eventTypeCheckboxes.practices && eventTypeCheckboxes.practices.checked) {
        eventTypes.push('practices');
    }
    if (eventTypeCheckboxes.matches && eventTypeCheckboxes.matches.checked) {
        eventTypes.push('matches');
    }
    if (eventTypeCheckboxes.tournaments && eventTypeCheckboxes.tournaments.checked) {
        eventTypes.push('tournaments');
    }
    if (eventTypeCheckboxes.events && eventTypeCheckboxes.events.checked) {
        eventTypes.push('general events');
    }
    if (eventTypeCheckboxes.misc && eventTypeCheckboxes.misc.checked) {
        eventTypes.push('miscellaneous activities');
    }

    // ========================================
    // UPDATE PREVIEW TEXT
    // ========================================
    if (eventTypes.length === 0) {
        // No event types selected
        previewText.textContent = `${timeText} (no event types selected)`;
    } else if (eventTypes.length === 5) {
        // All event types selected
        previewText.textContent = `${timeText} for all event types`;
    } else {
        // Some event types selected - format as natural list
        const lastType = eventTypes.pop();
        const typeList = eventTypes.length > 0
            ? eventTypes.join(', ') + ', and ' + lastType
            : lastType;
        previewText.textContent = `${timeText} for ${typeList}`;
    }
}

// ============================================
// EVENT TYPE VALIDATION
// ============================================

/**
 * Validate that at least one event type is selected
 * Prevents users from enabling notifications without selecting any event types
 *
 * @returns {boolean} True if at least one event type is checked
 */
function validateEventTypes() {
    const eventTypeCheckboxes = {
        practices: document.getElementById('notifyPractices'),
        matches: document.getElementById('notifyMatches'),
        tournaments: document.getElementById('notifyTournaments'),
        events: document.getElementById('notifyEvents'),
        misc: document.getElementById('notifyMisc')
    };

    // Check if any checkbox is checked
    return Object.values(eventTypeCheckboxes).some(checkbox =>
        checkbox && checkbox.checked
    );
}

// ============================================
// NOTIFICATION FORM SUBMISSION
// ============================================

/**
 * Initialize notification settings form submission handler
 * Handles form validation, submission, and user feedback
 */
function initializeNotificationForm() {
    const notifForm = document.getElementById('notificationSettingsForm');
    if (!notifForm) return;

    notifForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Get form elements
        const submitBtn = notifForm.querySelector('button[type="submit"]');
        const submitBtnText = document.getElementById('saveNotifBtnText');
        const submitBtnSpinner = document.getElementById('saveNotifBtnSpinner');
        const formMessage = document.getElementById('notificationMessage');
        const enableNotifToggle = document.getElementById('enableNotifications');

        // ========================================
        // VALIDATE EVENT TYPE SELECTION
        // ========================================
        // If notifications are enabled, require at least one event type
        if (enableNotifToggle && enableNotifToggle.checked && !validateEventTypes()) {
            showFormMessage(
                formMessage,
                'Please select at least one event type to receive notifications for.',
                'error',
                5000
            );
            return;
        }

        // ========================================
        // SHOW LOADING STATE
        // ========================================
        submitBtn.disabled = true;
        submitBtnText.style.display = 'none';
        submitBtnSpinner.style.display = 'inline-block';

        // ========================================
        // SUBMIT FORM DATA
        // ========================================
        const formData = new FormData(notifForm);

        try {
            const response = await fetch('/eventnotificationsettings', {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Show success message
                showFormMessage(
                    formMessage,
                    data.message || 'Notification settings saved successfully!',
                    'success',
                    3000
                );
            } else {
                throw new Error(data.message || 'Failed to save settings');
            }
        } catch (error) {
            // Show error message
            showFormMessage(
                formMessage,
                error.message || 'Failed to save notification settings. Please try again.',
                'error'
            );
        } finally {
            // ========================================
            // RESET BUTTON STATE
            // ========================================
            submitBtn.disabled = false;
            submitBtnText.style.display = 'inline';
            submitBtnSpinner.style.display = 'none';
        }
    });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Show a form message to the user
 * Handles success and error messages with auto-hide
 *
 * @param {HTMLElement} messageElement - The message container element
 * @param {string} message - The message text to display
 * @param {string} type - Message type ('success' or 'error')
 * @param {number} duration - How long to show message (ms), 0 = no auto-hide
 */
function showFormMessage(messageElement, message, type = 'success', duration = 0) {
    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.className = `form-message ${type}`;
    messageElement.style.display = 'block';

    // Auto-hide message after duration if specified
    if (duration > 0) {
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, duration);
    }
}

// ============================================
// EVENT NOTIFICATION SECTION
// ============================================

/**
 * Show a message when notifications are disabled
 * Displays in the event details modal when user has notifications turned off
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
 * Subscribe to event notifications
 * @param {number} eventId - ID of the event to subscribe to
 */
async function subscribeToEvent(eventId) {
    try {
        const response = await fetch(`/api/subscribe-event/${eventId}`, {
            method: 'POST'
        });
        const data = await response.json();

        alert(data.message || 'Subscribed successfully!');

        // Reload notification section to reflect new subscription status
        await loadNotificationSection(eventId);
    } catch (error) {
        console.error('Error subscribing to event:', error);
        alert('Failed to subscribe. Please try again.');
    }
}

/**
 * Unsubscribe from event notifications
 * @param {number} eventId - ID of the event to unsubscribe from
 */
async function unsubscribeFromEvent(eventId) {
    try {
        const response = await fetch(`/api/unsubscribe-event/${eventId}`, {
            method: 'POST'
        });
        const data = await response.json();

        alert(data.message || 'Unsubscribed successfully!');

        // Reload notification section to reflect new subscription status
        await loadNotificationSection(eventId);
    } catch (error) {
        console.error('Error unsubscribing from event:', error);
        alert('Failed to unsubscribe. Please try again.');
    }
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

/**
 * Export functions for use by other modules and HTML onclick handlers
 */
window.updateNotificationPreview = updateNotificationPreview;
window.showNotificationDisabledMessage = showNotificationDisabledMessage;
window.subscribeToEvent = subscribeToEvent;
window.unsubscribeFromEvent = unsubscribeFromEvent;