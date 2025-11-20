/**
 * Simple Scheduled Events - Fixed Version
 */

let currentScheduleTeamId = null;
let currentScheduleGameId = null;
let currentSchedules = [];

/**
 * Initialize scheduled events button visibility when team is selected
 */
async function initScheduleButton(teamId, gameId) {
    console.log('initScheduleButton called:', { teamId, gameId });

    currentScheduleTeamId = teamId;
    currentScheduleGameId = gameId;

    const createScheduleBtn = document.getElementById('createScheduleBtn');
    if (!createScheduleBtn) {
        console.log('createScheduleBtn element not found');
        return;
    }

    const isGM = window.userPermissions?.is_gm || false;
    console.log('User is GM:', isGM);

    if (isGM && gameId) {
        // Check if GM manages THIS specific game
        try {
            // Get the current user's ID from window object
            const userId = window.currentUserId;
            console.log('Current user ID:', userId);

            // Fixed: Use actual user ID instead of placeholder
            const response = await fetch(`/api/user/${userId}/managed-game`);
            const data = await response.json();
            console.log('API response:', data);

            // Check if the user manages a game AND if it matches the current game
            if (data.success && data.manages_game && data.game_id === gameId) {
                console.log('✓ User manages this game - showing button');
                createScheduleBtn.style.display = 'flex';
            } else {
                console.log('✗ User does not manage this game or game ID mismatch');
                console.log('  Managed game ID:', data.game_id, 'Current game ID:', gameId);
                createScheduleBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('Error checking GM status:', error);
            createScheduleBtn.style.display = 'none';
        }
    } else {
        console.log('User is not a GM or no gameId provided');
        createScheduleBtn.style.display = 'none';
    }
}

/**
 * Open the scheduled event modal
 */
function openCreateScheduledEventModal() {
    if (!currentScheduleTeamId) {
        alert('Please select a team first');
        return;
    }

    const modal = document.getElementById('createScheduledEventModal');
    if (!modal) {
        console.error('Scheduled event modal not found');
        return;
    }

    // Reset form
    const form = document.getElementById('createScheduledEventForm');
    if (form) {
        form.reset();
    }

    // Clear any previous messages
    const messageDiv = document.getElementById('scheduledEventMessage');
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }

    // Show modal
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Close the scheduled event modal
 */
function closeCreateScheduledEventModal() {
    const modal = document.getElementById('createScheduledEventModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Attach event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('createScheduledEventForm');
    if (form) {
        form.addEventListener('submit', handleScheduledEventSubmit);
    }
});

/**
 * Handle frequency change - show/hide date vs day of week
 */
function handleFrequencyChange() {
    const frequency = document.getElementById('scheduledFrequency').value;
    const dayOfWeekGroup = document.getElementById('scheduledDayOfWeekGroup');
    const specificDateGroup = document.getElementById('scheduledSpecificDateGroup');
    const dayOfWeekSelect = document.getElementById('scheduledDayOfWeek');
    const specificDateInput = document.getElementById('scheduledSpecificDate');
    const endDateGroup = document.querySelector('label[for="scheduledEndDate"]').parentElement;
    const endDateInput = document.getElementById('scheduledEndDate'); // ADD THIS

    if (frequency === 'Once') {
        // Hide day of week, show specific date
        dayOfWeekGroup.style.display = 'none';
        specificDateGroup.style.display = 'block';

        // Update required attributes
        dayOfWeekSelect.removeAttribute('required');
        specificDateInput.setAttribute('required', 'required');

        // Hide end date (not needed for one-time events)
        endDateGroup.style.display = 'none';
        endDateInput.removeAttribute('required'); // ADD THIS LINE
    } else {
        // Show day of week, hide specific date
        dayOfWeekGroup.style.display = 'block';
        specificDateGroup.style.display = 'none';

        // Update required attributes
        dayOfWeekSelect.setAttribute('required', 'required');
        specificDateInput.removeAttribute('required');

        // Show end date
        endDateGroup.style.display = 'block';
        endDateInput.setAttribute('required', 'required'); // ADD THIS LINE
    }
}

/**
 * Handle form submission
 */
async function handleScheduledEventSubmit(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    const messageDiv = document.getElementById('scheduledEventMessage');
    const locationSelect = document.getElementById('scheduledLocation');
    const customLocationInput = document.getElementById('scheduledCustomLocation');
    const location = locationSelect.value === 'other' ? customLocationInput.value : locationSelect.value;

    // Disable submit button
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
    messageDiv.style.display = 'none';

    const formData = {
        team_id: currentScheduleTeamId,
        event_name: document.getElementById('scheduledEventName').value,
        event_type: document.getElementById('scheduledEventType').value,
        frequency: document.getElementById('scheduledFrequency').value,
        //day_of_week: parseInt(document.getElementById('scheduledDayOfWeek').value),
        start_time: document.getElementById('scheduledStartTime').value,
        end_time: document.getElementById('scheduledEndTime').value,
        visibility: document.getElementById('scheduledVisibility').value,
        //end_date: document.getElementById('scheduledEndDate').value,
        description: document.getElementById('scheduledDescription').value,
        location: location
    };

    // Add day_of_week OR specific_date depending on frequency
    if (formData.frequency === 'Once') {
        formData.specific_date = document.getElementById('scheduledSpecificDate').value;
        // Don't send day_of_week at all
        formData.end_date = formData.specific_date; // Same as event date
    } else {
        formData.day_of_week = document.getElementById('scheduledDayOfWeek').value;
        // Don't send specific_date at all
        formData.end_date = document.getElementById('scheduledEndDate').value;
    }

    try {
        const response = await fetch('/api/scheduled-events/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            messageDiv.textContent = data.message;
            messageDiv.className = 'form-message success';
            messageDiv.style.display = 'block';

            setTimeout(() => {
                closeCreateScheduledEventModal();
                // Reload team details
                if (typeof selectTeam === 'function') {
                    selectTeam(currentScheduleTeamId);
                }
            }, 1500);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        messageDiv.textContent = error.message || 'Failed to create scheduled event';
        messageDiv.className = 'form-message error';
        messageDiv.style.display = 'block';

        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

// Handle location dropdown change
document.addEventListener('DOMContentLoaded', function() {
    const locationSelect = document.getElementById('scheduledLocation');
    const customLocationGroup = document.getElementById('scheduledCustomLocationGroup');
    const customLocationInput = document.getElementById('scheduledCustomLocation');

    if (locationSelect) {
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
});

/**
 * Load schedule tab with all scheduled events for the team
 */
async function loadScheduleTab(teamId) {
    const schedulePanel = document.getElementById('scheduleTabContent');

    if (!schedulePanel) {
        console.error('Schedule tab content not found');
        return;
    }

    // Show loading state
    schedulePanel.innerHTML = `
        <div class="schedule-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading schedules...</p>
        </div>
    `;

    try {
        const response = await fetch(`/api/scheduled-events/team/${teamId}`);
        const data = await response.json();

        if (data.success && data.schedules && data.schedules.length > 0) {
            currentSchedules = data.schedules;
            renderScheduleCards(data.schedules);
        } else {
            schedulePanel.innerHTML = `
                <div class="schedule-empty">
                    <i class="fas fa-calendar-times"></i>
                    <h3>No Scheduled Events</h3>
                    <p>This team doesn't have any recurring scheduled events yet.</p>
                    <p class="schedule-empty-hint">Use the "Schedule Event" button to create recurring practices, matches, or meetings.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading schedules:', error);
        schedulePanel.innerHTML = `
            <div class="schedule-error">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load schedules. Please try again.</p>
            </div>
        `;
    }
}

/**
 * Render schedule cards in a two-column grid
 */
function renderScheduleCards(schedules) {
    const schedulePanel = document.getElementById('scheduleTabContent');

    let html = '<div class="schedule-cards-grid">';

    schedules.forEach(schedule => {
        const dayName = schedule.day_of_week_name || 'One-time';
        const isOnce = schedule.frequency === 'Once';

        html += `
            <div class="schedule-card" onclick="openScheduleModal(${schedule.schedule_id})">
                <div class="schedule-card-header">
                    <div class="schedule-card-icon">
                        <i class="fas fa-calendar-alt"></i>
                    </div>
                    <div class="schedule-card-title-section">
                        <h4 class="schedule-card-title">${schedule.event_name}</h4>
                        <span class="schedule-type-badge ${schedule.event_type.toLowerCase()}">${schedule.event_type}</span>
                    </div>
                </div>

                <div class="schedule-card-details">
                    <div class="schedule-card-detail">
                        <i class="fas fa-redo"></i>
                        <span>${schedule.frequency}${!isOnce ? ' - ' + dayName : ''}</span>
                    </div>

                    ${isOnce ? `
                        <div class="schedule-card-detail">
                            <i class="fas fa-calendar-day"></i>
                            <span>${schedule.specific_date}</span>
                        </div>
                    ` : ''}

                    <div class="schedule-card-detail">
                        <i class="fas fa-clock"></i>
                        <span>${schedule.start_time} - ${schedule.end_time}</span>
                    </div>

                    <div class="schedule-card-detail">
                        <i class="fas fa-eye"></i>
                        <span>${formatVisibility(schedule.visibility)}</span>
                    </div>

                    <div class="schedule-card-detail">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${schedule.location || 'TBD'}</span>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    schedulePanel.innerHTML = html;
}

/**
 * Format visibility setting for display
 */
function formatVisibility(visibility) {
    const visibilityMap = {
        'team': 'Team Only',
        'game_players': 'Game Players',
        'game_community': 'Game Community',
        'all_members': 'All Members'
    };
    return visibilityMap[visibility] || visibility;
}

/**
 * Open schedule details modal
 */
function openScheduleModal(scheduleId) {
    const schedule = currentSchedules.find(s => s.schedule_id === scheduleId);

    if (!schedule) {
        console.error('Schedule not found:', scheduleId);
        return;
    }

    const modal = document.getElementById('scheduleDetailsModal');
    if (!modal) {
        console.error('Schedule details modal not found');
        return;
    }

    // Populate modal
    const isOnce = schedule.frequency === 'Once';
    const dayName = schedule.day_of_week_name || 'N/A';

    document.getElementById('scheduleModalTitle').textContent = schedule.event_name;

    const modalBody = document.getElementById('scheduleModalBody');
    modalBody.innerHTML = `
        <div class="schedule-modal-grid">
            <div class="schedule-modal-section">
                <div class="schedule-modal-icon"><i class="fas fa-tag"></i></div>
                <div class="schedule-modal-content">
                    <h3>Event Type</h3>
                    <span class="schedule-type-badge ${schedule.event_type.toLowerCase()}">${schedule.event_type}</span>
                </div>
            </div>

            <div class="schedule-modal-section">
                <div class="schedule-modal-icon"><i class="fas fa-redo"></i></div>
                <div class="schedule-modal-content">
                    <h3>Frequency</h3>
                    <p>${schedule.frequency}</p>
                </div>
            </div>

            ${!isOnce ? `
                <div class="schedule-modal-section">
                    <div class="schedule-modal-icon"><i class="fas fa-calendar-week"></i></div>
                    <div class="schedule-modal-content">
                        <h3>Day of Week</h3>
                        <p>${dayName}</p>
                    </div>
                </div>
            ` : `
                <div class="schedule-modal-section">
                    <div class="schedule-modal-icon"><i class="fas fa-calendar-day"></i></div>
                    <div class="schedule-modal-content">
                        <h3>Event Date</h3>
                        <p>${schedule.specific_date}</p>
                    </div>
                </div>
            `}

            <div class="schedule-modal-section">
                <div class="schedule-modal-icon"><i class="fas fa-clock"></i></div>
                <div class="schedule-modal-content">
                    <h3>Time</h3>
                    <p>${schedule.start_time} - ${schedule.end_time}</p>
                </div>
            </div>

            <div class="schedule-modal-section">
                <div class="schedule-modal-icon"><i class="fas fa-eye"></i></div>
                <div class="schedule-modal-content">
                    <h3>Visibility</h3>
                    <p>${formatVisibility(schedule.visibility)}</p>
                </div>
            </div>

            <div class="schedule-modal-section">
                <div class="schedule-modal-icon"><i class="fas fa-gamepad"></i></div>
                <div class="schedule-modal-content">
                    <h3>Game</h3>
                    <p>${schedule.game_title}</p>
                </div>
            </div>

            <div class="schedule-modal-section full-width">
                <div class="schedule-modal-icon"><i class="fas fa-map-marker-alt"></i></div>
                <div class="schedule-modal-content">
                    <h3>Location</h3>
                    <p>${schedule.location || 'TBD'}</p>
                </div>
            </div>

            <div class="schedule-modal-section full-width">
                <div class="schedule-modal-icon"><i class="fas fa-calendar-check"></i></div>
                <div class="schedule-modal-content">
                    <h3>Schedule End Date</h3>
                    <p>Events will be generated until ${schedule.schedule_end_date}</p>
                </div>
            </div>

            ${schedule.description ? `
                <div class="schedule-modal-section full-width">
                    <div class="schedule-modal-icon"><i class="fas fa-info-circle"></i></div>
                    <div class="schedule-modal-content">
                        <h3>Description</h3>
                        <p>${schedule.description}</p>
                    </div>
                </div>
            ` : ''}

            ${schedule.last_generated ? `
                <div class="schedule-modal-section full-width">
                    <div class="schedule-modal-icon"><i class="fas fa-history"></i></div>
                    <div class="schedule-modal-content">
                        <h3>Last Generated</h3>
                        <p>${schedule.last_generated}</p>
                    </div>
                </div>
            ` : ''}

            <div class="schedule-modal-section full-width">
                <div class="schedule-modal-icon"><i class="fas fa-user"></i></div>
                <div class="schedule-modal-content">
                    <h3>Created By</h3>
                    <p>${schedule.created_by_name}</p>
                </div>
            </div>
        </div>
    `;

    // Show/hide delete button based on permissions
    const deleteBtn = document.getElementById('deleteScheduleBtn');
    if (deleteBtn) {
        const isAdmin = window.userPermissions?.is_admin || false;
        const isGM = window.userPermissions?.is_gm || false;
        deleteBtn.style.display = (isAdmin || isGM) ? 'inline-flex' : 'none';
        deleteBtn.onclick = () => confirmDeleteSchedule(scheduleId);
    }

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Close schedule details modal
 */
function closeScheduleModal() {
    const modal = document.getElementById('scheduleDetailsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Confirm and delete schedule
 */
function confirmDeleteSchedule(scheduleId) {
    const schedule = currentSchedules.find(s => s.schedule_id === scheduleId);

    if (!schedule) {
        console.error('Schedule not found');
        return;
    }

    if (confirm(`Are you sure you want to delete the schedule "${schedule.event_name}"?\n\nAll events created by the schedule will be deleted as well`)) {
        deleteSchedule(scheduleId);
    }
}

/**
 * Delete a schedule
 */
async function deleteSchedule(scheduleId) {
    try {
        const response = await fetch(`/api/scheduled-events/${scheduleId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);
            closeScheduleModal();
            // Reload schedule tab
            loadScheduleTab(currentSelectedTeamId);
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error deleting schedule:', error);
        alert('Failed to delete schedule');
    }
}

// Export functions to global scope
window.openCreateScheduledEventModal = openCreateScheduledEventModal;
window.closeCreateScheduledEventModal = closeCreateScheduledEventModal;
window.initScheduleButton = initScheduleButton;
window.handleFrequencyChange = handleFrequencyChange;
window.openScheduleModal = openScheduleModal;
window.closeScheduleModal = closeScheduleModal;
window.loadScheduleTab = loadScheduleTab;