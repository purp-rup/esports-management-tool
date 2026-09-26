/**
 * ============================================
 * SCHEDULED-EVENTS.JS
 * ============================================
 *
 * Manages recurring scheduled events for teams
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
    currentTeamId: null,
    currentGameId: null,
    currentSchedules: [],
    pendingDeleteScheduleId: null,
    isCaptainOnly: false,

    // Reset state to defaults
    reset() {
        this.currentTeamId = null;
        this.currentGameId = null;
        this.currentSchedules = [];
        this.pendingDeleteScheduleId = null;
        this.isCaptainOnly = false;
    },

    // Set current context
    setContext(teamId, gameId) {
        this.currentTeamId = teamId;
        this.currentGameId = gameId;
    },

    // Find schedule by ID
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
        createForm.addEventListener('submit', handleScheduleSubmit);
    }
});

/**
 * Initialize schedule button visibility based on team selection
 * Shows "Schedule Event" button only if user is GM for the team's game
 */
async function initScheduleButton(teamId, gameId) {
    // Update state
    ScheduleState.setContext(teamId, gameId);
    currentScheduleTeamId = teamId;
    currentScheduleGameId = gameId;

    const createScheduleBtn = document.getElementById('createScheduleBtn');
    if (!createScheduleBtn) {
        return;
    }

    // Check if season is active
    const isActiveSeason = window.currentTeamSeasonIsActive === 1;
    if (!isActiveSeason) {
        console.log('Team is from a past season - hiding schedule button');
        createScheduleBtn.style.display = 'none';
        return;
    }

    if (!teamId || !gameId) {
        createScheduleBtn.style.display = 'none';
        return;
    }

    // Check if this user is allowed to schedule for THIS specific team
    // (admin, developer, GM of this game, or captain of this team)
    try {
        const userId = window.currentUserId;

        const response = await fetch(`/api/user/${userId}/can-schedule/${teamId}`);
        const data = await response.json();

        if (data.success && data.can_schedule) {
            createScheduleBtn.style.display = 'flex';
            ScheduleState.isCaptainOnly = !!data.is_captain_only;

            // Update visibility dropdown labels with team/game names
            await updateVisibilityLabels(teamId, gameId);
        } else {
            createScheduleBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking schedule permission:', error);
        createScheduleBtn.style.display = 'none';
    }
}

// ============================================
// DATA LOADING & API CALLS
// ============================================

// Load all schedules for a specific team
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
        const response = await fetch(`/api/schedules/team/${teamId}`);
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

// Update visibility dropdown labels with team and game names
async function updateVisibilityLabels(teamId, ids = {}) {
    const {
        teamOptionId      = 'visibilityTeamOption',
        playersOptionId   = 'visibilityPlayersOption',
        communityOptionId = 'visibilityCommunityOption',
        allTeamsOptionId  = 'visibilityAllTeamsOption',
        displaySelector   = null   // only needed when a value is already shown, e.g. Edit mode
    } = ids;

    try {
        const response = await fetch(`/api/teams/${teamId}/details`);
        const data = await response.json();

        if (data.success) {
            const teamName = data.team.title;
            const gameName = data.team.game_title;

            const teamOption      = document.getElementById(teamOptionId);
            const playersOption   = document.getElementById(playersOptionId);
            const communityOption = document.getElementById(communityOptionId);
            const allTeamsOption  = document.getElementById(allTeamsOptionId);

            if (teamOption)      teamOption.textContent = `${teamName} only`;
            if (playersOption)   playersOption.textContent = `Players for ${gameName}`;
            if (communityOption) communityOption.textContent = `Community Members for ${gameName}`;
            if (allTeamsOption)  allTeamsOption.textContent = `All Teams for ${gameName}`;

            // If a value is already on display (edit mode), refresh it too,
            // in case it was painted from a placeholder name before this resolved
            if (displaySelector) {
                const activeOption = [teamOption, playersOption, communityOption, allTeamsOption]
                    .find(opt => opt?.classList.contains('active'));
                const textSpan = document.querySelector(displaySelector);
                if (activeOption && textSpan) textSpan.textContent = activeOption.textContent;
            }
        }
    } catch (error) {
        console.error('Error updating visibility labels:', error);
    }
}

// ============================================
// RENDERING FUNCTIONS
// ============================================

// Render schedule cards
function renderScheduleCards(schedules) {
    const schedulePanel = document.getElementById('scheduleTabContent');

    let html = '<div class="schedule-cards-grid">';

    schedules.forEach(schedule => {
        const eventTypeClass = schedule.event_type.toLowerCase();
        const isOnce = schedule.frequency === 'Once';
        const isMatch = schedule.event_type === 'Match';
        const occurrenceText = buildScheduleOccurrenceText(schedule);

        html += `
            <div class="schedule-card type-${eventTypeClass}"
                data-schedule-id="${schedule.schedule_id}"
                onclick="toggleScheduleCardExpand(${schedule.schedule_id})"
                onmouseenter="loadScheduleCardEventCount(${schedule.schedule_id})">

                <div class="schedule-card-top-row">
                    <h4 class="schedule-card-title">${schedule.event_name}</h4>
                    <div class="schedule-card-top-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon-action btn-icon-edit schedule-card-edit-btn"
                                style="display:none;"
                                onclick="openEditScheduleMode(${schedule.schedule_id})"
                                title="Edit schedule">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon-action btn-icon-delete schedule-card-delete-btn"
                                style="display:none;"
                                onclick="confirmDeleteSchedule(${schedule.schedule_id})"
                                title="Delete schedule">
                            <i class="fas fa-trash"></i>
                        </button>
                        <span class="schedule-type-badge ${eventTypeClass}">${schedule.event_type}</span>
                    </div>
                </div>

                <div class="schedule-card-details">
                    <div class="schedule-card-detail">
                        <i class="fas fa-redo"></i>
                        <span>${occurrenceText}</span>
                    </div>

                    <div class="schedule-card-detail">
                        <i class="fas fa-eye"></i>
                        <span>${buildVisibilityText(schedule)}</span>
                    </div>

                    <div class="schedule-card-detail">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${schedule.location || 'TBD'}</span>
                    </div>

                    ${isMatch ? `
                        <div class="schedule-card-detail">
                            <i class="fas fa-trophy"></i>
                            <span>${schedule.league_name || 'No league assigned'}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="schedule-card-expand">
                    <div class="schedule-card-detail">
                        <i class="fas fa-info-circle"></i>
                        <span>${schedule.description || 'No description provided'}</span>
                    </div>
                </div>
                
                ${!isOnce ? `
                    <div class="schedule-event-count" id="scheduleEventCount-${schedule.schedule_id}">
                        <i class="fas fa-calendar-check"></i> Loading&hellip;
                    </div>
                ` : ''}

                <i class="fas fa-chevron-down schedule-card-chevron"></i>
            </div>
        `;
    });

    html += '</div>'; 

    schedulePanel.innerHTML = `
        <div class="schedule-panel-grid">
            <div class="schedule-cards-column">${html}</div>
            ${renderScheduleWeekPanel()}
        </div>
    `;

    schedules.forEach(schedule => configureScheduleCardButtons(schedule));

    // Auto-open today's events in the weekly panel on load
    const todayStr = formatDateISO(new Date());
    const weekDates = getCurrentScheduleWeekDates();
    const todayIndex = weekDates.findIndex(d => formatDateISO(d) === todayStr);
    if (todayIndex !== -1) {
        selectScheduleWeekDay(todayStr, todayIndex);
    }
}

function toggleScheduleCardExpand(scheduleId) {
    const card = document.querySelector(`.schedule-card[data-schedule-id="${scheduleId}"]`);
    if (card) card.classList.toggle('expanded');
}

async function loadScheduleCardEventCount(scheduleId) {
    const el = document.getElementById(`scheduleEventCount-${scheduleId}`);
    if (!el || el.dataset.loaded) return;
    el.dataset.loaded = '1';
    const count = await fetchScheduleEventCount(scheduleId);
    el.innerHTML = `<i class="fas fa-calendar-check"></i> ${count} ${count === 1 ? 'event' : 'events'}`;
}


// ============================================
// WEEKLY ROTATING VIEW
// ============================================

function getCurrentScheduleWeekDates() {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    sunday.setHours(0, 0, 0, 0);

    const week = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        week.push(d);
    }
    return week;
}

function formatDateISO(date) {
    return date.toISOString().split('T')[0];
}

function getSchedulesForDate(dateStr, dayName) {
    return ScheduleState.currentSchedules.filter(schedule => {
        if (schedule.frequency === 'Once') {
            return schedule.specific_date === dateStr;
        }
        const withinRange = !schedule.schedule_end_date || dateStr <= schedule.schedule_end_date;
        return withinRange && schedule.day_of_week_name === dayName;
    });
}

function renderScheduleWeekPanel() {
    const weekDates = getCurrentScheduleWeekDates();
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const todayStr = formatDateISO(new Date());

    const monthLabel = monthNames[weekDates[0].getMonth()];

    let columnsHTML = '';
    weekDates.forEach((date, index) => {
        const dateStr = formatDateISO(date);
        const dayName = dayNames[index];
        const hasEvents = getSchedulesForDate(dateStr, dayName).length > 0;
        const isToday = dateStr === todayStr;

        columnsHTML += `
            <div class="schedule-week-day-column">
                <div class="schedule-week-day-label">${dayName.slice(0, 3)}</div>
                <div class="schedule-week-day-circle ${isToday ? 'today' : ''}"
                     data-date="${dateStr}"
                     onclick="selectScheduleWeekDay('${dateStr}', ${index})">
                    ${date.getDate()}
                </div>
                <div class="schedule-week-day-dot ${hasEvents ? 'visible' : ''}"></div>
            </div>
        `;
    });

    return `
        <div class="schedule-week-panel">
            <div class="schedule-week-top-spacer"></div>
            <div class="schedule-week-popup-row" id="scheduleWeekPopupRow"></div>
            <div class="schedule-week-anchor">
                <div class="schedule-week-track">
                    <div class="schedule-week-line"></div>
                    ${columnsHTML}
                </div>
                <div class="schedule-week-month-label">${monthLabel}</div>
            </div>
            <div class="schedule-week-bottom-spacer"></div>
        </div>
    `;
}

function selectScheduleWeekDay(dateStr, columnIndex) {
    document.querySelectorAll('.schedule-week-day-circle').forEach(el => {
        el.classList.toggle('active', el.dataset.date === dateStr);
    });

    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const eventsForDay = getSchedulesForDate(dateStr, dayNames[columnIndex]);
    const popupRow = document.getElementById('scheduleWeekPopupRow');
    if (!popupRow) return;

    if (eventsForDay.length === 0) {
        popupRow.innerHTML = '';
        return;
    }

    popupRow.innerHTML = eventsForDay.map(schedule => {
        const eventTypeClass = schedule.event_type.toLowerCase();
        const leagueLine = schedule.event_type === 'Match' ? `
            <div class="schedule-week-event-line"><i class="fas fa-trophy"></i><span>${schedule.league_name || 'No league'}</span></div>
        ` : '';

        return `
            <div class="schedule-week-event-card type-${eventTypeClass}"
                onclick="navigateToEventsTab(${schedule.schedule_id}, '${dateStr}')">
                <div class="schedule-week-event-title">${schedule.event_name}</div>
                <div class="schedule-week-event-line"><i class="fas fa-clock"></i><span>${schedule.start_time}</span></div>
                <div class="schedule-week-event-line"><i class="fas fa-map-marker-alt"></i><span>${schedule.location || 'TBD'}</span></div>
                ${leagueLine}
            </div>
        `;
    }).join('');
}


async function navigateToEventsTab(scheduleId, dateStr) {
    const eventsTabButton = document.querySelector('[data-tab="events"]');
    if (!eventsTabButton) {
        console.warn('Events tab button not found');
        return;
    }

    let eventId = null;
    try {
        const response = await fetch(`/api/schedule/${scheduleId}/event-on-date?date=${dateStr}`);
        const data = await response.json();
        if (data.success) eventId = data.event_id;
    } catch (error) {
        console.error('Error resolving event for schedule click:', error);
    }

    eventsTabButton.click();

    if (!eventId) return;

    let attempts = 0;
    const tryOpen = () => {
        const container = document.getElementById('eventsContainer');
        if (container && container.style.display !== 'none' && typeof window.openEventDetailPanel === 'function') {
            window.openEventDetailPanel(eventId);
        } else if (attempts < 30) {
            attempts++;
            setTimeout(tryOpen, 150);
        }
    };
    setTimeout(tryOpen, 200);
}

async function configureScheduleCardButtons(schedule) {
    const card = document.querySelector(`.schedule-card[data-schedule-id="${schedule.schedule_id}"]`);
    if (!card) return;

    const editBtn = card.querySelector('.schedule-card-edit-btn');
    const deleteBtn = card.querySelector('.schedule-card-delete-btn');

    const isActiveSeason = window.currentTeamSeasonIsActive === 1;
    const isDeveloper = window.userPermissions?.is_developer || false;
    const teamId = schedule.team_id || ScheduleState.currentTeamId || currentScheduleTeamId;

    // Edit button - only for active seasons, and only for users allowed to
    // schedule for this specific team (admin, developer, GM of this game,
    // or captain of this team). Captains may only edit schedules they
    // created themselves, matching the backend rule in /api/schedule/update.
    const editPermission = await canUserScheduleForTeam(teamId);
    const isOwnSchedule = Number(schedule.created_by) === Number(window.currentUserId);
    const canEdit = editPermission.can_schedule
        && (!editPermission.is_captain_only || isOwnSchedule)
        && isActiveSeason;
    if (editBtn) {
        editBtn.style.display = canEdit ? 'flex' : 'none';
    }

    // Delete button - time-based permissions for GMs managing this game
    if (deleteBtn) {
        let canDelete = false;

        if (isDeveloper) {
            canDelete = true;
        } else if (isActiveSeason) {
            canDelete = await canUserDeleteSchedule(schedule);
        }

        if (canDelete) {
            const timeRemaining = getScheduleDeletionTimeRemaining(schedule.created_at);
            deleteBtn.title = timeRemaining ? `Delete schedule (${timeRemaining})` : 'Delete schedule';
            deleteBtn.style.display = 'flex';
        } else {
            deleteBtn.style.display = 'none';
        }
    }
}
// ============================================
// CREATE SCHEDULE MODAL
// ============================================

// Open the create schedule modal
function openCreateScheduleModal() {
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

    const leagueGroup = document.getElementById('scheduledLeagueGroup');
    const dayOfWeekGroup = document.getElementById('scheduledDayOfWeekGroup');
    const specificDateGroup = document.getElementById('scheduledSpecificDateGroup');
    const endDateGroup = document.querySelector('label[for="scheduledEndDate"]')?.parentElement;

    if (leagueGroup) leagueGroup.style.display = 'none';
    if (dayOfWeekGroup) dayOfWeekGroup.style.display = 'block';
    if (specificDateGroup) specificDateGroup.style.display = 'none';
    if (endDateGroup) endDateGroup.style.display = 'flex';

    // Re-show all visibility options in case a previous session
    // hid them for a Match event
    const playersOption = document.getElementById('visibilityPlayersOption');
    const communityOption = document.getElementById('visibilityCommunityOption');
    const allTeamsOption = document.getElementById('visibilityAllTeamsOption');
    if (playersOption)   playersOption.style.display = '';
    if (communityOption) communityOption.style.display = '';
    if (allTeamsOption)  allTeamsOption.style.display = 'none'; // only shown once Match is selected

    const visibilityTrigger = document.querySelector('#scheduledVisibilityTagBox .tag-select-trigger');
    visibilityTrigger?.classList.remove('locked-select');

    const dayOfWeekSelect = document.getElementById('scheduledDayOfWeek');
    const specificDateInput = document.getElementById('scheduledSpecificDate');
    const endDateInput = document.getElementById('scheduledEndDate');

    if (dayOfWeekSelect) dayOfWeekSelect.setAttribute('required', 'required');
    if (specificDateInput) specificDateInput.removeAttribute('required');
    if (endDateInput) endDateInput.setAttribute('required', 'required');

    // Update visibility labels before showing modal
    const teamId = ScheduleState.currentTeamId || currentScheduleTeamId;
    const gameId = ScheduleState.currentGameId || currentScheduleGameId;
    updateVisibilityLabels(teamId);

    // Reset all custom combo dropdowns back to their placeholders
    ['scheduledEventType', 'scheduledFrequency', 'scheduledLocation',
     'scheduledDayOfWeek', 'scheduledVisibility', 'scheduledLeagueSelect'].forEach(key => {
        if (typeof resetComboSelector === 'function') resetComboSelector(key);
    });

    // Clear loaded flag so leagues reload fresh for each modal open
    const leaguePanel = document.getElementById('scheduledLeaguePanel');
    if (leaguePanel) leaguePanel.dataset.loaded = '';
    // Note: change handlers are now triggered via onSelect in SingleSelectConfig

    // Apply visibility lock immediately if this user is a team captain,
    // rather than waiting for an event type to be selected
    handleEventTypeChangeForVisibility();

    // Character Counter
    attachCharacterCounter('scheduledDescription', 250);

    // Show modal
    modal.style.display = 'block';
    lockBodyScroll('createScheduledEventModal');
}

// Close create schedule modal
function closeCreateScheduleModal() {
    const modal = document.getElementById('createScheduledEventModal');
    setElementDisplay(modal, 'none');
    unlockBodyScroll('createScheduledEventModal');
}

// Handle frequency dropdown change
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
        specificDateGroup.style.display = 'flex';
        endDateGroup.style.display = 'none';

        // Update required attributes
        dayOfWeekSelect.removeAttribute('required');
        specificDateInput.setAttribute('required', 'required');
        endDateInput.removeAttribute('required');
    } else {
        // Recurring event: show day of week and end date
        dayOfWeekGroup.style.display = 'block';
        specificDateGroup.style.display = 'none';
        endDateGroup.style.display = 'flex';

        // Update required attributes
        dayOfWeekSelect.setAttribute('required', 'required');
        specificDateInput.removeAttribute('required');
        endDateInput.setAttribute('required', 'required');
    }
}

// Build dynamic frequency text based on schedule settings
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

function getOrdinalWeekOfMonth(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const weekNumber = Math.floor((date.getDate() - 1) / 7) + 1;
    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth'];
    return ordinals[weekNumber - 1] || `${weekNumber}th`;
}

function formatScheduleDateLong(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const monthNames = ['January','February','March','April','May','June',
                         'July','August','September','October','November','December'];
    return `${monthNames[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

function buildScheduleOccurrenceText(schedule) {
    const timeRange = `${schedule.start_time} to ${schedule.end_time}`;

    if (schedule.frequency === 'Once') {
        return `${formatScheduleDateLong(schedule.specific_date)}, from ${timeRange}`;
    }
    if (schedule.frequency === 'Weekly') {
        return `Every ${schedule.day_of_week_name}, from ${timeRange}`;
    }
    if (schedule.frequency === 'Biweekly') {
        return `Every other ${schedule.day_of_week_name}, from ${timeRange}`;
    }
    if (schedule.frequency === 'Monthly') {
        const anchorDate = schedule.created_at ? schedule.created_at.split('T')[0] : null;
        const ordinal = anchorDate ? getOrdinalWeekOfMonth(anchorDate) : 'first';
        return `Every ${ordinal} ${schedule.day_of_week_name}, from ${timeRange}`;
    }
    return `${schedule.frequency} - ${schedule.day_of_week_name || 'N/A'}`;
}

// Build dynamic visibility text with game/team context
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

// Format visibility setting for display (fallback)
function formatVisibility(visibility) {
    const visibilityMap = {
        'team': 'Team Only',
        'game_players': 'Game Players',
        'game_community': 'Game Community',
    };
    return visibilityMap[visibility] || visibility;
}

function selectScheduledCustomLocation() {
    const hiddenInput = document.getElementById('scheduledLocation');
    const displayArea = document.getElementById('scheduledLocationDisplay');
    if (!hiddenInput || !displayArea) return;

    hiddenInput.value = '';
    displayArea.innerHTML = '';

    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'combo-custom-input';
    input.placeholder = 'Enter custom location';
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('input', () => { hiddenInput.value = input.value; });

    displayArea.appendChild(input);
    closeAllFilterPanels();
    input.focus();
}

// Handle create schedule form submission
async function handleScheduleSubmit(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');

    //Handle match league case
    const eventType = document.getElementById('scheduledEventType').value;
    const leagueSelect = document.getElementById('scheduledLeagueSelect');

    if (eventType === 'Match' && !leagueSelect?.value) {
        showDeleteErrorMessage('Please select a league for Match events.');
        leagueSelect?.focus();
        return;
    }

    // Hidden input always holds the correct value:
    // preset location string, or the typed custom value when 'Other' is selected
    const location = document.getElementById('scheduledLocation').value;

    // Set loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';

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

    //League select if match is selected
        if (eventType === 'Match' && leagueSelect?.value) {
        formData.league_id = parseInt(leagueSelect.value);
    }

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
        const response = await fetch('/api/schedule/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            // Reset button state
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';

            closeCreateScheduleModal();
            showDeleteSuccessMessage(data.message);

            // Reload team details if function exists
            if (typeof selectTeam === 'function') {
                selectTeam(teamId);
            }
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showDeleteErrorMessage(error.message || 'Failed to create scheduled event');

        // Reset button state
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

// ============================================
// VIEW SCHEDULE MODAL
// ============================================

// Fetch the count of events associated with a schedule (kept for the # of events hover)
async function fetchScheduleEventCount(scheduleId) {
    try {
        const response = await fetch(`/api/schedule/${scheduleId}/event-count`);
        const data = await response.json();

        if (data.success) {
            return data.count;
        }
        return 0;
    } catch (error) {
        console.error('Error fetching event count:', error);
        return 0;
    }
}

// Close schedule details modal
function closeScheduleModal() {
    const modal = document.getElementById('scheduleDetailsModal');
    if (modal) {
        modal.style.display = 'none';
        unlockBodyScroll('scheduleDetailsModal');
    }
}

// ============================================
// EDIT SCHEDULE MODAL
// ============================================
function openEditScheduleMode(scheduleId) {
    const schedule = ScheduleState.findSchedule(scheduleId) ||
                     currentSchedules.find(s => s.schedule_id === scheduleId);

    if (!schedule) {
        console.error('Schedule not found:', scheduleId);
        return;
    }

    const teamId = schedule.team_id || ScheduleState.currentTeamId || currentScheduleTeamId;
    
    if (!teamId) {
        console.error('Cannot determine team_id for schedule:', schedule);
        alert('Cannot edit schedule: missing team information');
        return;
    }
    const modal = document.getElementById('scheduleDetailsModal');
    const titleElement = document.getElementById('scheduleModalTitle');
    if (titleElement) titleElement.textContent = `Edit: ${schedule.event_name}`;
    const modalBody = document.getElementById('scheduleModalBody');
    const eventTypeClass = schedule.event_type.toLowerCase();

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
    const isMatch = schedule.event_type === 'Match';

    // Visibility is locked for Match events, and always locked for team
    // captains — captains can only ever manage their own team's visibility
    const isVisibilityLocked = isMatch || ScheduleState.isCaptainOnly;

    // Visibility copy mirrors the Create Schedule modal — real team/game
    // names instead of generic labels
    const teamName = schedule.team_name || 'This team';
    const gameName = schedule.game_title || 'the game';

    const visibilityDisplayText = schedule.visibility === 'game_players' ? `Players for ${gameName}`
        : schedule.visibility === 'game_community' ? `Community Members for ${gameName}`
        : `${teamName} only`;

    const visibilityOptionsHtml = `
        <div class="filter-box-item ${schedule.visibility === 'team' ? 'active' : ''}" id="editVisibilityTeamOption" onclick="event.stopPropagation(); selectComboValue('editScheduleVisibility', 'team', this.textContent)">${teamName} only</div>
        <div class="filter-box-item ${schedule.visibility === 'game_players' ? 'active' : ''}" id="editVisibilityPlayersOption" onclick="event.stopPropagation(); selectComboValue('editScheduleVisibility', 'game_players', this.textContent)">Players for ${gameName}</div>
        <div class="filter-box-item ${schedule.visibility === 'game_community' ? 'active' : ''}" id="editVisibilityCommunityOption" onclick="event.stopPropagation(); selectComboValue('editScheduleVisibility', 'game_community', this.textContent)">Community Members for ${gameName}</div>
    `;

    const visibilityTriggerAttrs = isVisibilityLocked
        ? 'class="tag-select-trigger locked-select"'
        : `class="tag-select-trigger" onclick="toggleFilterBox('editScheduleVisibilityPanel')"`;

    const locationOptionsHtml = presetLocations.map(loc => `
        <div class="filter-box-item ${schedule.location === loc ? 'active' : ''}" onclick="event.stopPropagation(); selectComboValue('editScheduleLocation', '${loc}', '${loc}')">${loc}</div>
    `).join('') + `
        <div class="filter-box-item ${isCustomLocation ? 'active' : ''}" onclick="event.stopPropagation(); selectComboValue('editScheduleLocation', 'other', 'Other')">Other</div>
    `;

    const locationDisplayHtml = isCustomLocation
        ? `<input type="text" class="combo-custom-input" value="${schedule.location}" placeholder="Enter custom location" onclick="event.stopPropagation();" oninput="document.getElementById('editScheduleLocation').value = this.value;">`
        : `<span class="combo-selected-text">${schedule.location || 'Select location'}</span>`;

    // Build edit form WITH league field support
    modalBody.innerHTML = `
        <form id="editScheduleForm" class="event-form-modal">
            <input type="hidden" id="editScheduleId" value="${scheduleId}">
            <input type="hidden" id="editScheduleTeamId" value="${teamId}">

            <div class="form-row form-row--paired">
                <div class="form-group">
                    <label class="required-field" for="editScheduleName">Event Name</label>
                    <input type="text"
                           id="editScheduleName"
                           name="event_name"
                           value="${schedule.event_name}"
                           required>
                </div>

                <div class="form-group">
                    <label class="required-field" for="editScheduleTypeTagBox">Event Type</label>
                    <div class="filter-box tag-select-box" id="editScheduleTypeTagBox">
                        <div class="tag-select-trigger locked-select">
                            <div id="editScheduleTypeDisplay" class="combo-select-display">
                                <span class="combo-selected-text">${schedule.event_type}</span>
                                <i class="fas fa-lock field-lock-icon"></i>
                            </div>
                            <i class="fas fa-chevron-down tag-select-arrow"></i>
                        </div>
                    </div>
                    <input type="hidden" id="editScheduleType" name="event_type" value="${schedule.event_type}">
                </div>
            </div>

            <!-- League field for Match events -->
            <div class="form-group" id="editScheduleLeagueGroup" style="display: ${schedule.event_type === 'Match' ? 'block' : 'none'};">
                <label for="editScheduleLeagueSelect" id="editScheduleLeagueLabel">
                    League ${schedule.event_type === 'Match' ? '<span style="color: #ff5252;">*</span>' : '(Optional)'}
                </label>
                <small style="color: var(--text-secondary); font-size: 0.8125rem; margin-top: 0.25rem; display: block;">
                    Select the league this match is part of
                </small>
                <select id="editScheduleLeagueSelect" name="league_id" ${schedule.event_type === 'Match' ? 'required' : ''}>
                    <option value="">Select a league</option>
                </select>
            </div>

            <div class="form-group">
                <label>Frequency</label>
                <div class="input-with-icon">
                    <input type="text" value="${buildFrequencyText(schedule)}" disabled>
                    <i class="fas fa-lock input-lock-icon"></i>
                </div>
            </div>

                    <label class="required-field" for="editScheduleVisibilityTagBox">Visibility</label>
                    <div class="filter-box tag-select-box" id="editScheduleVisibilityTagBox" ${isVisibilityLocked ? 'title="Visibility cannot be changed."' : ''}>
                        <div ${visibilityTriggerAttrs}>
                            <div id="editScheduleVisibilityDisplay" class="combo-select-display">
                                <span class="combo-selected-text">${visibilityDisplayText}</span>
                                ${isVisibilityLocked ? '<i class="fas fa-lock field-lock-icon"></i>' : ''}
                            </div>
                            <i class="fas fa-chevron-down tag-select-arrow"></i>
                        </div>
                        ${isVisibilityLocked ? '' : `<div class="filter-box-panel tag-select-panel" id="editScheduleVisibilityPanel">${visibilityOptionsHtml}</div>`}
                    </div>
                    <input type="hidden" id="editScheduleVisibility" name="visibility" value="${isMatch ? 'team' : schedule.visibility}">
                </div>

                <div class="form-group">
                    <label class="required-field" for="editScheduleLocationTagBox">Location</label>
                    <div class="filter-box tag-select-box" id="editScheduleLocationTagBox">
                        <div class="tag-select-trigger" onclick="toggleFilterBox('editScheduleLocationPanel')">
                            <div id="editScheduleLocationDisplay" class="combo-select-display">
                                ${locationDisplayHtml}
                            </div>
                            <i class="fas fa-chevron-down tag-select-arrow"></i>
                        </div>
                        <div class="filter-box-panel tag-select-panel" id="editScheduleLocationPanel">
                            ${locationOptionsHtml}
                        </div>
                    </div>
                    <input type="hidden" id="editScheduleLocation" name="location" value="${schedule.location}">
                </div>
            </div>

            <div class="form-group">
                <label for="editScheduleDescription">Description</label>
                <textarea id="editScheduleDescription"
                          name="description"
                          rows="3">${schedule.description || ''}</textarea>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeScheduleModal()">
                    Cancel
                </button>
                <button type="submit" class="btn btn-primary">
                    <span class="btn-text">Save Changes</span>
                    <i class="btn-spinner fas fa-spinner fa-spin" style="display: none;"></i>
                </button>
            </div>
        </form>
    `;

    // Load leagues using team_id from schedule or context
    if (schedule.event_type === 'Match' && teamId) {
        console.log('Loading leagues for team_id:', teamId, 'current league:', schedule.league_id);
        loadEditScheduleLeagues(teamId, schedule.league_id);
    }

    // Load real team/game names for the visibility dropdown
    if (!isVisibilityLocked && teamId) {
        updateVisibilityLabels(teamId, {
            teamOptionId:      'editVisibilityTeamOption',
            playersOptionId:   'editVisibilityPlayersOption',
            communityOptionId: 'editVisibilityCommunityOption',
            displaySelector:   '#editScheduleVisibilityDisplay .combo-selected-text'
        });
    }

    // Attach form submit handler
    document.getElementById('editScheduleForm').addEventListener('submit', handleEditScheduleSubmit);

    // Character Counter
    attachCharacterCounter('editScheduleDescription', 250);

    // Show modal
    modal.style.display = 'block';
    lockBodyScroll('scheduleDetailsModal');
}

// Load leagues for edit modal
async function loadEditScheduleLeagues(teamId, currentLeagueId) {
    const leagueSelect = document.getElementById('editScheduleLeagueSelect');
    
    if (!leagueSelect) {
        console.warn('Edit league select not found');
        return;
    }
    
    leagueSelect.innerHTML = '<option value="">Loading leagues...</option>';
    leagueSelect.disabled = true;
    
    try {
        const response = await fetch(`/api/teams/${teamId}/leagues`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Clear and rebuild dropdown
        leagueSelect.innerHTML = '';
        
        if (data.success && data.leagues) {
            leagueSelect.innerHTML = '<option value="">Select a league</option>';
            
            if (data.leagues.length === 0) {
                const noLeaguesOption = document.createElement('option');
                noLeaguesOption.value = '';
                noLeaguesOption.textContent = 'No leagues assigned to team';
                noLeaguesOption.disabled = true;
                leagueSelect.appendChild(noLeaguesOption);
            } else {
                data.leagues.forEach(league => {
                    const option = document.createElement('option');
                    option.value = league.id;
                    option.textContent = league.name;
                    
                    // Select current league if provided
                    if (currentLeagueId && league.id === currentLeagueId) {
                        option.selected = true;
                    }
                    
                    leagueSelect.appendChild(option);
                });
            }
        } else {
            leagueSelect.innerHTML = '<option value="">Error loading leagues</option>';
            console.error('Failed to load leagues:', data);
        }
    } catch (error) {
        console.error('Error loading edit schedule leagues:', error);
        leagueSelect.innerHTML = '<option value="">Error loading leagues</option>';
    } finally {
        leagueSelect.disabled = false;
    }
}

// Cancel edit mode and return to view mode
function cancelEditSchedule(scheduleId) {
    openScheduleModal(scheduleId);
}

// Handle edit schedule form submission
async function handleEditScheduleSubmit(event) {
    event.preventDefault();

    const eventType = document.getElementById('editScheduleType').value;
    const leagueSelect = document.getElementById('editScheduleLeagueSelect');

    // Validate league selection for Match events
    if (eventType === 'Match' && !leagueSelect.value) {
        showDeleteErrorMessage('Please select a league for this match event.');
        leagueSelect.focus();
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');

    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';

    const scheduleId = document.getElementById('editScheduleId').value;
    const teamId = document.getElementById('editScheduleTeamId').value;
    const location = document.getElementById('editScheduleLocation').value;

    const formData = {
        schedule_id: scheduleId,
        team_id: teamId,
        event_name: document.getElementById('editScheduleName').value,
        event_type: eventType,
        visibility: (eventType === 'Match' || ScheduleState.isCaptainOnly) ? 'team' : document.getElementById('editScheduleVisibility').value,
        location: location,
        description: document.getElementById('editScheduleDescription').value
    };

    // Add league_id for Match events
    if (eventType === 'Match' && leagueSelect.value) {
        formData.league_id = parseInt(leagueSelect.value);
    }

    try {
        const response = await fetch('/api/schedule/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';

            closeScheduleModal();
            showDeleteSuccessMessage(data.message);

            if (typeof loadScheduleTab === 'function' && currentSelectedTeamId) {
                loadScheduleTab(currentSelectedTeamId);
            }
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showDeleteErrorMessage(error.message || 'Failed to update schedule');

        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

// ============================================
// DELETE SCHEDULE
// ============================================

// Check if the current user is allowed to schedule for a given team
// (admin, developer, GM of that game, or captain of that team)
async function canUserScheduleForTeam(teamId) {
    if (!teamId) {
        return { can_schedule: false, is_captain_only: false };
    }

    try {
        const userId = window.currentUserId;
        const response = await fetch(`/api/user/${userId}/can-schedule/${teamId}`);
        const data = await response.json();
        return {
            can_schedule: !!(data.success && data.can_schedule),
            is_captain_only: !!(data.success && data.is_captain_only)
        };
    } catch (error) {
        console.error('Error checking schedule permission:', error);
        return { can_schedule: false, is_captain_only: false };
    }
}

// Check if current user can delete a schedule
async function canUserDeleteSchedule(schedule) {
    const is_developer = window.userPermissions?.is_developer || false;

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

    // Check if user is allowed to schedule for this specific team
    // (admin, GM of this game, or captain of this team)
    const teamId = schedule.team_id || ScheduleState.currentTeamId || currentScheduleTeamId;
    const permission = await canUserScheduleForTeam(teamId);

    if (!permission.can_schedule) {
        return false;
    }

    // Captains may only delete schedules they created themselves
    if (permission.is_captain_only) {
        return Number(schedule.created_by) === Number(window.currentUserId);
    }

    return true;
}

// Get time remaining for deletion window
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

// Confirm schedule deletion with user
function confirmDeleteSchedule(scheduleId) {
    const schedule = ScheduleState.findSchedule(scheduleId) ||
                     currentSchedules.find(s => s.schedule_id === scheduleId);

    if (!schedule) {
        console.error('Schedule not found');
        return;
    }

    ScheduleState.pendingDeleteScheduleId = scheduleId;
    const isDeveloper = window.userPermissions?.is_developer || false;
    const timeRemaining = getScheduleDeletionTimeRemaining(schedule.created_at);

    // Build additional info
    let additionalInfo = '<br><br>All events created by this schedule will be deleted as well.';

    if (!isDeveloper && timeRemaining) {
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



// Show notification when a schedule is auto-deleted
function showScheduleCleanupNotification(scheduleName) {
    if (typeof window.showInfoMessage === 'function') {
        window.showInfoMessage(
            `Schedule "${scheduleName}" was automatically removed (no events remaining)`,
            4000
        );
    }
}

// ============================================
// LEAGUE SELECTION FOR MATCHES
// ============================================

// Show/hide league dropdown based on event type
function handleEventTypeChangeForLeague() {
    const eventType = document.getElementById('scheduledEventType').value;
    const leagueGroup = document.getElementById('scheduledLeagueGroup');
    const leagueSelect = document.getElementById('scheduledLeagueSelect');
    
    if (!leagueGroup || !leagueSelect) {
        console.warn('League field elements not found');
        return;
    }
    
    if (eventType === 'Match') {
        // Show league dropdown for matches
        leagueGroup.style.display = 'block';
        
        // Make league field REQUIRED
        leagueSelect.setAttribute('required', 'required');
        
        // Update the label to show it's required
        const leagueLabel = leagueGroup.querySelector('label');
        if (leagueLabel) {
            leagueLabel.innerHTML = 'League <span style="color: #ff5252;">*</span>';
        }
        
        // Load leagues for current team if not already loaded
        const leaguePanel = document.getElementById('scheduledLeaguePanel');
        if (ScheduleState.currentTeamId && leaguePanel?.dataset.loaded !== 'true') {
            loadTeamLeaguesForSchedule(ScheduleState.currentTeamId);
        }
    } else {
        // Hide league dropdown for other event types
        leagueGroup.style.display = 'none';
        
        // Remove required attribute
        leagueSelect.removeAttribute('required');
        if (typeof resetComboSelector === 'function') resetComboSelector('scheduledLeagueSelect');
        
        // Reset label
        const leagueLabel = leagueGroup.querySelector('label');
        if (leagueLabel) {
            leagueLabel.textContent = 'League (Optional)';
        }
    }
}

// ============================================
// VISIBILITY RESTRICTION FOR MATCHES
// ============================================

// Match events can only be visible to a team, or to all teams for the game
function handleEventTypeChangeForVisibility() {
    const eventType         = document.getElementById('scheduledEventType').value;
    const playersOption     = document.getElementById('visibilityPlayersOption');
    const communityOption   = document.getElementById('visibilityCommunityOption');
    const allTeamsOption    = document.getElementById('visibilityAllTeamsOption');
    const visibilityTrigger = document.querySelector('#scheduledVisibilityTagBox .tag-select-trigger');
    const visibilityDisplay = document.getElementById('scheduledVisibilityDisplay');

    // Captains can only ever schedule for their own team, so visibility
    // stays locked to "Team Only" no matter what event type is picked
    if (ScheduleState.isCaptainOnly) {
        if (typeof selectComboValue === 'function') {
            const label = document.getElementById('visibilityTeamOption')?.textContent?.trim() || 'Team Only';
            selectComboValue('scheduledVisibility', 'team', label);
        }

        if (playersOption)   playersOption.style.display = 'none';
        if (communityOption) communityOption.style.display = 'none';
        if (allTeamsOption)  allTeamsOption.style.display = 'none';

        visibilityTrigger?.classList.add('locked-select');
        if (visibilityDisplay && !visibilityDisplay.querySelector('.field-lock-icon')) {
            visibilityDisplay.insertAdjacentHTML('beforeend', '<i class="fas fa-lock field-lock-icon"></i>');
        }
        return;
    }

    if (eventType === 'Match') {
        // Default to Team Only; the creator can still switch to
        // "All Teams for [game]" since that option is shown below
        if (typeof selectComboValue === 'function') {
            const label = document.getElementById('visibilityTeamOption')?.textContent?.trim() || 'Team Only';
            selectComboValue('scheduledVisibility', 'team', label);
        }

        // Hide the options that don't apply to matches entirely, rather
        // than just graying them out, and reveal "All Teams"
        if (playersOption)   playersOption.style.display = 'none';
        if (communityOption) communityOption.style.display = 'none';
        if (allTeamsOption)  allTeamsOption.style.display = '';

        // Dropdown stays open-able now so Team vs All Teams can be chosen;
        // just clear any stale lock icon from a previous session
        visibilityTrigger?.classList.remove('locked-select');
        visibilityDisplay?.querySelector('.field-lock-icon')?.remove();
    } else {
        if (playersOption)   playersOption.style.display = '';
        if (communityOption) communityOption.style.display = '';
        if (allTeamsOption)  allTeamsOption.style.display = 'none';

        visibilityTrigger?.classList.remove('locked-select');
        visibilityDisplay?.querySelector('.field-lock-icon')?.remove();
    }
}

// Load team leagues into the schedule modal dropdown
async function loadTeamLeaguesForSchedule(teamId) {
    const panel   = document.getElementById('scheduledLeaguePanel');
    const trigger = document.querySelector('#scheduledLeagueTagBox .tag-select-trigger');
    if (!panel) return;

    // Show loading and block the trigger while fetching
    panel.innerHTML = '<div class="filter-box-flyout-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    panel.dataset.loaded = '';
    if (trigger) trigger.style.pointerEvents = 'none';

    try {
        const response = await fetch(`/api/teams/${teamId}/leagues`);
        const data = await response.json();

        panel.innerHTML = '';

        if (data.success && data.leagues?.length) {
            data.leagues.forEach(league => {
                const item = document.createElement('div');
                item.className = 'filter-box-item';
                item.textContent = league.name;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectComboValue('scheduledLeagueSelect', String(league.id), league.name);
                });
                panel.appendChild(item);
            });
        } else {
            panel.innerHTML = '<div class="filter-box-flyout-loading">No leagues assigned to this team</div>';
        }

        panel.dataset.loaded = 'true';
    } catch (err) {
        console.error('Error loading leagues for schedule:', err);
        panel.innerHTML = '<div class="filter-box-flyout-loading">Failed to load leagues</div>';
    } finally {
        if (trigger) trigger.style.pointerEvents = '';
    }
}

// Execute the schedule deletion (called by universal modal)
async function confirmDeleteScheduleAction(scheduleId) {
    try {
        const response = await fetch(`/api/schedule/${scheduleId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            window.closeDeleteConfirmModal();
            closeScheduleModal();

            showDeleteSuccessMessage(data.message);

            if (typeof loadScheduleTab === 'function' && currentSelectedTeamId) {
                loadScheduleTab(currentSelectedTeamId);
            }
        } else {
            handleScheduleDeleteError(data.message);
        }
    } catch (error) {
        console.error('Error deleting schedule:', error);
        showDeleteErrorMessage('Failed to delete schedule. Please try again.');
        window.closeDeleteConfirmModal();
    }
}

// Handle schedule delete errors
function handleScheduleDeleteError(message) {
    if (message.includes('expired') || message.includes('24')) {
        showDeleteErrorMessage(`${message} Only developers can delete schedules after 24 hours.`, 5000);
    } else if (message.includes('creator') || message.includes('Manager')) {
        showDeleteErrorMessage(message);
    } else {
        showDeleteErrorMessage('Error: ' + message);
    }
    window.closeDeleteConfirmModal();
}

// ============================================
// GLOBAL EXPORTS
// ============================================
window.openCreateScheduleModal = openCreateScheduleModal;
window.closeCreateScheduleModal = closeCreateScheduleModal;
window.closeScheduleModal = closeScheduleModal;
window.toggleScheduleCardExpand = toggleScheduleCardExpand;
window.loadScheduleCardEventCount = loadScheduleCardEventCount;

//Team tab schedules
window.initScheduleButton = initScheduleButton;
window.loadScheduleTab = loadScheduleTab;
window.selectScheduleWeekDay = selectScheduleWeekDay;
window.navigateToEventsTab = navigateToEventsTab;

//Editing
window.openEditScheduleMode = openEditScheduleMode;
window.handleFrequencyChange = handleFrequencyChange;

//Deletion cleanup
window.showScheduleCleanupNotification = showScheduleCleanupNotification;

