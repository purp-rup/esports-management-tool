// ============================================
// UNIVERSAL MODAL CLOSE HANDLER
// Handles clicking outside modals and ESC key
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Handle click outside modal to close it
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            const modalId = event.target.id;

            const modalCloseHandlers = {
                'dayEventsModal': closeDayModal,
                'eventDetailsModal': closeEventModal,
                'createEventModal': closeCreateEventModal,
                'createGameModal': closeCreateGameModal,
                'createTeamModal': closeCreateTeamModal,
                'gameDetailsModal': closeGameDetailsModal,
                'assignGMModal': closeAssignGMModal,
                'changeAvatarModal': closeAvatarModal,
                'editProfileModal': closeEditProfileModal,
                'changePasswordModal': closeChangePasswordModal,
                'deleteEventConfirmModal': closeDeleteConfirmModal,
                'addTeamMembersModal': closeAddTeamMembersModal
            };

            if (modalCloseHandlers[modalId]) {
                modalCloseHandlers[modalId]();
            }

            // Always reset scroll as backup
            document.body.style.overflow = 'auto';
        }
    });

    // Handle Escape key for all modals
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const visibleModals = document.querySelectorAll('.modal[style*="display: block"], .modal.active');

            visibleModals.forEach(modal => {
                const modalId = modal.id;
                const modalCloseHandlers = {
                    'dayEventsModal': closeDayModal,
                    'eventDetailsModal': closeEventModal,
                    'createEventModal': closeCreateEventModal,
                    'createGameModal': closeCreateGameModal,
                    'createTeamModal': closeCreateTeamModal,
                    'gameDetailsModal': closeGameDetailsModal,
                    'assignGMModal': closeAssignGMModal,
                    'changeAvatarModal': closeAvatarModal,
                    'editProfileModal': closeEditProfileModal,
                    'changePasswordModal': closeChangePasswordModal,
                    'deleteEventConfirmModal': closeDeleteConfirmModal,
                    'addTeamMembersModal': closeAddTeamMembersModal
                };

                if (modalCloseHandlers[modalId]) {
                    modalCloseHandlers[modalId]();
                }
            });

            // Always reset scroll as backup
            document.body.style.overflow = 'auto';
        }
    });
});