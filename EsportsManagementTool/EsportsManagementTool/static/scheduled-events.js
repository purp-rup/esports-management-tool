/**
 * ============================================
 * SCHEDULED-EVENTS.JS
 * ORGANIZED BY CLAUDEAI
 * ============================================
 *
 * Manages recurring scheduled events for teams
 * Features:
 * - Create recurring events (Weekly, Biweekly, Monthly, Once)
 * - View and manage team schedules
 * - Edit existing schedules
 * - Delete schedules with cascading event deletion
 * - Permission-based visibility (Team, Game Players, Game Community)
 */

// ============================================
// GLOBAL STATE MANAGEMENT
// ============================================

/**
 * Global state for scheduled events module
 * Tracks current context and loaded data
 */
const ScheduleState = {
    /** Currently selected team ID */
    currentTeamId: null,

    /** Currently selected game ID */
    currentGameId: null,

    /** Loaded schedules for current team */
    currentSchedules: [],

    /** Pending schedule deletion ID */
    pendingDeleteScheduleId: null,  // ADD THIS LINE

    /**
     * Reset state to defaults
     */
    reset() {
        this.currentTeamId = null;
        this.currentGameId = null;
        this.currentSchedules = [];
        this.pendingDeleteScheduleId = null;
    },

    /**
     * Set current context
     * @param {number} teamId - Team ID
     * @param {number} gameId - Game ID
     */
    setContext(teamId, gameId) {
        this.currentTeamId = teamId;
        this.currentGameId = gameId;
    },

    /**
     * Find schedule by ID
     * @param {number} scheduleId - Schedule ID to find
     * @returns {Object|null} Schedule object or null if not found
     */
    findSchedule(scheduleId) {
        return this.currentSchedules.find(s => s.schedule_id === scheduleId) || null;
    }
};

// Legacy global variables for backwards compatibility
let currentScheduleTeamId = null;
let currentScheduleGameId = null;
let currentSchedules = [];

// ============================================
// INITIALIZATION & SETUP
// ============================================

/**
 * Initialize DOM event listeners when page loads
 * Attaches form submission and dropdown change handlers
 */
document.addEventListener('DOMContentLoaded', function() {
    // Create scheduled event form submission
    const createForm = document.getElementById('createScheduledEventForm');
    if (createForm) {
        createForm.addEventListener('submit', handleScheduledEventSubmit);
    }

    // Location dropdown for create form
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
 * Initialize schedule button visibility based on team selection
 * Shows "Schedule Event" button only if user is GM for the team's game
 *
 * @param {number} teamId - ID of the selected team
 * @param {number} gameId - ID of the team's game
 */
async function initScheduleButton(teamId, gameId) {
    console.log('initScheduleButton called:', { teamId, gameId });

    // Update state
    ScheduleState.setContext(teamId, gameId);
    currentScheduleTeamId = teamId; // Legacy
    currentScheduleGameId = gameId; // Legacy

    const createScheduleBtn = document.getElementById('createScheduleBtn');
    if (!createScheduleBtn) {
        console.log('createScheduleBtn element not found');
        return;
    }

    // Check user permissions
    const isGM = window.userPermissions?.is_gm || false;
    console.log('User is GM:', isGM);

    if (!isGM || !gameId) {
        console.log('User is not a GM or no gameId provided');
        createScheduleBtn.style.display = 'none';
        return;
    }

    // Check if GM manages THIS specific game
    try {
        const userId = window.currentUserId;
        console.log('Current user ID:', userId, 'Game ID:', gameId);

        const response = await fetch(`/api/user/${userId}/manages-game/${gameId}`);
        const data = await response.json();
        console.log('API response:', data);

        if (data.success && data.manages_game) {
            console.log('✓ User manages this game - showing button');
            createScheduleBtn.style.display = 'flex';

            // Update visibility dropdown labels with team/game names
            await updateVisibilityLabels(teamId, gameId);
        } else {
            console.log('✗ User does not manage this game');
            createScheduleBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking GM status:', error);
        createScheduleBtn.style.display = 'none';
    }
}

// ============================================
// DATA LOADING & API CALLS
// ============================================

/**
 * Load all scheduled events for a specific team
 * Fetches schedule data and renders it in the schedule tab
 *
 * @param {number} teamId - ID of the team to load schedules for
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
            ScheduleState.currentSchedules = data.schedules;
            currentSchedules = data.schedules; // Legacy
            renderScheduleCards(data.schedules);
        } else {
            // Show empty state
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
 * Update visibility dropdown labels with team and game names
 * Makes visibility options more user-friendly by showing actual names
 *
 * @param {number} teamId - Team ID
 * @param {number} gameId - Game ID
 */
async function updateVisibilityLabels(teamId, gameId) {
    try {
        const response = await fetch(`/api/teams/${teamId}/details`);
        const data = await response.json();

        if (data.success) {
            const teamName = data.team.title;
            const gameName = data.team.game_title;

            // Update the dropdown options with dynamic names
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

// ============================================
// RENDERING FUNCTIONS
// ============================================

/**
 * Render schedule cards in a two-column grid layout
 * Displays all schedules for the current team
 *
 * @param {Array} schedules - Array of schedule objects to render
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

// ============================================
// UTILITY & HELPER FUNCTIONS
// ============================================

/**
 * Build dynamic frequency text based on schedule settings
 * Formats schedule frequency in a human-readable way
 *
 * @param {Object} schedule - Schedule object
 * @returns {string} Formatted frequency text
 *
 * @example
 * // Returns: "Weekly / Monday / 3:00 PM - 5:00 PM until 2025-12-31"
 * buildFrequencyText({ frequency: 'Weekly', day_of_week_name: 'Monday', ... })
 */
function buildFrequencyText(schedule) {
    const startTime = schedule.start_time;
    const endTime = schedule.end_time;
    const timeRange = `${startTime} - ${endTime}`;

    if (schedule.frequency === 'Once') {
        // Format: "2025-12-25 from 3:00 PM - 5:00 PM"
        return `${schedule.specific_date} from ${timeRange}`;
    } else if (schedule.frequency === 'Monthly') {
        // Format: "Monthly / Monday / 3:00 PM - 5:00 PM until 2025-12-31"
        return `Monthly / ${schedule.day_of_week_name} / ${timeRange} until ${schedule.schedule_end_date}`;
    } else if (schedule.frequency === 'Biweekly') {
        // Format: "Biweekly / Monday / 3:00 PM - 5:00 PM until 2025-12-31"
        return `Biweekly / ${schedule.day_of_week_name} / ${timeRange} until ${schedule.schedule_end_date}`;
    } else if (schedule.frequency === 'Weekly') {
        // Format: "Weekly / Monday / 3:00 PM - 5:00 PM until 2025-12-31"
        return `Weekly / ${schedule.day_of_week_name} / ${timeRange} until ${schedule.schedule_end_date}`;
    } else {
        // Fallback for unknown frequencies
        return `${schedule.frequency} - ${schedule.day_of_week_name || 'N/A'}`;
    }
}

/**
 * Build dynamic visibility text with game/team context
 * Converts visibility setting to user-friendly text with context
 *
 * @param {Object} schedule - Schedule object with visibility and game info
 * @returns {string} Formatted visibility text
 *
 * @example
 * // Returns: "League of Legends Community"
 * buildVisibilityText({ visibility: 'game_community', game_title: 'League of Legends' })
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

/**
 * Format visibility setting for display (fallback)
 * Converts internal visibility codes to readable text
 *
 * @param {string} visibility - Visibility setting code
 * @returns {string} Formatted visibility text
 */
function formatVisibility(visibility) {
    const visibilityMap = {
        'team': 'Team Only',
        'game_players': 'Game Players',
        'game_community': 'Game Community',
    };
    return visibilityMap[visibility] || visibility;
}

// ============================================
// CREATE SCHEDULE MODAL
// ============================================

/**
 * Open the create scheduled event modal
 * Resets form and prepares modal for new schedule creation
 */
function openCreateScheduledEventModal() {
    if (!ScheduleState.currentTeamId && !currentScheduleTeamId) {
        alert('Please select a team first');
        return;
    }

    const modal = document.getElementById('createScheduledEventModal');
    if (!modal) {
        console.error('Scheduled event modal not found');
        return;
    }

    // Reset form to defaults
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
    const teamId = ScheduleState.currentTeamId || currentScheduleTeamId;
    const gameId = ScheduleState.currentGameId || currentScheduleGameId;
    updateVisibilityLabels(teamId, gameId);

    // Show modal
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Close create scheduled event modal
 */
function closeCreateScheduledEventModal() {
    const modal = document.getElementById('createScheduledEventModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Handle frequency dropdown change
 * Shows/hides appropriate date fields based on frequency selection
 * - Once: Shows specific date, hides day of week and end date
 * - Recurring: Shows day of week and end date, hides specific date
 */
function handleFrequencyChange() {
    const frequency = document.getElementById('scheduledFrequency').value;
    const dayOfWeekGroup = document.getElementById('scheduledDayOfWeekGroup');
    const specificDateGroup = document.getElementById('scheduledSpecificDateGroup');
    const dayOfWeekSelect = document.getElementById('scheduledDayOfWeek');
    const specificDateInput = document.getElementById('scheduledSpecificDate');
    const endDateGroup = document.querySelector('label[for="scheduledEndDate"]').parentElement;
    const endDateInput = document.getElementById('scheduledEndDate');

    if (frequency === 'Once') {
        // One-time event: show specific date only
        dayOfWeekGroup.style.display = 'none';
        specificDateGroup.style.display = 'block';
        endDateGroup.style.display = 'none';

        // Update required attributes
        dayOfWeekSelect.removeAttribute('required');
        specificDateInput.setAttribute('required', 'required');
        endDateInput.removeAttribute('required');
    } else {
        // Recurring event: show day of week and end date
        dayOfWeekGroup.style.display = 'block';
        specificDateGroup.style.display = 'none';
        endDateGroup.style.display = 'block';

        // Update required attributes
        dayOfWeekSelect.setAttribute('required', 'required');
        specificDateInput.removeAttribute('required');
        endDateInput.setAttribute('required', 'required');
    }
}

/**
 * Handle create scheduled event form submission
 * Validates and submits new schedule to server
 *
 * @param {Event} event - Form submit event
 */
async function handleScheduledEventSubmit(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    const messageDiv = document.getElementById('scheduledEventMessage');

    // Handle location (custom or preset)
    const locationSelect = document.getElementById('scheduledLocation');
    const customLocationInput = document.getElementById('scheduledCustomLocation');
    const location = locationSelect.value === 'other'
        ? customLocationInput.value
        : locationSelect.value;

    // Set loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
    messageDiv.style.display = 'none';

    // Build form data object
    const teamId = ScheduleState.currentTeamId || currentScheduleTeamId;
    const formData = {
        team_id: teamId,
        event_name: document.getElementById('scheduledEventName').value,
        event_type: document.getElementById('scheduledEventType').value,
        frequency: document.getElementById('scheduledFrequency').value,
        start_time: document.getElementById('scheduledStartTime').value,
        end_time: document.getElementById('scheduledEndTime').value,
        visibility: document.getElementById('scheduledVisibility').value,
        description: document.getElementById('scheduledDescription').value,
        location: location
    };

    // Add frequency-specific fields
    if (formData.frequency === 'Once') {
        // One-time event: use specific date
        formData.specific_date = document.getElementById('scheduledSpecificDate').value;
        formData.end_date = formData.specific_date; // Same as event date
    } else {
        // Recurring event: use day of week and end date
        formData.day_of_week = document.getElementById('scheduledDayOfWeek').value;
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
            // Show success message
            messageDiv.textContent = data.message;
            messageDiv.className = 'form-message success';
            messageDiv.style.display = 'block';

            setTimeout(() => {
                closeCreateScheduledEventModal();

                // Reload team details if function exists
                if (typeof selectTeam === 'function') {
                    selectTeam(teamId);
                }
            }, 1500);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        // Show error message
        messageDiv.textContent = error.message || 'Failed to create scheduled event';
        messageDiv.className = 'form-message error';
        messageDiv.style.display = 'block';

        // Reset button state
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

// ============================================
// VIEW SCHEDULE MODAL
// ============================================

/**
 * Open schedule details modal in view mode
 * Displays full information about a specific schedule
 *
 * @param {number} scheduleId - ID of the schedule to display
 */
async function openScheduleModal(scheduleId) {
    const schedule = ScheduleState.findSchedule(scheduleId) ||
                     currentSchedules.find(s => s.schedule_id === scheduleId);

    if (!schedule) {
        console.error('Schedule not found:', scheduleId);
        return;
    }

    const modal = document.getElementById('scheduleDetailsModal');
    if (!modal) {
        console.error('Schedule details modal not found');
        return;
    }

    // Set modal title
    document.getElementById('scheduleModalTitle').textContent = schedule.event_name;

    // Handle game icon in header
    renderGameIcon(schedule);

    // Build modal body content
    renderScheduleDetails(schedule);

    // Configure action buttons (edit/delete) based on permissions
    await configureScheduleButtons(scheduleId);

    // Show modal
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Render game icon in modal header
 * @param {Object} schedule - Schedule object with game info
 */
function renderGameIcon(schedule) {
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
}

/**
 * Render schedule details in modal body
 * @param {Object} schedule - Schedule object
 */
function renderScheduleDetails(schedule) {
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
}

/**
 * Configure edit and delete buttons based on user permissions
 * @param {number} scheduleId - Schedule ID for button actions
 */
async function configureScheduleButtons(scheduleId) {
    const editBtn = document.getElementById('editScheduleBtn');
    const deleteBtn = document.getElementById('deleteScheduleBtn');
    const isAdmin = window.userPermissions?.is_admin || window.userPermissions?.is_developer || false;
    const isGM = window.userPermissions?.is_gm || false;

    // Get the schedule data
    const schedule = ScheduleState.findSchedule(scheduleId) ||
                     currentSchedules.find(s => s.schedule_id === scheduleId);

    if (!schedule) {
        if (editBtn) editBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
        return;
    }

    // Edit button - GMs/Admins can always edit
    const canModify = isAdmin || isGM;
    if (editBtn) {
        editBtn.style.display = canModify ? 'flex' : 'none';
        editBtn.onclick = () => openEditScheduleMode(scheduleId);
    }

    // Delete button - time-based permissions for GMs managing this game
    if (deleteBtn) {
        const canDelete = await canUserDeleteSchedule(schedule);

        if (canDelete) {
            const timeRemaining = getScheduleDeletionTimeRemaining(schedule.created_at);

            if (timeRemaining) {
                deleteBtn.title = `Delete schedule (${timeRemaining})`;
            } else {
                deleteBtn.title = 'Delete schedule';
            }

            deleteBtn.style.display = 'flex';
            deleteBtn.onclick = () => confirmDeleteSchedule(scheduleId);
        } else {
            deleteBtn.style.display = 'none';
        }
    }
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

// ============================================
// EDIT SCHEDULE MODAL
// ============================================

/**
 * Switch schedule modal to edit mode
 * Replaces view content with editable form
 *
 * @param {number} scheduleId - ID of schedule to edit
 */
function openEditScheduleMode(scheduleId) {
    const schedule = ScheduleState.findSchedule(scheduleId) ||
                     currentSchedules.find(s => s.schedule_id === scheduleId);

    if (!schedule) {
        console.error('Schedule not found:', scheduleId);
        return;
    }

    const modalBody = document.getElementById('scheduleModalBody');
    const eventTypeClass = schedule.event_type.toLowerCase();

    // Determine if location is a preset or custom
    const presetLocations = [
        'Campus Center',
        'Campus Center Coffee House',
        'Campus Center Event Room',
        'D-108',
        'Esports Lab (Commons Building 80)',
        'Lakeside Lodge',
        'Online'
    ];
    const isCustomLocation = !presetLocations.includes(schedule.location);

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
                    <option value="other" ${isCustomLocation ? 'selected' : ''}>Other</option>
                </select>
            </div>

            <div class="form-group" id="editCustomLocationGroup" style="display: ${isCustomLocation ? 'block' : 'none'};">
                <label for="editCustomLocation">Custom Location</label>
                <input type="text"
                       id="editCustomLocation"
                       name="custom_location"
                       value="${isCustomLocation ? schedule.location : ''}">
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

    // Attach location dropdown handler
    setupEditLocationHandler();

    // Attach form submit handler
    document.getElementById('editScheduleForm').addEventListener('submit', handleEditScheduleSubmit);

    // Hide edit/delete buttons while in edit mode
    document.getElementById('editScheduleBtn').style.display = 'none';
    document.getElementById('deleteScheduleBtn').style.display = 'none';
}

/**
 * Setup location dropdown handler for edit form
 * Shows/hides custom location input based on selection
 */
function setupEditLocationHandler() {
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
}

/**
 * Cancel edit mode and return to view mode
 * @param {number} scheduleId - Schedule ID to reload in view mode
 */
function cancelEditSchedule(scheduleId) {
    openScheduleModal(scheduleId);
}

/**
 * Handle edit schedule form submission
 * Updates schedule with new values
 *
 * @param {Event} event - Form submit event
 */
async function handleEditScheduleSubmit(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    const messageDiv = document.getElementById('editScheduleMessage');

    // Set loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
    messageDiv.style.display = 'none';

    // Get schedule ID and location
    const scheduleId = document.getElementById('editScheduleId').value;
    const locationSelect = document.getElementById('editScheduleLocation');
    const customLocationInput = document.getElementById('editCustomLocation');
    const location = locationSelect.value === 'other'
        ? customLocationInput.value
        : locationSelect.value;

    // Build update data object
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
            // Show success message
            messageDiv.textContent = data.message;
            messageDiv.className = 'form-message success';
            messageDiv.style.display = 'block';

            setTimeout(() => {
                closeScheduleModal();

                // Reload the schedule tab if function exists
                if (typeof loadScheduleTab === 'function' && currentSelectedTeamId) {
                    loadScheduleTab(currentSelectedTeamId);
                }
            }, 1500);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        // Show error message
        messageDiv.textContent = error.message || 'Failed to update schedule';
        messageDiv.className = 'form-message error';
        messageDiv.style.display = 'block';

        // Reset button state
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

// ============================================
// DELETE SCHEDULE
// ============================================

/**
 * Check if current user can delete a schedule
 * @param {Object} schedule - Schedule object with game_id and created_at
 * @returns {boolean} True if user can delete
 */
async function canUserDeleteSchedule(schedule) {
    const is_developer = window.userPermissions?.is_developer || false;
    const sessionUserId = window.currentUserId || 0;

    // Developers can always delete
    if (is_developer) {
        return true;
    }

    // Check if within 24-hour window
    if (!schedule.created_at) {
        return false;
    }

    const createdAt = new Date(schedule.created_at);
    const now = new Date();
    const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);
    const within24Hours = hoursSinceCreation <= 24;

    if (!within24Hours) {
        return false;
    }

    // Check if user is the GM for this game
    try {
        const response = await fetch(`/api/user/${sessionUserId}/manages-game/${schedule.game_id}`);
        const data = await response.json();

        if (data.success && data.manages_game) {
            return true;
        }
    } catch (error) {
        console.error('Error checking GM status:', error);
        return false;
    }

    return false;
}

/**
 * Get time remaining for deletion window
 * @param {string} createdAt - ISO timestamp of creation
 * @returns {string|null} Human-readable time remaining or null if expired
 */
function getScheduleDeletionTimeRemaining(createdAt) {
    if (!createdAt) return null;

    const created = new Date(createdAt);
    const now = new Date();
    const deletionDeadline = new Date(created.getTime() + (24 * 60 * 60 * 1000));

    if (now >= deletionDeadline) {
        return null; // Window expired
    }

    const msRemaining = deletionDeadline - now;
    const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hoursRemaining > 0) {
        return `${hoursRemaining}h ${minutesRemaining}m remaining`;
    } else {
        return `${minutesRemaining}m remaining`;
    }
}

/**
 * Confirm schedule deletion with user
 * Uses universal delete modal system
 */
function confirmDeleteSchedule(scheduleId) {
    const schedule = ScheduleState.findSchedule(scheduleId) ||
                     currentSchedules.find(s => s.schedule_id === scheduleId);

    if (!schedule) {
        console.error('Schedule not found');
        return;
    }

    ScheduleState.pendingDeleteScheduleId = scheduleId;

    const timeRemaining = getScheduleDeletionTimeRemaining(schedule.created_at);

    // Build additional info
    let additionalInfo = '<br><br>All events created by this schedule will be deleted as well.';

    if (timeRemaining) {
        additionalInfo += `
            <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(251, 191, 36, 0.1);
                        border: 1px solid #fbbf24; border-radius: 6px; font-size: 0.875rem;">
                <i class="fas fa-clock" style="color: #fbbf24;"></i>
                <strong style="color: #fbbf24;">Deletion window:</strong> ${timeRemaining}
            </div>
        `;
    }

    // Open universal modal
    window.openDeleteConfirmModal({
        title: 'Delete Schedule?',
        itemName: schedule.event_name,
        message: `Are you sure you want to delete "${schedule.event_name}"?`,
        additionalInfo: additionalInfo,
        buttonText: 'Delete Schedule',
        onConfirm: confirmDeleteScheduleAction,
        itemId: scheduleId
    });
}

/**
 * Execute the schedule deletion (called by universal modal)
 */
async function confirmDeleteScheduleAction(scheduleId) {
    try {
        const response = await fetch(`/api/scheduled-events/${scheduleId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            window.closeDeleteConfirmModal();
            closeScheduleModal();

            // Show success message
            const successDiv = document.createElement('div');
            successDiv.className = 'events-info-message';
            successDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; background: #10b981; border-color: #10b981; color: white;';
            successDiv.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <p>${data.message}</p>
            `;
            document.body.appendChild(successDiv);

            setTimeout(() => {
                successDiv.remove();
                if (typeof loadScheduleTab === 'function' && currentSelectedTeamId) {
                    loadScheduleTab(currentSelectedTeamId);
                }
            }, 2000);
        } else {
            handleScheduleDeleteError(data.message);
        }
    } catch (error) {
        console.error('Error deleting schedule:', error);
        alert('Failed to delete schedule. Please try again.');
        window.closeDeleteConfirmModal();
    }
}

/**
 * Handle schedule delete errors
 */
function handleScheduleDeleteError(message) {
    if (message.includes('expired') || message.includes('24')) {
        alert(`⏰ ${message}\n\nOnly developers can delete schedules after 24 hours.`);
    } else if (message.includes('creator') || message.includes('Manager')) {
        alert(`🚫 ${message}`);
    } else {
        alert('Error: ' + message);
    }
    window.closeDeleteConfirmModal();
}

// ============================================
// GLOBAL EXPORTS
// ============================================
// Export functions to window object for HTML onclick handlers

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

//Deletion
window.canUserDeleteSchedule = canUserDeleteSchedule;
window.getScheduleDeletionTimeRemaining = getScheduleDeletionTimeRemaining;
window.confirmDeleteSchedule = confirmDeleteSchedule;
window.confirmDeleteScheduleAction = confirmDeleteScheduleAction;