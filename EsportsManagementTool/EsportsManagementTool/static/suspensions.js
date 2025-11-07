/**
 * User Suspension Management System
 * Handles suspension modal, API calls, and UI updates
 */

// Suspension reasons dropdown options
const SUSPENSION_REASONS = [
    'Violation of Terms of Service',
    'Inappropriate Behavior',
    'Harassment or Bullying',
    'Spam or Abuse',
    'Cheating or Exploiting',
    'Multiple Policy Violations',
    'Other'
];

/**
 * Open suspension modal for a user
 */
function openSuspendModal(userId, username, fullName) {
    // Create modal HTML
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'suspendUserModal';
    modal.style.display = 'block';

    // Build reason options
    const reasonOptions = SUSPENSION_REASONS.map(reason =>
        `<option value="${reason}">${reason}</option>`
    ).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header" style="background-color: #ff9800; color: white;">
                <h2><i class="fas fa-user-clock"></i> Suspend User</h2>
                <button class="modal-close" onclick="closeSuspendModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div style="background-color: rgba(255, 152, 0, 0.1); border-left: 4px solid #ff9800; padding: 1rem; margin-bottom: 1rem; border-radius: 4px;">
                    <strong style="color: #ff9800;"><i class="fas fa-exclamation-triangle"></i> Warning:</strong>
                    <p style="color: var(--text-secondary); margin-top: 0.5rem; margin-bottom: 0; font-size: 0.875rem;">
                        This user will be unable to log in for the specified duration.
                    </p>
                </div>

                <div style="background-color: var(--background-secondary); padding: 1rem; border-radius: 4px; margin-bottom: 1.5rem;">
                    <p style="margin: 0.25rem 0;"><strong>Name:</strong> ${fullName}</p>
                    <p style="margin: 0.25rem 0;"><strong>Username:</strong> @${username}</p>
                </div>

                <form id="suspendUserForm">
                    <input type="hidden" id="suspendUserId" value="${userId}">

                    <div class="form-group">
                        <label for="suspensionReason">Reason for Suspension *</label>
                        <select id="suspensionReason" name="reason" required style="width: 100%; padding: 0.75rem; background: var(--dark-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 0.875rem;">
                            <option value="">Select a reason</option>
                            ${reasonOptions}
                        </select>
                    </div>

                    <div class="form-group" id="customReasonGroup" style="display: none; margin-top: 0.5rem;">
                        <label for="customReason">Custom Reason</label>
                        <input type="text"
                               id="customReason"
                               placeholder="Enter custom reason"
                               style="width: 100%; padding: 0.75rem; background: var(--dark-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);">
                    </div>

                    <div class="form-group" style="margin-top: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Suspension Duration *</label>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div>
                                <label for="durationDays" style="font-size: 0.875rem; color: var(--text-secondary);">Days</label>
                                <input type="number"
                                       id="durationDays"
                                       name="duration_days"
                                       min="0"
                                       max="1000000"
                                       value="7"
                                       style="width: 100%; padding: 0.75rem; background: var(--dark-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); margin-top: 0.25rem;">
                            </div>
                            <div>
                                <label for="durationHours" style="font-size: 0.875rem; color: var(--text-secondary);">Hours</label>
                                <input type="number"
                                       id="durationHours"
                                       name="duration_hours"
                                       min="0"
                                       max="23"
                                       value="0"
                                       style="width: 100%; padding: 0.75rem; background: var(--dark-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); margin-top: 0.25rem;">
                            </div>
                        </div>
                        <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">
                            <i class="fas fa-info-circle"></i> Total: <span id="totalDuration">7 days</span>
                        </p>
                    </div>

                    <div id="suspendMessage" class="form-message" style="display: none; margin-top: 1rem;"></div>

                    <div class="form-actions" style="margin-top: 1.5rem;">
                        <button type="button" class="btn btn-secondary" onclick="closeSuspendModal()">
                            Cancel
                        </button>
                        <button type="submit" class="btn" style="background-color: #ff9800; color: white;">
                            <i class="fas fa-user-clock"></i> <span id="suspendBtnText">Suspend User</span>
                            <i id="suspendBtnSpinner" class="fas fa-spinner fa-spin" style="display: none;"></i>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Add event listeners
    setupSuspendModalListeners();
}

/**
 * Setup event listeners for suspension modal
 */
function setupSuspendModalListeners() {
    const modal = document.getElementById('suspendUserModal');
    const form = document.getElementById('suspendUserForm');
    const reasonSelect = document.getElementById('suspensionReason');
    const customReasonGroup = document.getElementById('customReasonGroup');
    const daysInput = document.getElementById('durationDays');
    const hoursInput = document.getElementById('durationHours');
    const totalDuration = document.getElementById('totalDuration');

    // Show/hide custom reason field
    reasonSelect.addEventListener('change', function() {
        if (this.value === 'Other') {
            customReasonGroup.style.display = 'block';
            document.getElementById('customReason').required = true;
        } else {
            customReasonGroup.style.display = 'none';
            document.getElementById('customReason').required = false;
        }
    });

    // Update duration display
    function updateDurationDisplay() {
        const days = parseInt(daysInput.value) || 0;
        const hours = parseInt(hoursInput.value) || 0;

        let parts = [];
        if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
        if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);

        totalDuration.textContent = parts.length > 0 ? parts.join(' and ') : '0 hours';
    }

    daysInput.addEventListener('input', updateDurationDisplay);
    hoursInput.addEventListener('input', updateDurationDisplay);

    // Handle form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        await submitSuspension();
    });

    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeSuspendModal();
        }
    });
}

/**
 * Submit suspension to backend
 */
async function submitSuspension() {
    const userId = document.getElementById('suspendUserId').value;
    const reasonSelect = document.getElementById('suspensionReason');
    const customReason = document.getElementById('customReason');
    const durationDays = document.getElementById('durationDays').value;
    const durationHours = document.getElementById('durationHours').value;
    const messageDiv = document.getElementById('suspendMessage');
    const submitBtn = document.querySelector('#suspendUserForm button[type="submit"]');
    const btnText = document.getElementById('suspendBtnText');
    const btnSpinner = document.getElementById('suspendBtnSpinner');

    // Get reason (use custom if "Other" is selected)
    let reason = reasonSelect.value;
    if (reason === 'Other' && customReason.value.trim()) {
        reason = customReason.value.trim();
    }

    // Validate
    if (!reason) {
        showSuspendMessage('Please select a reason for suspension', 'error');
        return;
    }

    const days = parseInt(durationDays) || 0;
    const hours = parseInt(durationHours) || 0;

    if (days === 0 && hours === 0) {
        showSuspendMessage('Suspension duration must be greater than 0', 'error');
        return;
    }

    // Disable button and show loading
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
    messageDiv.style.display = 'none';

    try {
        const response = await fetch('/admin/suspend-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                duration_days: days,
                duration_hours: hours,
                reason: reason
            })
        });

        const data = await response.json();

        if (data.success) {
            showSuspendMessage(data.message, 'success');

            // Close modal and reload after 1.5 seconds
            setTimeout(() => {
                closeSuspendModal();
                window.location.reload();
            }, 1500);
        } else {
            showSuspendMessage(data.message || 'Failed to suspend user', 'error');
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';
        }
    } catch (error) {
        console.error('Error suspending user:', error);
        showSuspendMessage('An error occurred. Please try again.', 'error');
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

/**
 * Show message in suspension modal
 */
function showSuspendMessage(message, type) {
    const messageDiv = document.getElementById('suspendMessage');
    messageDiv.textContent = message;
    messageDiv.className = `form-message ${type}`;
    messageDiv.style.display = 'block';
}

/**
 * Close suspension modal
 */
function closeSuspendModal() {
    const modal = document.getElementById('suspendUserModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

/**
 * Load suspension status and update UI
 */
async function loadSuspensionStatus(userId) {
    try {
        const response = await fetch(`/api/user/${userId}/suspension-status`);
        const data = await response.json();

        if (data.success && data.is_suspended) {
            return data.suspension;
        }
        return null;
    } catch (error) {
        console.error('Error loading suspension status:', error);
        return null;
    }
}

/**
 * Lift suspension for a user
 */
async function liftSuspension(userId, username) {
    if (!confirm(`Are you sure you want to lift the suspension for @${username}?`)) {
        return;
    }

    try {
        const response = await fetch('/admin/lift-suspension', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId })
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);
            window.location.reload();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error lifting suspension:', error);
        alert('An error occurred. Please try again.');
    }
}

/**
 * Update user details panel to show suspension status
 */
async function updateUserDetailsWithSuspension(userId) {
    const suspension = await loadSuspensionStatus(userId);

    // Find the suspend button in the action buttons
    const suspendBtn = document.querySelector('.action-buttons .btn-secondary');

    if (suspension) {
        // User is suspended - change button to "Lift Suspension"
        if (suspendBtn) {
            suspendBtn.innerHTML = '<i class="fas fa-user-check"></i> Lift Suspension';
            suspendBtn.onclick = function() {
                const username = document.querySelector('.user-detail-info p:nth-child(2)').textContent.split('@')[1];
                liftSuspension(userId, username);
            };
        }

        // Add suspension info banner
        const detailsPanel = document.getElementById('userDetailsPanel');
        const existingBanner = detailsPanel.querySelector('.suspension-banner');

        if (!existingBanner) {
            const banner = document.createElement('div');
            banner.className = 'suspension-banner';
            banner.style.cssText = 'background-color: rgba(255, 152, 0, 0.1); border-left: 4px solid #ff9800; padding: 1rem; margin: 1rem 0; border-radius: 4px;';
            banner.innerHTML = `
                <div style="display: flex; align-items: start; gap: 0.75rem;">
                    <i class="fas fa-user-clock" style="color: #ff9800; font-size: 1.5rem; margin-top: 0.25rem;"></i>
                    <div style="flex: 1;">
                        <strong style="color: #ff9800; display: block; margin-bottom: 0.5rem;">
                            <i class="fas fa-exclamation-triangle"></i> User is Currently Suspended
                        </strong>
                        <p style="margin: 0.25rem 0; font-size: 0.875rem;">
                            <strong>Until:</strong> ${suspension.suspended_until}
                        </p>
                        <p style="margin: 0.25rem 0; font-size: 0.875rem;">
                            <strong>Reason:</strong> ${suspension.reason}
                        </p>
                        <p style="margin: 0.25rem 0; font-size: 0.875rem;">
                            <strong>Suspended by:</strong> ${suspension.suspended_by}
                        </p>
                        <p style="margin: 0.25rem 0; font-size: 0.875rem; color: var(--text-secondary);">
                            <i class="fas fa-clock"></i> Time remaining: ${suspension.remaining_days} day(s) and ${suspension.remaining_hours} hour(s)
                        </p>
                    </div>
                </div>
            `;

            // Insert after user details
            const userDetailInfo = detailsPanel.querySelector('.user-detail-info');
            userDetailInfo.insertAdjacentElement('afterend', banner);
        }
    } else {
        // User is not suspended - ensure button says "Suspend User"
        if (suspendBtn && !suspendBtn.innerHTML.includes('Lift')) {
            // Button is already correct
        }
    }
}

// Export functions for use in dashboard
window.openSuspendModal = openSuspendModal;
window.closeSuspendModal = closeSuspendModal;
window.liftSuspension = liftSuspension;
window.updateUserDetailsWithSuspension = updateUserDetailsWithSuspension;