/**
 * profile-edit.js
 * ============================================================================
 * PROFILE EDITING & AVATAR MANAGEMENT
 * ORGANIZED BY CLAUDEAI
 * ============================================================================
 * Handles all profile-related editing functionality:
 * - Avatar upload and preview
 * - Discord avatar synchronization
 * - Profile information editing (name, username)
 * - Password change with validation
 * - Modal management for all profile operations
 *
 * This module manages the complete profile editing experience, from uploading
 * custom avatars to changing passwords with automatic logout for security.
 * ============================================================================
 */

// ============================================
// AVATAR MANAGEMENT
// ============================================

/**
 * Open avatar change modal
 * Resets form and hides any previous messages/previews
 */
function openAvatarModal() {
    const modal = document.getElementById('changeAvatarModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Reset form state
    document.getElementById('uploadAvatarForm').reset();
    document.getElementById('avatarPreview').style.display = 'none';
    document.getElementById('avatarUploadMessage').style.display = 'none';
}

/**
 * Close avatar change modal
 * Restores body scrolling
 */
function closeAvatarModal() {
    const modal = document.getElementById('changeAvatarModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

/**
 * Setup avatar file preview functionality
 * Shows preview of selected image before upload
 * Validates file size (max 5MB)
 */
function setupAvatarFilePreview() {
    const avatarFileInput = document.getElementById('avatarFile');
    if (!avatarFileInput) return;

    avatarFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        const preview = document.getElementById('avatarPreview');
        const previewImg = document.getElementById('avatarPreviewImg');

        if (file) {
            // Validate file size (5MB max)
            const maxSize = 5 * 1024 * 1024; // 5MB in bytes
            if (file.size > maxSize) {
                alert('File is too large. Maximum size is 5MB.');
                this.value = '';
                preview.style.display = 'none';
                return;
            }

            // Show preview of selected image
            const reader = new FileReader();
            reader.onload = function(event) {
                previewImg.src = event.target.result;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            // No file selected - hide preview
            preview.style.display = 'none';
        }
    });
}

/**
 * Setup avatar upload form submission handler
 * Handles file upload with loading state and error handling
 */
function setupAvatarUploadForm() {
    const uploadForm = document.getElementById('uploadAvatarForm');
    if (!uploadForm) return;

    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Get form elements
        const submitBtn = uploadForm.querySelector('button[type="submit"]');
        const submitBtnText = document.getElementById('uploadBtnText');
        const submitBtnSpinner = document.getElementById('uploadBtnSpinner');
        const messageDiv = document.getElementById('avatarUploadMessage');

        // Show loading state
        submitBtn.disabled = true;
        submitBtnText.style.display = 'none';
        submitBtnSpinner.style.display = 'inline-block';

        // Prepare form data
        const formData = new FormData(uploadForm);

        try {
            // Upload avatar to server
            const response = await fetch('/upload-avatar', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Show success message
                messageDiv.textContent = data.message;
                messageDiv.className = 'form-message success';
                messageDiv.style.display = 'block';

                // Reload page after brief delay to show new avatar
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error(data.message || 'Failed to upload avatar');
            }
        } catch (error) {
            // Show error message
            messageDiv.textContent = error.message;
            messageDiv.className = 'form-message error';
            messageDiv.style.display = 'block';

            // Reset button state
            submitBtn.disabled = false;
            submitBtnText.style.display = 'inline';
            submitBtnSpinner.style.display = 'none';
        }
    });
}

/**
 * Sync avatar from Discord account
 * Fetches current Discord avatar and sets it as profile picture
 * Called from avatar change modal
 */
async function syncAvatarFromModal() {
    const messageDiv = document.getElementById('avatarUploadMessage');

    // Hide any previous messages
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }

    try {
        // Request avatar sync from server
        const response = await fetch('/discord/sync-avatar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Show success message
            if (messageDiv) {
                messageDiv.textContent = data.message;
                messageDiv.className = 'form-message success';
                messageDiv.style.display = 'block';
            }

            // Close modal and reload to profile tab after brief delay
            setTimeout(() => {
                closeAvatarModal();
                // Navigate to profile tab using hash
                window.location.href = window.location.pathname + '#profile';
                window.location.reload();
                // Clear hash from URL after navigation
                history.replaceState(null, null, window.location.pathname);
            }, 1500);
        } else {
            throw new Error(data.message || 'Failed to sync avatar');
        }
    } catch (error) {
        console.error('Error syncing Discord avatar:', error);

        // Show error message
        if (messageDiv) {
            messageDiv.textContent = error.message || 'Failed to sync Discord avatar. Make sure you have Discord connected.';
            messageDiv.className = 'form-message error';
            messageDiv.style.display = 'block';
        }
    }
}

// ============================================
// PROFILE EDITING
// ============================================

/**
 * Open edit profile modal
 * Pre-populates form with current profile information
 */
function openEditProfileModal() {
    // Extract current profile data from displayed information
    const fullName = document.querySelector('.profile-info .info-row:nth-child(1) .info-value').textContent.trim();

    // Split full name into first and last name
    const nameParts = fullName.split(' ');
    const firstname = nameParts.slice(0, -1).join(' ') || nameParts[0];
    const lastname = nameParts[nameParts.length - 1];

    // Populate form fields with current values
    document.getElementById('editFirstName').value = firstname;
    document.getElementById('editLastName').value = lastname;
    document.getElementById('editUsername').value = document.querySelector('.profile-info .info-row:nth-child(2) .info-value').textContent.trim();

    // Display email but don't allow editing (for reference only)
    document.getElementById('editEmail').value = document.querySelector('.profile-info .info-row:nth-child(3) .info-value').textContent.trim();

    // Show modal
    document.getElementById('editProfileModal').style.display = 'flex';
}

/**
 * Close edit profile modal
 * Resets form and hides messages
 */
function closeEditProfileModal() {
    document.getElementById('editProfileModal').style.display = 'none';
    document.getElementById('editProfileForm').reset();
    hideMessage('editProfileMessage');
}

/**
 * Open change password modal
 */
function openChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'flex';
}

/**
 * Close change password modal
 * Resets form and hides messages
 */
function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
    document.getElementById('changePasswordForm').reset();
    hideMessage('changePasswordMessage');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Show message in modal
 * Displays success or error messages to user
 *
 * @param {string} elementId - ID of message element
 * @param {string} message - Message text to display
 * @param {boolean} isError - Whether this is an error message
 */
function showMessage(elementId, message, isError = false) {
    const messageElement = document.getElementById(elementId);
    messageElement.textContent = message;
    messageElement.className = isError ? 'form-message error' : 'form-message success';
    messageElement.style.display = 'block';
}

/**
 * Hide message in modal
 *
 * @param {string} elementId - ID of message element to hide
 */
function hideMessage(elementId) {
    const messageElement = document.getElementById(elementId);
    messageElement.style.display = 'none';
}

/**
 * Set button loading state
 * Shows/hides loading spinner in button
 *
 * @param {string} textId - ID of button text element
 * @param {string} spinnerId - ID of spinner element
 * @param {boolean} isLoading - Whether to show loading state
 */
function setButtonLoading(textId, spinnerId, isLoading) {
    document.getElementById(textId).style.display = isLoading ? 'none' : 'inline';
    document.getElementById(spinnerId).style.display = isLoading ? 'inline' : 'none';
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize profile editing functionality on page load
 * Sets up all form handlers and event listeners
 */
document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // SETUP AVATAR FUNCTIONALITY
    // ========================================
    setupAvatarFilePreview();
    setupAvatarUploadForm();

    // ========================================
    // EDIT PROFILE FORM HANDLER
    // ========================================
    const editProfileForm = document.getElementById('editProfileForm');
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            // Show loading state
            setButtonLoading('saveProfileBtnText', 'saveProfileBtnSpinner', true);
            hideMessage('editProfileMessage');

            // Prepare form data
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);

            try {
                // Submit profile update
                const response = await fetch('/api/profile/update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    // Show success message
                    showMessage('editProfileMessage', result.message || 'Profile updated successfully!', false);

                    // Update profile display with new information
                    document.querySelector('.profile-info .info-row:nth-child(1) .info-value').textContent =
                        `${data.firstname} ${data.lastname}`;
                    document.querySelector('.profile-info .info-row:nth-child(2) .info-value').textContent =
                        data.username;

                    // Update username in navigation if present
                    const navUsername = document.querySelector('.user-info');
                    if (navUsername) {
                        navUsername.textContent = `Welcome back, ${data.username}`;
                    }

                    // Email remains displayed but unchanged (read-only)
                    document.getElementById('editEmail').value =
                        document.querySelector('.profile-info .info-row:nth-child(3) .info-value').textContent.trim();

                    // Update avatar initials if no profile picture exists
                    const avatarContainer = document.querySelector('.avatar-container');
                    if (avatarContainer && !avatarContainer.querySelector('img')) {
                        avatarContainer.textContent = `${data.firstname[0]}${data.lastname[0]}`;
                    }

                    // Close modal after brief delay
                    setTimeout(() => {
                        closeEditProfileModal();
                    }, 2000);
                } else {
                    // Show error message
                    showMessage('editProfileMessage', result.error || 'Failed to update profile', true);
                }
            } catch (error) {
                // Show error message
                showMessage('editProfileMessage', 'An error occurred. Please try again.', true);
            } finally {
                // Reset button state
                setButtonLoading('saveProfileBtnText', 'saveProfileBtnSpinner', false);
            }
        });
    }

    // ========================================
    // CHANGE PASSWORD FORM HANDLER
    // ========================================
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            // Get password values
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const currentPassword = document.getElementById('currentPassword').value;

            // Validate: New password must be different from current password
            if (newPassword === currentPassword) {
                showMessage('changePasswordMessage', 'New password cannot be the same as your current password', true);
                return;
            }

            // Validate: New password and confirmation must match
            if (newPassword !== confirmPassword) {
                showMessage('changePasswordMessage', 'Passwords do not match', true);
                return;
            }

            // Show loading state
            setButtonLoading('changePasswordBtnText', 'changePasswordBtnSpinner', true);
            hideMessage('changePasswordMessage');

            // Prepare form data
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);

            try {
                // Submit password change
                const response = await fetch('/api/profile/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    // Show success message
                    showMessage('changePasswordMessage', result.message || 'Password changed successfully!', false);

                    // Wait briefly so user sees the success message
                    // Then log out for security reasons (new password requires new session)
                    setTimeout(async () => {
                        try {
                            // Call logout route
                            await fetch('/logout', { method: 'POST' });

                            // Redirect to login page with message
                            window.location.href = '/login?message=' + encodeURIComponent('For security reasons you have been signed out. Please log in again.');
                        } catch (err) {
                            console.error('Error logging out:', err);
                            // Fallback: redirect anyway for security
                            window.location.href = '/login?message=' + encodeURIComponent('For security reasons you have been signed out. Please log in again.');
                        }
                    }, 1500);
                } else {
                    // Show error message
                    showMessage('changePasswordMessage', result.error || 'Failed to change password', true);
                }
            } catch (error) {
                // Show error message
                showMessage('changePasswordMessage', 'An error occurred. Please try again.', true);
            } finally {
                // Reset button state
                setButtonLoading('changePasswordBtnText', 'changePasswordBtnSpinner', false);
            }
        });
    }

    // ========================================
    // ATTACH BUTTON CLICK HANDLERS
    // ========================================
    const editProfileBtn = document.querySelector('.profile-actions .btn-primary');
    const changePasswordBtn = document.querySelector('.profile-actions .btn-secondary');

    if (editProfileBtn) {
        editProfileBtn.onclick = openEditProfileModal;
    }

    if (changePasswordBtn) {
        changePasswordBtn.onclick = openChangePasswordModal;
    }
});

// ============================================
// GLOBAL MODAL CLOSE HANDLER
// ============================================

/**
 * Close modals when clicking outside modal content
 * Provides consistent UX across all modals
 */
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

/**
 * Export functions for use by other modules and HTML onclick handlers
 */
window.openAvatarModal = openAvatarModal;
window.closeAvatarModal = closeAvatarModal;
window.syncAvatarFromModal = syncAvatarFromModal;
window.openEditProfileModal = openEditProfileModal;
window.closeEditProfileModal = closeEditProfileModal;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;