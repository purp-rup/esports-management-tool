/**
 * modals.js
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
 *
 * This system ensures consistent modal behavior throughout the application
 * without needing to attach individual listeners to each modal.
 * ============================================================================
 */

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
    // Event-related modals
    'dayEventsModal': closeDayModal,
    'eventDetailsModal': closeEventModal,
    'createEventModal': closeCreateEventModal,
    'deleteEventConfirmModal': closeDeleteConfirmModal,

    // Game/Community-related modals
    'createGameModal': closeCreateGameModal,
    'gameDetailsModal': closeGameDetailsModal,
    'assignGMModal': closeAssignGMModal,

    // Team-related modals
    'createTeamModal': closeCreateTeamModal,
    'addTeamMembersModal': closeAddTeamMembersModal,

    // Profile-related modals
    'changeAvatarModal': closeAvatarModal,
    'editProfileModal': closeEditProfileModal,
    'changePasswordModal': closeChangePasswordModal,

    // Scheduled events
    'createScheduledEventModal': closeCreateScheduledEventModal,

    //VOD Modal
    'showAddVodModal': closeAddVodModal,

    //Seasons Modal
    'manageSeasonsModal': closeManageSeasonsModal
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
        if (event.target.classList.contains('modal')) {
            const modalId = event.target.id;

            // Look up and execute the appropriate close handler
            if (MODAL_CLOSE_HANDLERS[modalId]) {
                MODAL_CLOSE_HANDLERS[modalId]();
            }

            // Always reset scroll as a safety measure
            // Ensures body scrolling is restored even if close handler fails
            document.body.style.overflow = 'auto';
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
            // Supports both display:block style and .active class
            const visibleModals = document.querySelectorAll(
                '.modal[style*="display: block"], .modal.active'
            );

            // Close all visible modals
            visibleModals.forEach(modal => {
                const modalId = modal.id;

                // Look up and execute the appropriate close handler
                if (MODAL_CLOSE_HANDLERS[modalId]) {
                    MODAL_CLOSE_HANDLERS[modalId]();
                }
            });

            // Always reset scroll as a safety measure
            document.body.style.overflow = 'auto';
        }
    });
}