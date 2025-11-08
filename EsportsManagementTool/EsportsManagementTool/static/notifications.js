/**
 * Notification Settings Management
 * Handles notification preferences and event type filters
 */

// ===============================
// NOTIFICATION PREVIEW UPDATE
// ===============================
function updateNotificationPreview() {
    const daysInput = document.getElementById('adviceNoticeDays');
    const hoursInput = document.getElementById('adviceNoticeHours');
    const previewText = document.getElementById('previewTime');

    // Event type checkboxes
    const notifyPractices = document.getElementById('notifyPractices');
    const notifyMatches = document.getElementById('notifyMatches');
    const notifyTournaments = document.getElementById('notifyTournaments');
    const notifyEvents = document.getElementById('notifyEvents');

    if (!daysInput || !hoursInput || !previewText) return;

    const days = parseInt(daysInput.value) || 0;
    const hours = parseInt(hoursInput.value) || 0;

    // Build time preview
    let previewParts = [];
    if (days > 0) {
        previewParts.push(`${days} day${days !== 1 ? 's' : ''}`);
    }
    if (hours > 0) {
        previewParts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    }

    let timeText = '';
    if (previewParts.length === 0) {
        timeText = 'at the time of the event';
    } else {
        timeText = previewParts.join(' and ');
    }

    // Build event types preview
    let eventTypes = [];
    if (notifyPractices && notifyPractices.checked) {
        eventTypes.push('practices');
    }
    if (notifyMatches && notifyMatches.checked) {
        eventTypes.push('matches');
    }
    if (notifyTournaments && notifyTournaments.checked) {
        eventTypes.push('tournaments');
    }
    if (notifyEvents && notifyEvents.checked) {
        eventTypes.push('general events');
    }

    // Update preview text
    if (eventTypes.length === 0) {
        previewText.textContent = `${timeText} (no event types selected)`;
    } else if (eventTypes.length === 4) {
        previewText.textContent = `${timeText} for all event types`;
    } else {
        const lastType = eventTypes.pop();
        const typeList = eventTypes.length > 0 ? eventTypes.join(', ') + ', and ' + lastType : lastType;
        previewText.textContent = `${timeText} for ${typeList}`;
    }
}

// ===============================
// EVENT TYPE VALIDATION
// ===============================
function validateEventTypes() {
    const notifyPractices = document.getElementById('notifyPractices');
    const notifyMatches = document.getElementById('notifyMatches');
    const notifyTournaments = document.getElementById('notifyTournaments');
    const notifyEvents = document.getElementById('notifyEvents');

    const practicesChecked = notifyPractices && notifyPractices.checked;
    const matchesChecked = notifyMatches && notifyMatches.checked;
    const tournamentsChecked = notifyTournaments && notifyTournaments.checked;
    const eventsChecked = notifyEvents && notifyEvents.checked;

    return practicesChecked || matchesChecked || tournamentsChecked || eventsChecked;
}

// ===============================
// NOTIFICATION SETTINGS INITIALIZATION
// ===============================
function initializeNotificationSettings() {
    const enableNotifToggle = document.getElementById('enableNotifications');
    const notificationOptions = document.getElementById('notificationOptions');
    const daysInput = document.getElementById('adviceNoticeDays');
    const hoursInput = document.getElementById('adviceNoticeHours');

    // Event type checkboxes
    const notifyPractices = document.getElementById('notifyPractices');
    const notifyMatches = document.getElementById('notifyMatches');
    const notifyTournaments = document.getElementById('notifyTournaments');
    const notifyEvents = document.getElementById('notifyEvents');

    // Toggle notification options visibility
    if (enableNotifToggle && notificationOptions) {
        enableNotifToggle.addEventListener('change', function() {
            if (this.checked) {
                notificationOptions.style.display = 'block';
            } else {
                notificationOptions.style.display = 'none';
            }
        });
    }

    // Update preview on input changes
    if (daysInput && hoursInput) {
        daysInput.addEventListener('input', updateNotificationPreview);
        hoursInput.addEventListener('input', updateNotificationPreview);

        // Add event listeners for all event type checkboxes
        if (notifyPractices) {
            notifyPractices.addEventListener('change', updateNotificationPreview);
        }
        if (notifyMatches) {
            notifyMatches.addEventListener('change', updateNotificationPreview);
        }
        if (notifyTournaments) {
            notifyTournaments.addEventListener('change', updateNotificationPreview);
        }
        if (notifyEvents) {
            notifyEvents.addEventListener('change', updateNotificationPreview);
        }

        // Initial preview update
        updateNotificationPreview();
    }
}

// ===============================
// NOTIFICATION FORM SUBMISSION
// ===============================
function initializeNotificationForm() {
    const notifForm = document.getElementById('notificationSettingsForm');

    if (!notifForm) return;

    notifForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const submitBtn = notifForm.querySelector('button[type="submit"]');
        const submitBtnText = document.getElementById('saveNotifBtnText');
        const submitBtnSpinner = document.getElementById('saveNotifBtnSpinner');
        const formMessage = document.getElementById('notificationMessage');
        const enableNotifToggle = document.getElementById('enableNotifications');

        // Validate that at least one event type is selected if notifications are enabled
        if (enableNotifToggle && enableNotifToggle.checked && !validateEventTypes()) {
            formMessage.textContent = 'Please select at least one event type to receive notifications for.';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';

            setTimeout(() => {
                formMessage.style.display = 'none';
            }, 5000);

            return;
        }

        // Disable submit button
        submitBtn.disabled = true;
        submitBtnText.style.display = 'none';
        submitBtnSpinner.style.display = 'inline-block';

        // Get form data
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
                formMessage.textContent = data.message || 'Notification settings saved successfully!';
                formMessage.className = 'form-message success';
                formMessage.style.display = 'block';

                // Hide message after 3 seconds
                setTimeout(() => {
                    formMessage.style.display = 'none';
                }, 3000);
            } else {
                throw new Error(data.message || 'Failed to save settings');
            }
        } catch (error) {
            // Show error message
            formMessage.textContent = error.message || 'Failed to save notification settings. Please try again.';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';
        } finally {
            // Re-enable submit button
            submitBtn.disabled = false;
            submitBtnText.style.display = 'inline';
            submitBtnSpinner.style.display = 'none';
        }
    });
}

// ===============================
// EVENT NOTIFICATION SECTION
// ===============================
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

async function subscribeToEvent(eventId) {
    const res = await fetch(`/api/subscribe-event/${eventId}`, { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Subscribed!');
    await loadNotificationSection(eventId);
}

async function unsubscribeFromEvent(eventId) {
    const res = await fetch(`/api/unsubscribe-event/${eventId}`, { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Unsubscribed!');
    await loadNotificationSection(eventId);
}

// ===============================
// INITIALIZE ON DOM READY
// ===============================
document.addEventListener('DOMContentLoaded', function() {
    initializeNotificationSettings();
    initializeNotificationForm();
});