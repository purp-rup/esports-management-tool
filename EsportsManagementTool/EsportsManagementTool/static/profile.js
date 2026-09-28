/* ============================================================================
 * Profile page logic
 * - Tab initialization
 * - Avatar upload and preview
 * - Discord avatar synchronization
 * - Profile information editing (name, username)
 * - Password change with validation
 * ============================================================================
 */

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {

    // Setup avatar functionality
    setupAvatarFilePreview();
    setupAvatarUploadForm();

    // Edit profile form handler
    const editProfileForm = document.getElementById('editProfileForm');
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            // Show loading state
            setButtonLoading('saveProfileBtnText', 'saveProfileBtnSpinner', true);

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
                    showSuccessToast(result.message || 'Profile updated successfully!');

                    // Update profile display with new information
                    document.querySelector('.profile-info-section .info-item:nth-child(1) .info-value').textContent =
                        `${data.firstname} ${data.lastname}`;
                    document.querySelector('.profile-info-section .info-item:nth-child(2) .info-value').textContent =
                        data.username;

                    // Update username in navigation if present
                    const navUsername = document.querySelector('.user-info');
                    if (navUsername) {
                        navUsername.textContent = `Welcome back, ${data.username}`;
                    }

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
                    showErrorToast(result.error || 'Failed to update profile');
                }
            } catch (error) {
                // Show error message
                showErrorToast('An error occurred. Please try again.');
            } finally {
                // Reset button state
                setButtonLoading('saveProfileBtnText', 'saveProfileBtnSpinner', false);
            }
        });
    }

    // Change password form handler
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
                showErrorToast('New password cannot be the same as your current password');
                return;
            }

            // Validate: New password and confirmation must match
            if (newPassword !== confirmPassword) {
                showErrorToast('Passwords do not match');
                return;
            }

            // Show loading state
            setButtonLoading('changePasswordBtnText', 'changePasswordBtnSpinner', true);

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
                    showSuccessToast(result.message || 'Password changed successfully!');

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
                    showErrorToast(result.error || 'Failed to change password');
                }
            } catch (error) {
                // Show error message
                showErrorToast('An error occurred. Please try again.');
            } finally {
                // Reset button state
                setButtonLoading('changePasswordBtnText', 'changePasswordBtnSpinner', false);
            }
        });
    }
});

// ============================================
// AVATAR MANAGEMENT
// ============================================
function openAvatarModal() {
    const modal = document.getElementById('changeAvatarModal');
    modal.style.display = 'block';
    lockBodyScroll('changeAvatarModal');

    // Reset form state
    document.getElementById('uploadAvatarForm').reset();
    document.getElementById('avatarPreview').style.display = 'none';
}

function closeAvatarModal() {
    const modal = document.getElementById('changeAvatarModal');
    modal.style.display = 'none';
    unlockBodyScroll('changeAvatarModal');
}

/**
 * Setup avatar file preview functionality
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

            // Open the universal image cropper with 'avatar' context
            openImageCropper(file, 'avatar');

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

// Setup avatar upload form submission handler
function setupAvatarUploadForm() {
    const uploadForm = document.getElementById('uploadAvatarForm');
    if (!uploadForm) return;

    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Get form elements
        const submitBtn = uploadForm.querySelector('button[type="submit"]');
        const submitBtnText = document.getElementById('uploadBtnText');
        const submitBtnSpinner = document.getElementById('uploadBtnSpinner');

        // Show loading state
        submitBtn.disabled = true;
        submitBtnText.style.display = 'none';
        submitBtnSpinner.style.display = 'inline-block';

        // Prepare form data
        const formData = new FormData(uploadForm);

        try {
        // Use cropped blob if available, otherwise use raw file
        const fileInput = document.getElementById('avatarFile');
        const blob = window.avatarCroppedImageBlob;

        if (!blob && (!fileInput.files || fileInput.files.length === 0)) {
            throw new Error('No image selected');
        }

        const formData = new FormData();
        if (blob) {
            formData.append('profile_picture', blob, 'avatar.png');
        } else {
            formData.append('profile_picture', fileInput.files[0]);
        }

        const response = await fetch('/api/profile/upload-picture', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showSuccessToast('Avatar updated successfully!');

            // Clear the stored blob
            window.avatarCroppedImageBlob = null;

            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            throw new Error(data.error || 'Failed to upload avatar');
        }
        } catch (error) {
            showErrorToast(error.message);

            submitBtn.disabled = false;
            submitBtnText.style.display = 'inline';
            submitBtnSpinner.style.display = 'none';
        }
    });
}

// Sync the user's Discord avatar to their account
async function syncAvatarFromModal() {
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
            showSuccessToast(data.message);

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
        showErrorToast(error.message || 'Failed to sync Discord avatar. Make sure you have Discord connected.');
    }
}

// ============================================
// PROFILE EDITING
// ============================================
function openEditProfileModal() {
    // Show modal - fields are already pre-populated by Flask template
    document.getElementById('editProfileModal').style.display = 'flex';
    lockBodyScroll('editProfileModal');
}

function closeEditProfileModal() {
    document.getElementById('editProfileModal').style.display = 'none';
    document.getElementById('editProfileForm').reset();
    unlockBodyScroll('editProfileModal');
}

function openChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'flex';
    lockBodyScroll('changePasswordModal');
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
    document.getElementById('changePasswordForm').reset();
    unlockBodyScroll('changePasswordModal');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Show/hide loading spinner in a button
function setButtonLoading(textId, spinnerId, isLoading) {
    document.getElementById(textId).style.display = isLoading ? 'none' : 'inline';
    document.getElementById(spinnerId).style.display = isLoading ? 'inline' : 'none';
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================
window.openAvatarModal = openAvatarModal;
window.closeAvatarModal = closeAvatarModal;
window.syncAvatarFromModal = syncAvatarFromModal;
window.openEditProfileModal = openEditProfileModal;
window.closeEditProfileModal = closeEditProfileModal;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;