/**
 * ============================================================================
 * UNIVERSAL MODAL MANAGEMENT SYSTEM
 * ============================================================================
 * Provides centralized modal interaction handling for all modals across
 * the application:
 *
 * Features:
 * - Click-outside-to-close functionality for all modals
 * - ESC key to close any visible modal
 * - Automatic body scroll management (prevents background scrolling)
 * - Centralized handler registry for easy maintenance
 * - Delete modal structure and processing
 * ============================================================================
 */

// ============================================
// GLOBAL STATE (for delete modals)
// ============================================
const DeleteModalState = {
    /** Current deletion callback function */
    onConfirm: null,

    /** Item ID being deleted */
    itemId: null,

    /** Item name being deleted */
    itemName: '',

    /** Reset state */
    reset() {
        this.onConfirm = null;
        this.itemId = null;
        this.itemName = '';
    }
};

// ============================================
// MODAL CLOSE HANDLER REGISTRY
// ============================================

/**
 * Central registry of all modal close handlers
 * Maps modal IDs to their respective close functions
 *
 * To add a new modal:
 * 1. Create the modal close function in the appropriate module
 * 2. Add the modal ID and function to this registry
 * 3. The system will automatically handle click-outside and ESC key
 *
 * @type {Object.<string, Function>}
 */
const MODAL_CLOSE_HANDLERS = {
    // Universal delete confirmation modal
    'deleteConfirmModal': () => closeDeleteConfirmModal(),

    // Event-related modals
    'dayEventsModal': () => closeDayModal(),
    'createEventModal': () => closeCreateEventModal(),

    // Game/Community-related modals
    'communityModal': () => closeCommunityModal(),
    'assignGMModal': () => closeAssignGMModal(),
    'manageCommunitiesModal': () => closeManageCommunitiesModal(),

    // Team-related modals
    'createTeamModal': () => closeCreateTeamModal(),
    'addTeamMembersModal': () => closeAddTeamMembersModal(),
    'editTeamModal': () => closeEditTeamModal(),

    // Profile-related modals
    'changeAvatarModal': () => closeAvatarModal(),
    'editProfileModal': () => closeEditProfileModal(),
    'changePasswordModal': () => closeChangePasswordModal(),

    // Scheduled events
    'scheduleDetailsModal': () => closeScheduleModal(),
    'createScheduledEventModal': () => closeCreateScheduleModal(),

    // Stats modal
    'recordMatchResultModal': () => closeRecordResultModal(),
    'playoffsResultsModal': () => closePlayoffsResultsModal(),

    // VOD Modals
    'addVodModal': () => closeAddVodModal(),
    'vodPlayerModal': () => closeVodPlayerModal(),

    //Seasons Modal
    'manageSeasonsModal': () => closeManageSeasonsModal(),

    // Leagues Modal
    'manageLeaguesModal': () => closeManageLeaguesModal(),

    // Custom role modal (admin panel role management)
    'customRoleModal': () => closeCustomRoleModal(true)
};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize universal modal handlers on page load
 * Sets up click-outside and ESC key listeners
 */
document.addEventListener('DOMContentLoaded', function() {
    initializeClickOutsideHandler();
    initializeEscapeKeyHandler();
});

// ============================================
// CLICK OUTSIDE HANDLER
// ============================================

/**
 * Initialize click-outside-to-close functionality
 * Closes modal when user clicks the modal background (not content)
 */
function initializeClickOutsideHandler() {
    window.addEventListener('click', function(event) {
        // Check if the clicked element is a modal background
        // Support both .modal and .delete-confirmation-modal classes
        if (event.target.classList.contains('modal') ||
            event.target.classList.contains('delete-confirmation-modal')) {
            const modalId = event.target.id;

            // Look up and execute the appropriate close handler
            if (MODAL_CLOSE_HANDLERS[modalId]) {
                MODAL_CLOSE_HANDLERS[modalId]();
            }
        }
    });
}

// ============================================
// ESCAPE KEY HANDLER
// ============================================

/**
 * Initialize ESC key to close any visible modal
 * Handles multiple modals if multiple are open (edge case)
 */
function initializeEscapeKeyHandler() {
    document.addEventListener('keydown', function(event) {
        // Check if ESC key was pressed
        if (event.key === 'Escape') {
            // Find all currently visible modals
            // Supports both display:block, display:flex, and .active class
            const visibleModals = document.querySelectorAll(
                '.modal[style*="display: block"], .modal[style*="display: flex"], .modal.active, .delete-confirmation-modal.active'
            );

            // Close all visible modals
            visibleModals.forEach(modal => {
                const modalId = modal.id;

                // Look up and execute the appropriate close handler
                if (MODAL_CLOSE_HANDLERS[modalId]) {
                    MODAL_CLOSE_HANDLERS[modalId]();
                }
            });
        }
    });
}


// ============================================
// DELETE MODAL FUNCTIONALITY
// ============================================

/**
 * Open delete confirmation modal with custom content
 *
 * @example
 * openDeleteConfirmModal({
 *     title: 'Delete Event?',
 *     itemName: 'Weekly Practice',
 *     message: 'Are you sure you want to delete this event?',
 *     additionalInfo: '<div style="color: orange;">Time remaining: 2h 30m</div>',
 *     buttonText: 'Delete Event',
 *     onConfirm: confirmDeleteEvent,
 *     itemId: 123
 * });
 */
function openDeleteConfirmModal(config) {
    const {
        title = 'Confirm Deletion',
        itemName = '',
        message = 'Are you sure you want to delete this item?',
        additionalInfo = '',
        buttonText = 'Delete',
        onConfirm,
        itemId = null
    } = config;

    // Validate required parameters
    if (!onConfirm || typeof onConfirm !== 'function') {
        console.error('openDeleteConfirmModal: onConfirm callback is required');
        return;
    }

    // Store state
    DeleteModalState.onConfirm = onConfirm;
    DeleteModalState.itemId = itemId;
    DeleteModalState.itemName = itemName;

    // Get modal elements
    const modal = document.getElementById('deleteConfirmModal');
    const titleElement = document.getElementById('deleteConfirmTitle');
    const messageElement = document.getElementById('deleteConfirmMessage');
    const confirmButton = document.getElementById('deleteConfirmButton');

    if (!modal || !titleElement || !messageElement || !confirmButton) {
        console.error('Delete confirmation modal elements not found');
        return;
    }

    // Update modal content
    titleElement.textContent = title;

    // Build message with item name highlighted
    let fullMessage = message;
    if (itemName) {
        fullMessage = fullMessage.replace(
            itemName,
            `<span class="delete-confirmation-event-name">${itemName}</span>`
        );
    }

    // Add additional info if provided
    if (additionalInfo) {
        fullMessage += additionalInfo;
    }

    messageElement.innerHTML = fullMessage;
    confirmButton.textContent = buttonText;

    // Reset button state (in case previous operation left it disabled)
    confirmButton.disabled = false;
    confirmButton.innerHTML = buttonText;

    // Show modal
    modal.classList.add('active');
    lockBodyScroll('deleteConfirmModal');
}

// Close delete confirmation modal
function closeDeleteConfirmModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (!modal) return;

    modal.classList.remove('active');
    unlockBodyScroll('deleteConfirmModal');

    // Reset state
    DeleteModalState.reset();
}

/**
 * Execute the deletion when user confirms
 * Calls the stored callback function
 */
async function executeDeleteConfirm() {
    if (!DeleteModalState.onConfirm) {
        console.error('No deletion callback registered');
        closeDeleteConfirmModal();
        return;
    }

    const confirmButton = document.getElementById('deleteConfirmButton');

    // Set loading state
    if (confirmButton) {
        confirmButton.disabled = true;
        confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    }

    try {
        // Execute the callback with stored item ID
        await DeleteModalState.onConfirm(DeleteModalState.itemId);

        // Callback is responsible for closing modal and showing success message
        // This allows for custom post-deletion behavior
    } catch (error) {
        console.error('Error during deletion:', error);

        // Reset button state on error
        if (confirmButton) {
            confirmButton.disabled = false;
            confirmButton.textContent = 'Delete';
        }

        // Show error to user
        alert('An error occurred during deletion. Please try again.');
        closeDeleteConfirmModal();
    }
}

window.openDeleteConfirmModal = openDeleteConfirmModal;
window.closeDeleteConfirmModal = closeDeleteConfirmModal;
window.executeDeleteConfirm = executeDeleteConfirm;