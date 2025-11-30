/**
 * suspensions.js
 * ============================================================================
 * USER SUSPENSION MANAGEMENT SYSTEM
 * ORGANIZED BY CLAUDEAI
 * ============================================================================
 * Handles all user suspension functionality:
 * - Suspension modal creation and management
 * - Suspension duration configuration (days and hours)
 * - Predefined and custom suspension reasons
 * - Suspension status display and updates
 * - Suspension lifting (early termination)
 * - Real-time duration preview
 * - Integration with admin user details panel
 *
 * This module provides administrators with comprehensive tools to temporarily
 * restrict user access for policy violations or other reasons.
 * ============================================================================
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * Predefined suspension reasons
 * Provides consistent categorization of suspension causes
 * @type {Array<string>}
 */
const SUSPENSION_REASONS = [
    'Violation of Terms of Service',
    'Inappropriate Behavior',
    'Harassment or Bullying',
    'Spam or Abuse',
    'Cheating or Exploiting',
    'Multiple Policy Violations',
    'Other'
];

// ============================================
// SUSPENSION MODAL
// ============================================

/**
 * Open suspension modal for a user
 * Creates and displays modal with suspension form
 *
 * @param {number} userId - ID of user to suspend
 * @param {string} username - Username for display
 * @param {string} fullName - Full name for display
 */
function openSuspendModal(userId, username, fullName) {
    // Create modal element
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'suspendUserModal';
    modal.style.display = 'block';

    // Build reason dropdown options
    const reasonOptions = SUSPENSION_REASONS.map(reason =>
        `<option value="${reason}">${reason}</option>`
    ).join('');

    // Build modal HTML
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header" style="background-color: #ff9800; color: white;">
                <h2><i class="fas fa-user-clock"></i> Suspend User</h2>
                <button class="modal-close" onclick="closeSuspendModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <!-- Warning Banner -->
                <div style="background-color: rgba(255, 152, 0, 0.1); border-left: 4px solid #ff9800; padding: 1rem; margin-bottom: 1rem; border-radius: 4px;">
                    <strong style="color: #ff9800;"><i class="fas fa-exclamation-triangle"></i> Warning:</strong>
                    <p style="color: var(--text-secondary); margin-top: 0.5rem; margin-bottom: 0; font-size: 0.875rem;">
                        This user will be unable to log in for the specified duration.
                    </p>
                </div>

                <!-- User Information Display -->
                <div style="background-color: var(--background-secondary); padding: 1rem; border-radius: 4px; margin-bottom: 1.5rem;">
                    <p style="margin: 0.25rem 0;"><strong>Name:</strong> ${fullName}</p>
                    <p style="margin: 0.25rem 0;"><strong>Username:</strong> @${username}</p>
                </div>

                <!-- Suspension Form -->
                <form id="suspendUserForm">
                    <input type="hidden" id="suspendUserId" value="${userId}">

                    <!-- Reason Selection -->
                    <div class="form-group">
                        <label for="suspensionReason">Reason for Suspension *</label>
                        <select id="suspensionReason" name="reason" required style="width: 100%; padding: 0.75rem; background: var(--dark-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 0.875rem;">
                            <option value="">Select a reason</option>
                            ${reasonOptions}
                        </select>
                    </div>

                    <!-- Custom Reason Input (shown when "Other" is selected) -->
                    <div class="form-group" id="customReasonGroup" style="display: none; margin-top: 0.5rem;">
                        <label for="customReason">Custom Reason</label>
                        <input type="text"
                               id="customReason"
                               placeholder="Enter custom reason"
                               style="width: 100%; padding: 0.75rem; background: var(--dark-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);">
                    </div>

                    <!-- Duration Selection -->
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
                        <!-- Duration Preview -->
                        <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">
                            <i class="fas fa-info-circle"></i> Total: <span id="totalDuration">7 days</span>
                        </p>
                    </div>

                    <!-- Status Message -->
                    <div id="suspendMessage" class="form-message" style="display: none; margin-top: 1rem;"></div>

                    <!-- Action Buttons -->
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

    // Add modal to page
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Setup event listeners
    setupSuspendModalListeners();
}

/**
 * Setup event listeners for suspension modal
 * Handles reason selection, duration updates, and form submission
 */
function setupSuspendModalListeners() {
    const modal = document.getElementById('suspendUserModal');
    const form = document.getElementById('suspendUserForm');
    const reasonSelect = document.getElementById('suspensionReason');
    const customReasonGroup = document.getElementById('customReasonGroup');
    const daysInput = document.getElementById('durationDays');
    const hoursInput = document.getElementById('durationHours');
    const totalDuration = document.getElementById('totalDuration');

    // ========================================
    // CUSTOM REASON VISIBILITY
    // ========================================
    // Show custom reason input when "Other" is selected
    reasonSelect.addEventListener('change', function() {
        if (this.value === 'Other') {
            customReasonGroup.style.display = 'block';
            document.getElementById('customReason').required = true;
        } else {
            customReasonGroup.style.display = 'none';
            document.getElementById('customReason').required = false;
        }
    });

    // ========================================
    // DURATION PREVIEW UPDATE
    // ========================================
    /**
     * Update the total duration display
     * Shows natural language representation of suspension length
     */
    function updateDurationDisplay() {
        const days = parseInt(daysInput.value) || 0;
        const hours = parseInt(hoursInput.value) || 0;

        let parts = [];
        if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
        if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);

        totalDuration.textContent = parts.length > 0 ? parts.join(' and ') : '0 hours';
    }

    // Listen for duration input changes
    daysInput.addEventListener('input', updateDurationDisplay);
    hoursInput.addEventListener('input', updateDurationDisplay);

    // ========================================
    // FORM SUBMISSION
    // ========================================
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        await submitSuspension();
    });

    // ========================================
    // CLOSE ON BACKGROUND CLICK
    // ========================================
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeSuspendModal();
        }
    });
}

/**
 * Close suspension modal
 * Removes modal from DOM and restores scrolling
 */
function closeSuspendModal() {
    const modal = document.getElementById('suspendUserModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

// ============================================
// SUSPENSION SUBMISSION
// ============================================

/**
 * Submit suspension to backend
 * Validates inputs and makes API request
 */
async function submitSuspension() {
    // Get form elements
    const userId = document.getElementById('suspendUserId').value;
    const reasonSelect = document.getElementById('suspensionReason');
    const customReason = document.getElementById('customReason');
    const durationDays = document.getElementById('durationDays').value;
    const durationHours = document.getElementById('durationHours').value;
    const messageDiv = document.getElementById('suspendMessage');
    const submitBtn = document.querySelector('#suspendUserForm button[type="submit"]');
    const btnText = document.getElementById('suspendBtnText');
    const btnSpinner = document.getElementById('suspendBtnSpinner');

    // ========================================
    // DETERMINE SUSPENSION REASON
    // ========================================
    // Use custom reason if "Other" is selected
    let reason = reasonSelect.value;
    if (reason === 'Other' && customReason.value.trim()) {
        reason = customReason.value.trim();
    }

    // ========================================
    // VALIDATION
    // ========================================
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

    // ========================================
    // SHOW LOADING STATE
    // ========================================
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
    messageDiv.style.display = 'none';

    // ========================================
    // SUBMIT TO BACKEND
    // ========================================
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
            // Show success message
            showSuspendMessage(data.message, 'success');

            // Close modal and reload after brief delay
            setTimeout(() => {
                closeSuspendModal();
                window.location.reload();
            }, 1500);
        } else {
            // Show error message and re-enable button
            showSuspendMessage(data.message || 'Failed to suspend user', 'error');
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';
        }
    } catch (error) {
        console.error('Error suspending user:', error);
        showSuspendMessage('An error occurred. Please try again.', 'error');

        // Re-enable button
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

/**
 * Show message in suspension modal
 *
 * @param {string} message - Message text to display
 * @param {string} type - Message type ('success' or 'error')
 */
function showSuspendMessage(message, type) {
    const messageDiv = document.getElementById('suspendMessage');
    messageDiv.textContent = message;
    messageDiv.className = `form-message ${type}`;
    messageDiv.style.display = 'block';
}

// ============================================
// SUSPENSION STATUS
// ============================================

/**
 * Load suspension status for a user
 * Fetches current suspension information from API
 *
 * @param {number} userId - ID of user to check
 * @returns {Promise<Object|null>} Suspension data or null if not suspended
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
 * Update user details panel to show suspension status
 * Displays suspension banner and changes suspend button to lift suspension
 *
 * @param {number} userId - ID of user to check and update
 */
async function updateUserDetailsWithSuspension(userId) {
    const suspension = await loadSuspensionStatus(userId);

    // Find the suspend button in action buttons
    const suspendBtn = document.querySelector('.action-buttons .btn-secondary');

    if (suspension) {
        // ========================================
        // USER IS SUSPENDED
        // ========================================

        // Change button to "Lift Suspension"
        if (suspendBtn) {
            suspendBtn.innerHTML = '<i class="fas fa-user-check"></i> Lift Suspension';
            suspendBtn.onclick = function() {
                const username = document.querySelector('.user-detail-info p:nth-child(2)').textContent.split('@')[1];
                liftSuspension(userId, username);
            };
        }

        // Add suspension information banner
        const detailsPanel = document.getElementById('userDetailsPanel');
        const existingBanner = detailsPanel.querySelector('.suspension-banner');

        // Only add banner if it doesn't already exist
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

            // Insert banner after user detail info section
            const userDetailInfo = detailsPanel.querySelector('.user-detail-info');
            userDetailInfo.insertAdjacentElement('afterend', banner);
        }
    }
    // If user is not suspended, button remains as "Suspend User" (no changes needed)
}

// ============================================
// SUSPENSION LIFTING
// ============================================

/**
 * Lift (end) a user's suspension early
 * Requires admin confirmation before proceeding
 *
 * @param {number} userId - ID of user to unsuspend
 * @param {string} username - Username for confirmation display
 */
async function liftSuspension(userId, username) {
    // Confirm action with admin
    if (!confirm(`Are you sure you want to lift the suspension for @${username}?`)) {
        return;
    }

    try {
        // Request suspension lift from backend
        const response = await fetch('/admin/lift-suspension', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId })
        });

        const data = await response.json();

        if (data.success) {
            // Show success message and reload
            alert(data.message);
            window.location.reload();
        } else {
            // Show error message
            alert('Error: ' + data.message);
        }
    } catch (error) {
        console.error('Error lifting suspension:', error);
        alert('An error occurred. Please try again.');
    }
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

/**
 * Export functions for use by other modules and HTML onclick handlers
 */
window.openSuspendModal = openSuspendModal;
window.closeSuspendModal = closeSuspendModal;
window.liftSuspension = liftSuspension;
window.updateUserDetailsWithSuspension = updateUserDetailsWithSuspension;