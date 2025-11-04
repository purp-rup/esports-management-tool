//DISCLAIMER: THIS CODE WAS WRITTEN BY CLAUDE AI

// Modal Functions
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

function closeEditProfileModal() {
    document.getElementById('editProfileModal').style.display = 'none';
    document.getElementById('editProfileForm').reset();
    hideMessage('editProfileMessage');
}

function openChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'flex';
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
    document.getElementById('changePasswordForm').reset();
    hideMessage('changePasswordMessage');
}

// Utility Functions
function showMessage(elementId, message, isError = false) {
    const messageElement = document.getElementById(elementId);
    messageElement.textContent = message;
    messageElement.className = isError ? 'form-message error' : 'form-message success';
    messageElement.style.display = 'block';
}

function hideMessage(elementId) {
    const messageElement = document.getElementById(elementId);
    messageElement.style.display = 'none';
}

function setButtonLoading(textId, spinnerId, isLoading) {
    document.getElementById(textId).style.display = isLoading ? 'none' : 'inline';
    document.getElementById(spinnerId).style.display = isLoading ? 'inline' : 'none';
}

document.addEventListener('DOMContentLoaded', function() {
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

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// Update button onclick handlers
document.addEventListener('DOMContentLoaded', function() {
    const editProfileBtn = document.querySelector('.profile-actions .btn-primary');
    const changePasswordBtn = document.querySelector('.profile-actions .btn-secondary');

    if (editProfileBtn) {
        editProfileBtn.onclick = openEditProfileModal;
    }

    if (changePasswordBtn) {
        changePasswordBtn.onclick = openChangePasswordModal;
    }
});
