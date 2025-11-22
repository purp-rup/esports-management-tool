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

    // Update visibility labels before showing modal
    updateVisibilityLabels(currentScheduleTeamId, currentScheduleGameId);

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
                        <span>${buildVisibilityText(schedule)}</span>
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
    };
    return visibilityMap[visibility] || visibility;
}

/**
 * Method to build the elements within the schedule modal. Including adding a game icon.
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

    // Set title
    document.getElementById('scheduleModalTitle').textContent = schedule.event_name;

    // Handle game icon in header
    const gameIconContainer = document.getElementById('scheduleModalGameIcon');
    if (schedule.game_id && gameIconContainer) {
        gameIconContainer.innerHTML = `
            <img src="/game-image/${schedule.game_id}"
                 alt="${schedule.game_title}"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="schedule-modal-game-icon-fallback" style="display: none;">
                <i class="fas fa-gamepad"></i>
            </div>
        `;
        gameIconContainer.style.display = 'flex';
    } else if (gameIconContainer) {
        gameIconContainer.style.display = 'none';
    }

    // Build modal body (without game icon header now)
    const modalBody = document.getElementById('scheduleModalBody');
    const eventTypeClass = schedule.event_type.toLowerCase();

    modalBody.innerHTML = `
        <div class="schedule-modal-grid">
            <div class="schedule-modal-section">
                <div class="schedule-modal-icon ${eventTypeClass}"><i class="fas fa-tag"></i></div>
                <div class="schedule-modal-content">
                    <h3>Event Type</h3>
                    <span class="schedule-type-badge ${eventTypeClass}">${schedule.event_type}</span>
                </div>
            </div>

            <div class="schedule-modal-section full-width">
                <div class="schedule-modal-icon ${eventTypeClass}"><i class="fas fa-redo"></i></div>
                <div class="schedule-modal-content">
                    <h3>Frequency</h3>
                    <p>${buildFrequencyText(schedule)}</p>
                </div>
            </div>

            <div class="schedule-modal-section full-width">
                <div class="schedule-modal-icon ${eventTypeClass}"><i class="fas fa-eye"></i></div>
                <div class="schedule-modal-content">
                    <h3>Visibility</h3>
                    <p>${buildVisibilityText(schedule)}</p>
                </div>
            </div>

            <div class="schedule-modal-section full-width">
                <div class="schedule-modal-icon ${eventTypeClass}"><i class="fas fa-map-marker-alt"></i></div>
                <div class="schedule-modal-content">
                    <h3>Location</h3>
                    <p>${schedule.location || 'TBD'}</p>
                </div>
            </div>

            ${schedule.description ? `
                <div class="schedule-modal-section full-width">
                    <div class="schedule-modal-icon ${eventTypeClass}"><i class="fas fa-info-circle"></i></div>
                    <div class="schedule-modal-content">
                        <h3>Description</h3>
                        <p>${schedule.description}</p>
                    </div>
                </div>
            ` : ''}

            <div class="schedule-modal-section full-width">
                <div class="schedule-modal-icon ${eventTypeClass}"><i class="fas fa-user"></i></div>
                <div class="schedule-modal-content">
                    <h3>Created By</h3>
                    <p>${schedule.created_by_name}</p>
                </div>
            </div>
        </div>
    `;

    // Show/hide edit and delete buttons based on permissions
    const editBtn = document.getElementById('editScheduleBtn');
    const deleteBtn = document.getElementById('deleteScheduleBtn');
    const isAdmin = window.userPermissions?.is_admin || false;
    const isGM = window.userPermissions?.is_gm || false;

    if (editBtn) {
        editBtn.style.display = (isAdmin || isGM) ? 'flex' : 'none';
        editBtn.onclick = () => openEditScheduleMode(scheduleId);
    }

    if (deleteBtn) {
        deleteBtn.style.display = (isAdmin || isGM) ? 'flex' : 'none';
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

/**
 * Open edit mode for a schedule
 */
function openEditScheduleMode(scheduleId) {
    const schedule = currentSchedules.find(s => s.schedule_id === scheduleId);

    if (!schedule) {
        console.error('Schedule not found:', scheduleId);
        return;
    }

    const modalBody = document.getElementById('scheduleModalBody');
    const eventTypeClass = schedule.event_type.toLowerCase();

    // Build edit form
    modalBody.innerHTML = `
        <form id="editScheduleForm" class="schedule-edit-form">
            <input type="hidden" id="editScheduleId" value="${scheduleId}">

            <div class="form-group">
                <label for="editScheduleName">Event Name *</label>
                <input type="text"
                       id="editScheduleName"
                       name="event_name"
                       value="${schedule.event_name}"
                       required>
            </div>

            <div class="form-group">
                <label for="editScheduleType">Event Type *</label>
                <select id="editScheduleType" name="event_type" required>
                    <option value="Match" ${schedule.event_type === 'Match' ? 'selected' : ''}>Match</option>
                    <option value="Practice" ${schedule.event_type === 'Practice' ? 'selected' : ''}>Practice</option>
                    <option value="Misc" ${schedule.event_type === 'Misc' ? 'selected' : ''}>Misc</option>
                </select>
            </div>

            <div class="form-group">
                <label>Frequency (Cannot be changed)</label>
                <input type="text" value="${buildFrequencyText(schedule)}" disabled>
            </div>

            <div class="form-group">
                <label for="editScheduleVisibility">Visibility *</label>
                <select id="editScheduleVisibility" name="visibility" required>
                    <option value="team" ${schedule.visibility === 'team' ? 'selected' : ''}>Team Only</option>
                    <option value="game_players" ${schedule.visibility === 'game_players' ? 'selected' : ''}>Game Players</option>
                    <option value="game_community" ${schedule.visibility === 'game_community' ? 'selected' : ''}>Game Community</option>
                </select>
            </div>

            <div class="form-group">
                <label for="editScheduleLocation">Location *</label>
                <select id="editScheduleLocation" name="location" required>
                    <option value="">Select location</option>
                    <option value="Campus Center" ${schedule.location === 'Campus Center' ? 'selected' : ''}>Campus Center</option>
                    <option value="Campus Center Coffee House" ${schedule.location === 'Campus Center Coffee House' ? 'selected' : ''}>Campus Center Coffee House</option>
                    <option value="Campus Center Event Room" ${schedule.location === 'Campus Center Event Room' ? 'selected' : ''}>Campus Center Event Room</option>
                    <option value="D-108" ${schedule.location === 'D-108' ? 'selected' : ''}>D-108</option>
                    <option value="Esports Lab (Commons Building 80)" ${schedule.location === 'Esports Lab (Commons Building 80)' ? 'selected' : ''}>Esports Lab (Commons Building 80)</option>
                    <option value="Lakeside Lodge" ${schedule.location === 'Lakeside Lodge' ? 'selected' : ''}>Lakeside Lodge</option>
                    <option value="Online" ${schedule.location === 'Online' ? 'selected' : ''}>Online</option>
                    <option value="other" ${!['Campus Center', 'Campus Center Coffee House', 'Campus Center Event Room', 'D-108', 'Esports Lab (Commons Building 80)', 'Lakeside Lodge', 'Online'].includes(schedule.location) ? 'selected' : ''}>Other</option>
                </select>
            </div>

            <div class="form-group" id="editCustomLocationGroup" style="display: ${!['Campus Center', 'Campus Center Coffee House', 'Campus Center Event Room', 'D-108', 'Esports Lab (Commons Building 80)', 'Lakeside Lodge', 'Online'].includes(schedule.location) ? 'block' : 'none'};">
                <label for="editCustomLocation">Custom Location</label>
                <input type="text"
                       id="editCustomLocation"
                       name="custom_location"
                       value="${!['Campus Center', 'Campus Center Coffee House', 'Campus Center Event Room', 'D-108', 'Esports Lab (Commons Building 80)', 'Lakeside Lodge', 'Online'].includes(schedule.location) ? schedule.location : ''}">
            </div>

            <div class="form-group">
                <label for="editScheduleDescription">Description</label>
                <textarea id="editScheduleDescription"
                          name="description"
                          rows="3">${schedule.description || ''}</textarea>
            </div>

            <div id="editScheduleMessage" class="form-message" style="display: none;"></div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="cancelEditSchedule(${scheduleId})">
                    Cancel
                </button>
                <button type="submit" class="btn btn-primary">
                    <span class="btn-text">Save Changes</span>
                    <i class="btn-spinner fas fa-spinner fa-spin" style="display: none;"></i>
                </button>
            </div>
        </form>
    `;

    // Add location change handler
    const locationSelect = document.getElementById('editScheduleLocation');
    const customLocationGroup = document.getElementById('editCustomLocationGroup');
    const customLocationInput = document.getElementById('editCustomLocation');

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

    // Add form submit handler
    document.getElementById('editScheduleForm').addEventListener('submit', handleEditScheduleSubmit);

    // Hide edit/delete buttons while in edit mode
    document.getElementById('editScheduleBtn').style.display = 'none';
    document.getElementById('deleteScheduleBtn').style.display = 'none';
}

/**
 * Cancel edit mode and return to view mode
 */
function cancelEditSchedule(scheduleId) {
    openScheduleModal(scheduleId);
}

/**
 * Handle edit schedule form submission
 */
async function handleEditScheduleSubmit(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    const messageDiv = document.getElementById('editScheduleMessage');

    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
    messageDiv.style.display = 'none';

    const scheduleId = document.getElementById('editScheduleId').value;
    const locationSelect = document.getElementById('editScheduleLocation');
    const customLocationInput = document.getElementById('editCustomLocation');
    const location = locationSelect.value === 'other' ? customLocationInput.value : locationSelect.value;

    const formData = {
        schedule_id: scheduleId,
        event_name: document.getElementById('editScheduleName').value,
        event_type: document.getElementById('editScheduleType').value,
        visibility: document.getElementById('editScheduleVisibility').value,
        location: location,
        description: document.getElementById('editScheduleDescription').value
    };

    try {
        const response = await fetch('/api/scheduled-events/update', {
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
                closeScheduleModal();
                // Reload the schedule tab
                if (typeof loadScheduleTab === 'function' && currentSelectedTeamId) {
                    loadScheduleTab(currentSelectedTeamId);
                }
            }, 1500);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        messageDiv.textContent = error.message || 'Failed to update schedule';
        messageDiv.className = 'form-message error';
        messageDiv.style.display = 'block';

        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

/**
 * Initialize schedule button visibility when team is selected
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
            const userId = window.currentUserId;
            console.log('Current user ID:', userId, 'Game ID:', gameId);

            // Use the new route with game_id parameter
            const response = await fetch(`/api/user/${userId}/manages-game/${gameId}`);
            const data = await response.json();
            console.log('API response:', data);

            if (data.success && data.manages_game) {
                console.log('✓ User manages this game - showing button');
                createScheduleBtn.style.display = 'flex';

                // Update visibility dropdown labels with team/game names
                updateVisibilityLabels(teamId, gameId);
            } else {
                console.log('✗ User does not manage this game');
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
 * Update visibility dropdown labels with team and game names
 */
async function updateVisibilityLabels(teamId, gameId) {
    try {
        // Get team and game info
        const response = await fetch(`/api/teams/${teamId}/details`);
        const data = await response.json();

        if (data.success) {
            const teamName = data.team.title;
            const gameName = data.team.game_title;

            // Update the dropdown options
            const teamOption = document.getElementById('visibilityTeamOption');
            const playersOption = document.getElementById('visibilityPlayersOption');
            const communityOption = document.getElementById('visibilityCommunityOption');

            if (teamOption) {
                teamOption.textContent = `${teamName} only`;
            }
            if (playersOption) {
                playersOption.textContent = `Players for ${gameName}`;
            }
            if (communityOption) {
                communityOption.textContent = `Community Members for ${gameName}`;
            }
        }
    } catch (error) {
        console.error('Error updating visibility labels:', error);
    }
}

/**
 * Build dynamic frequency text based on schedule settings
 */
function buildFrequencyText(schedule) {
    const startTime = schedule.start_time;
    const endTime = schedule.end_time;
    const timeRange = `${startTime} - ${endTime}`;

    if (schedule.frequency === 'Once') {
        // Once on {date} from {start time - end time}
        return `${schedule.specific_date} from ${timeRange}`;
    } else if (schedule.frequency === 'Monthly') {
        // Once a month on {day of week} from {start-time - end-time} until {last generation day}
        return `Monthly / ${schedule.day_of_week_name} / ${timeRange} until ${schedule.schedule_end_date}`;
    } else if (schedule.frequency === 'Biweekly') {
        // Every other week on {day-of-week} from {start-time - end-time} until {last generation day}
        return `Biweekly / ${schedule.day_of_week_name} / ${timeRange} until ${schedule.schedule_end_date}`;
    } else if (schedule.frequency === 'Weekly') {
        // Every week on {day-of-week} from {start-time - end-time} until {last generation day}
        return `Weekly / ${schedule.day_of_week_name} / ${timeRange} until ${schedule.schedule_end_date}`;
    } else {
        // Fallback
        return `${schedule.frequency} - ${schedule.day_of_week_name || 'N/A'}`;
    }
}

/**
 * Build dynamic visibility text with game/team context
 */
function buildVisibilityText(schedule) {
    const gameName = schedule.game_title;

    switch (schedule.visibility) {
        case 'game_community':
            return `${gameName} Community`;

        case 'game_players':
            return `${gameName} Players`;

        case 'team':
            // Use team name if available, otherwise show generic message
            if (schedule.team_name) {
                return `${schedule.team_name} for ${gameName}`;
            }
            return `Team-specific for ${gameName}`;

        default:
            return formatVisibility(schedule.visibility);
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
window.openEditScheduleMode = openEditScheduleMode;
window.cancelEditSchedule = cancelEditSchedule;
window.updateVisibilityLabels = updateVisibilityLabels;