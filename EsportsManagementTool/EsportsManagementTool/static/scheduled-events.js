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

/**
 * Handle form submission (placeholder for now)
 */
async function handleScheduledEventSubmit(event) {
    event.preventDefault();

    const messageDiv = document.getElementById('scheduledEventMessage');
    messageDiv.textContent = 'Form submission not yet implemented - this is just for testing the modal';
    messageDiv.className = 'form-message error';
    messageDiv.style.display = 'block';
}

// Attach event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('createScheduledEventForm');
    if (form) {
        form.addEventListener('submit', handleScheduledEventSubmit);
    }
});

// Export functions to global scope
window.openCreateScheduledEventModal = openCreateScheduledEventModal;
window.closeCreateScheduledEventModal = closeCreateScheduledEventModal;
window.initScheduleButton = initScheduleButton;