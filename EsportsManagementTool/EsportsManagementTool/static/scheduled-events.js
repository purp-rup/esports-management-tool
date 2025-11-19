/**
 * Simple Scheduled Events - Fixed Version
 */

let currentScheduleTeamId = null;
let currentScheduleGameId = null;

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
 * Handle form submission
 */
async function handleScheduledEventSubmit(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    const messageDiv = document.getElementById('scheduledEventMessage');

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
        day_of_week: parseInt(document.getElementById('scheduledDayOfWeek').value),
        start_time: document.getElementById('scheduledStartTime').value,
        end_time: document.getElementById('scheduledEndTime').value,
        visibility: document.getElementById('scheduledVisibility').value,
        end_date: document.getElementById('scheduledEndDate').value,
        description: document.getElementById('scheduledDescription').value
    };

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

// Export functions to global scope
window.openCreateScheduledEventModal = openCreateScheduledEventModal;
window.closeCreateScheduledEventModal = closeCreateScheduledEventModal;
window.initScheduleButton = initScheduleButton;