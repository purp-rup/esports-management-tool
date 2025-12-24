/**
 * deleteModal.js
 * ============================================================================
 * UNIVERSAL DELETE CONFIRMATION MODAL SYSTEM
 * ============================================================================
 * Provides a reusable delete confirmation modal for all deletion operations
 * across the application.
 *
 * Features:
 * - Single modal for all delete operations
 * - Customizable titles, messages, and callbacks
 * - Support for additional context (time windows, warnings, etc.)
 * - Consistent styling and behavior
 * ============================================================================
 */

// ============================================
// GLOBAL STATE
// ============================================

/**
 * State object for the delete modal
 */
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
// MODAL CONTROL FUNCTIONS
// ============================================

/**
 * Open delete confirmation modal with custom content
 *
 * @param {Object} config - Configuration object
 * @param {string} config.title - Modal title (default: "Confirm Deletion")
 * @param {string} config.itemName - Name of item being deleted
 * @param {string} config.message - Main confirmation message
 * @param {string} config.additionalInfo - Additional HTML content (optional)
 * @param {string} config.buttonText - Confirm button text (default: "Delete")
 * @param {Function} config.onConfirm - Callback function when confirmed
 * @param {*} config.itemId - ID of item being deleted (stored in state)
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
    document.body.style.overflow = 'hidden';
}

/**
 * Close delete confirmation modal
 * Checks for parent modals to maintain proper scroll state
 */
function closeDeleteConfirmModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (!modal) return;

    modal.classList.remove('active');

    // Check if there are other modals still open
    // Check for display: block, display: flex, or active class
    const openModals = document.querySelectorAll('.modal');
    const hasOpenModals = Array.from(openModals).some(m => {
        if (m.id === 'deleteConfirmModal') return false; // Exclude the modal we're closing
        const style = window.getComputedStyle(m);
        return style.display === 'block' || style.display === 'flex' || m.classList.contains('active');
    });

    if (hasOpenModals) {
        // Other modals are open, keep overflow hidden
        document.body.style.overflow = 'hidden';
    } else {
        // No modals open, restore scrolling
        document.body.style.overflow = 'auto';
    }

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

// ============================================
// SUCCESS/ERROR NOTIFICATION SYSTEM
// ============================================

/**
 * Show a success notification card
 *
 * @param {string} message - Success message to display
 * @param {number} duration - Duration in milliseconds (default: 3000)
 *
 * @example
 * showDeleteSuccessMessage('Team deleted successfully!');
 */
function showDeleteSuccessMessage(message, duration = 3000) {
    showNotificationCard(message, 'success', duration);
}

/**
 * Show an error notification card
 *
 * @param {string} message - Error message to display
 * @param {number} duration - Duration in milliseconds (default: 4000)
 *
 * @example
 * showDeleteErrorMessage('Failed to delete team. Please try again.');
 */
function showDeleteErrorMessage(message, duration = 4000) {
    showNotificationCard(message, 'error', duration);
}

/**
 * Show a notification card (internal function)
 *
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error'
 * @param {number} duration - Duration in milliseconds
 */
function showNotificationCard(message, type = 'success', duration = 3000) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'delete-notification-card';
    notification.setAttribute('data-type', type);

    // Set icon based on type
    const icon = type === 'success'
        ? '<i class="fas fa-check-circle"></i>'
        : '<i class="fas fa-exclamation-circle"></i>';

    notification.innerHTML = `
        ${icon}
        <p>${message}</p>
    `;

    // Add to body
    document.body.appendChild(notification);

    // Trigger animation (add class after a small delay for CSS transition)
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // Remove after duration
    setTimeout(() => {
        notification.classList.remove('show');

        // Remove from DOM after fade-out animation completes
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300); // Match CSS transition duration
    }, duration);
}

// ============================================
// GLOBAL EXPORTS
// ============================================

window.openDeleteConfirmModal = openDeleteConfirmModal;
window.closeDeleteConfirmModal = closeDeleteConfirmModal;
window.executeDeleteConfirm = executeDeleteConfirm;
window.showDeleteSuccessMessage = showDeleteSuccessMessage;
window.showDeleteErrorMessage = showDeleteErrorMessage;
window.DeleteModalState = DeleteModalState;