//DISCLAIMER: THIS CODE WAS WRITTEN BY CLAUDE AI

// ============================================
// AVATAR MANAGEMENT
// ============================================

/**
 * Open avatar change modal
 */
function openAvatarModal() {
    const modal = document.getElementById('changeAvatarModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    document.getElementById('uploadAvatarForm').reset();
    document.getElementById('avatarPreview').style.display = 'none';
    document.getElementById('avatarUploadMessage').style.display = 'none';
}

/**
 * Close avatar change modal
 */
function closeAvatarModal() {
    const modal = document.getElementById('changeAvatarModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

/**
 * Setup avatar file preview
 */
function setupAvatarFilePreview() {
    const avatarFileInput = document.getElementById('avatarFile');

    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            const preview = document.getElementById('avatarPreview');
            const previewImg = document.getElementById('avatarPreviewImg');

            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    alert('File is too large. Maximum size is 5MB.');
                    this.value = '';
                    preview.style.display = 'none';
                    return;
                }

                const reader = new FileReader();
                reader.onload = function(event) {
                    previewImg.src = event.target.result;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                preview.style.display = 'none';
            }
        });
    }
}

/**
 * Setup avatar upload form submission
 */
function setupAvatarUploadForm() {
    const uploadForm = document.getElementById('uploadAvatarForm');

    if (uploadForm) {
        uploadForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const submitBtn = uploadForm.querySelector('button[type="submit"]');
            const submitBtnText = document.getElementById('uploadBtnText');
            const submitBtnSpinner = document.getElementById('uploadBtnSpinner');
            const messageDiv = document.getElementById('avatarUploadMessage');

            submitBtn.disabled = true;
            submitBtnText.style.display = 'none';
            submitBtnSpinner.style.display = 'inline-block';

            const formData = new FormData(uploadForm);

            try {
                const response = await fetch('/upload-avatar', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    messageDiv.textContent = data.message;
                    messageDiv.className = 'form-message success';
                    messageDiv.style.display = 'block';

                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } else {
                    throw new Error(data.message || 'Failed to upload avatar');
                }
            } catch (error) {
                messageDiv.textContent = error.message;
                messageDiv.className = 'form-message error';
                messageDiv.style.display = 'block';

                submitBtn.disabled = false;
                submitBtnText.style.display = 'inline';
                submitBtnSpinner.style.display = 'none';
            }
        });
    }
}

/**
 * Sync avatar from Discord
 */
async function syncAvatarFromModal() {
    const messageDiv = document.getElementById('avatarUploadMessage');

    if (messageDiv) {
        messageDiv.style.display = 'none';
    }

    try {
        const response = await fetch('/discord/sync-avatar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            if (messageDiv) {
                messageDiv.textContent = data.message;
                messageDiv.className = 'form-message success';
                messageDiv.style.display = 'block';
            }

            // Close modal and reload to profile tab
            setTimeout(() => {
                closeAvatarModal();
                window.location.href = window.location.pathname + '#profile';
                window.location.reload();
            }, 1500);
        } else {
            throw new Error(data.message || 'Failed to sync avatar');
        }
    } catch (error) {
        console.error('Error syncing Discord avatar:', error);

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
 */
function openEditProfileModal() {
    // Populate form with current values from the displayed profile
    const fullName = document.querySelector('.profile-info .info-row:nth-child(1) .info-value').textContent.trim();
    const nameParts = fullName.split(' ');
    const firstname = nameParts.slice(0, -1).join(' ') || nameParts[0];
    const lastname = nameParts[nameParts.length - 1];

    document.getElementById('editFirstName').value = firstname;
    document.getElementById('editLastName').value = lastname;
    document.getElementById('editUsername').value = document.querySelector('.profile-info .info-row:nth-child(2) .info-value').textContent.trim();

    // Still display the user's email, but do not allow editing
    document.getElementById('editEmail').value = document.querySelector('.profile-info .info-row:nth-child(3) .info-value').textContent.trim();

    document.getElementById('editProfileModal').style.display = 'flex';
}

/**
 * Close edit profile modal
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
 */
function showMessage(elementId, message, isError = false) {
    const messageElement = document.getElementById(elementId);
    messageElement.textContent = message;
    messageElement.className = isError ? 'form-message error' : 'form-message success';
    messageElement.style.display = 'block';
}

/**
 * Hide message in modal
 */
function hideMessage(elementId) {
    const messageElement = document.getElementById(elementId);
    messageElement.style.display = 'none';
}

/**
 * Set button loading state
 */
function setButtonLoading(textId, spinnerId, isLoading) {
    document.getElementById(textId).style.display = isLoading ? 'none' : 'inline';
    document.getElementById(spinnerId).style.display = isLoading ? 'inline' : 'none';
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Setup avatar functionality
    setupAvatarFilePreview();
    setupAvatarUploadForm();

    // Edit Profile Form Handler
    document.getElementById('editProfileForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        setButtonLoading('saveProfileBtnText', 'saveProfileBtnSpinner', true);
        hideMessage('editProfileMessage');

        const formData = new FormData(this);
        const data = Object.fromEntries(formData);

        try {
            const response = await fetch('/api/profile/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                showMessage('editProfileMessage', result.message || 'Profile updated successfully!', false);

                // Update profile display (email unchanged)
                document.querySelector('.profile-info .info-row:nth-child(1) .info-value').textContent =
                    `${data.firstname} ${data.lastname}`;
                document.querySelector('.profile-info .info-row:nth-child(2) .info-value').textContent =
                    data.username;

                const navUsername = document.querySelector('.user-info');
                if (navUsername) {
                    navUsername.textContent = `Welcome back, ${data.username}`;
                }

                // Email remains displayed as-is
                document.getElementById('editEmail').value =
                    document.querySelector('.profile-info .info-row:nth-child(3) .info-value').textContent.trim();

                // Update avatar initials if no profile picture
                const avatarContainer = document.querySelector('.avatar-container');
                if (!avatarContainer.querySelector('img')) {
                    avatarContainer.textContent = `${data.firstname[0]}${data.lastname[0]}`;
                }

                setTimeout(() => {
                    closeEditProfileModal();
                }, 2000);
            } else {
                showMessage('editProfileMessage', result.error || 'Failed to update profile', true);
            }
        } catch (error) {
            showMessage('editProfileMessage', 'An error occurred. Please try again.', true);
        } finally {
            setButtonLoading('saveProfileBtnText', 'saveProfileBtnSpinner', false);
        }
    });

    // Change Password Form Handler
    document.getElementById('changePasswordForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const currentPassword = document.getElementById('currentPassword').value;

        // Check if new password matches current password
        if (newPassword === currentPassword) {
            showMessage('changePasswordMessage', 'New password cannot be the same as your current password', true);
            return;
        }

        if (newPassword !== confirmPassword) {
            showMessage('changePasswordMessage', 'Passwords do not match', true);
            return;
        }

        setButtonLoading('changePasswordBtnText', 'changePasswordBtnSpinner', true);
        hideMessage('changePasswordMessage');

        const formData = new FormData(this);
        const data = Object.fromEntries(formData);

        try {
            const response = await fetch('/api/profile/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                showMessage('changePasswordMessage', result.message || 'Password changed successfully!', false);

                // Wait briefly so user sees the success message
                setTimeout(async () => {
                    try {
                        // Call logout route via POST
                        await fetch('/logout', { method: 'POST' });

                        // Redirect to login page with custom message
                        window.location.href = '/login?message=' + encodeURIComponent('For security reasons you have been signed out. Please log in again.');
                    } catch (err) {
                        console.error('Error logging out:', err);
                        // fallback: redirect anyway
                        window.location.href = '/login?message=' + encodeURIComponent('For security reasons you have been signed out. Please log in again.');
                    }
                }, 1500);
            } else {
                showMessage('changePasswordMessage', result.error || 'Failed to change password', true);
            }
        } catch (error) {
            showMessage('changePasswordMessage', 'An error occurred. Please try again.', true);
        } finally {
            setButtonLoading('changePasswordBtnText', 'changePasswordBtnSpinner', false);
        }
    });

    // Update button onclick handlers
    const editProfileBtn = document.querySelector('.profile-actions .btn-primary');
    const changePasswordBtn = document.querySelector('.profile-actions .btn-secondary');

    if (editProfileBtn) {
        editProfileBtn.onclick = openEditProfileModal;
    }

    if (changePasswordBtn) {
        changePasswordBtn.onclick = openChangePasswordModal;
    }
});

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};