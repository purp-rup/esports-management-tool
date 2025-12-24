/**
 * admin-panel.js
 * ============================================================================
 * Handles all admin panel functionality including:
 * - User management and search
 * - Role assignment and removal
 * - Game creation and deletion
 * - User details display
 * - Suspension management integration
 * - ORGANZIED BY CLAUDEAI
 * ============================================================================
 */

// ============================================
// GLOBAL STATE
// ============================================

/**
 * Currently selected user ID in the admin panel
 * @type {number|null}
 */
let selectedUserId = null;

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the admin panel module
 * Sets up event listeners and refreshes user list badges
 * Called on page load
 */
function initializeAdminPanel() {
    console.log('Admin panel module initialized');

    // Attach all event listeners for admin functionality
    attachAdminEventListeners();

    // Refresh user list badges after GM mappings load
    // This ensures badges reflect the most current role information
    refreshUserListBadges();
}

/**
 * Attach all admin-related event listeners
 * Uses event delegation where possible for better performance
 */
function attachAdminEventListeners() {
    // User item click handlers - shows user details panel
    const userItems = document.querySelectorAll('.user-item');
    const detailsPanel = document.getElementById('userDetailsPanel');

    if (userItems && detailsPanel) {
        userItems.forEach(item => {
            item.addEventListener('click', async function() {
                await handleUserItemClick(this);
            });
        });
    }
}

// ============================================
// USER SEARCH & FILTERING
// ============================================

/**
 * Filter users via server-side search
 * Performs database query for matching users
 * Debounced to avoid excessive API calls
 */
let searchTimeout = null;

async function filterUsers() {
    const input = document.getElementById('userSearch');
    const searchQuery = input.value.trim();
    const userItemsContainer = document.getElementById('userItems');

    // Clear previous timeout to debounce search
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // Show loading state
    userItemsContainer.innerHTML = '<li style="padding: 1rem; text-align: center; color: var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Searching...</li>';

    // Debounce: wait 300ms after user stops typing
    searchTimeout = setTimeout(async () => {
        try {
            // Fetch filtered users from server
            const response = await fetch(`/admin/search-users?query=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();

            if (data.success) {
                if (data.users.length === 0) {
                    // Show empty state
                    userItemsContainer.innerHTML = '<li style="padding: 1rem; text-align: center; color: var(--text-secondary);">No users found</li>';
                } else {
                    // Render filtered users
                    renderUserItems(data.users);
                }
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Error searching users:', error);
            userItemsContainer.innerHTML = '<li style="padding: 1rem; text-align: center; color: #f44336;">Error loading users. Please try again.</li>';
        }
    }, 300); // 300ms debounce delay
}

/**
 * Render user items in the list
 * @param {Array} users - Array of user objects from server
 */
function renderUserItems(users) {
    const userItemsContainer = document.getElementById('userItems');
    userItemsContainer.innerHTML = '';

    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-item';

        // Set data attributes for user details panel
        li.setAttribute('data-userid', user.id);
        li.setAttribute('data-username', user.username);
        li.setAttribute('data-firstname', user.firstname);
        li.setAttribute('data-lastname', user.lastname);
        li.setAttribute('data-email', user.email);
        li.setAttribute('data-date', user.date_registered);
        li.setAttribute('data-active', user.is_active ? 'true' : 'false');
        li.setAttribute('data-last-seen', user.last_seen);
        li.setAttribute('data-is-admin', user.is_admin ? '1' : '0');
        li.setAttribute('data-is-gm', user.is_gm ? '1' : '0');
        li.setAttribute('data-is-player', user.is_player ? '1' : '0');
        li.setAttribute('data-is-developer', user.is_developer ? '1' : '0');

        // Build role badges
        const roles = [];
        if (user.is_admin) roles.push('Admin');
        if (user.is_developer) roles.push('Developer');
        if (user.is_gm) roles.push('Game Manager');
        if (user.is_player) roles.push('Player');

        const badgesHTML = buildUniversalRoleBadges({
            userId: user.id,
            roles: roles,
            contextGameId: null
        });

        // Build user item HTML
        li.innerHTML = `
            <div>
                <strong>${user.firstname} ${user.lastname}</strong>
                <p>@${user.username} — ${user.email}</p>
                <div style="margin-top: 0.25rem; display: flex; gap: 0.5rem; align-items: center;">
                    ${badgesHTML}
                </div>
            </div>
        `;

        // Add click handler
        li.addEventListener('click', async function() {
            await handleUserItemClick(this);
        });

        userItemsContainer.appendChild(li);
    });
}

// ============================================
// BADGE GENERATION
// ============================================

/**
 * Build role badges for a user from their data attributes
 * @param {HTMLElement} item - The user list item element
 * @returns {string} HTML string containing role badges
 */
function buildBadgesFromUserItem(item) {
    const userid = parseInt(item.dataset.userid);
    const isAdmin = item.dataset.isAdmin === '1';
    const isGm = item.dataset.isGm === '1';
    const isPlayer = item.dataset.isPlayer === '1';
    const isDeveloper = item.dataset.isDeveloper ==='1';

    // Build roles array based on data attributes
    const roles = [];
    if (isAdmin) roles.push('Admin');
    if (isGm) roles.push('Game Manager');
    if (isPlayer) roles.push('Player');
    if (isDeveloper) roles.push('Developer');

    // Generate badges with icons using the universal badge builder
    return buildUniversalRoleBadges({
        userId: userid,
        roles: roles,
        contextGameId: null
    });
}

/**
 * Refresh badges in the user list after GM mappings are loaded
 * This ensures all user items display the most current role information
 * Async to wait for GM mappings if they haven't loaded yet
 */
async function refreshUserListBadges() {
    // Wait for GM mappings to load if the function exists and mappings aren't loaded
    if (typeof loadGMGameMappings === 'function' && !gmMappingsLoaded) {
        await loadGMGameMappings();
    }

    // Update each user item's badges with fresh data
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(item => {
        const badgesHTML = buildBadgesFromUserItem(item);

        // Find the badge container in this user item (identified by inline style)
        const badgeContainer = item.querySelector('[style*="margin-top: 0.25rem"]');
        if (badgeContainer) {
            badgeContainer.innerHTML = badgesHTML;
        }
    });
}

// ============================================
// USER DETAILS PANEL
// ============================================

/**
 * Handle user item click to display user details
 * Fetches user data from data attributes and displays in details panel
 * @param {HTMLElement} item - The clicked user list item
 */
async function handleUserItemClick(item) {
    // Extract user data from data attributes
    const userid = item.dataset.userid;
    const username = item.dataset.username;
    const firstname = item.dataset.firstname;
    const lastname = item.dataset.lastname;
    const email = item.dataset.email;
    const date = item.dataset.date;
    const isActive = item.dataset.active === 'true';
    const lastSeen = item.dataset.lastSeen;

    // Store selected user ID for reference by other functions
    selectedUserId = userid;

    // Ensure GM mappings are loaded before generating badges
    if (typeof loadGMGameMappings === 'function' && !gmMappingsLoaded) {
        await loadGMGameMappings();
    }

    // Generate role badges using the shared badge builder
    const roleBadges = buildBadgesFromUserItem(item);

    // Build and inject the user details panel HTML
    const detailsPanel = document.getElementById('userDetailsPanel');
    detailsPanel.innerHTML = `
        <h3>User Details</h3>
        <div class="user-detail-info">
            <p><strong>Full Name:</strong> ${firstname} ${lastname}</p>
            <p><strong>Username:</strong> @${username}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Date Registered:</strong> ${date}</p>
            <p><strong>Status:</strong>
                ${isActive ?
                    '<span class="status-badge active"><i class="fas fa-circle" style="font-size: 0.5rem; margin-right: 0.25rem;"></i> Online</span>' :
                    '<span class="status-badge inactive">Offline</span>'}
            </p>
            <p><strong>Active:</strong> ${lastSeen}</p>
            <p><strong>Current Roles:</strong> ${roleBadges || '<span style="color: var(--text-secondary);">No roles assigned</span>'}</p>
        </div>

        <div class="admin-actions">
            <label><strong>Role Management:</strong></label>
            <div class="role-action-row">
                <select id="roleActionSelect" class="styled-dropdown">
                    <option value="assign">Assign</option>
                    <option value="remove">Remove</option>
                </select>

                <select id="roleTypeSelect" class="styled-dropdown">
                    <option value="Game Manager">Game Manager</option>
                    <option value="Admin">Admin</option>
                </select>

                <button id="roleGoBtn" class="btn-go">
                    <i class="fa-solid fa-check"></i>
                </button>
            </div>

            <div id="roleStatusMessage" style="display: none; margin-top: 1rem; padding: 0.75rem; border-radius: 4px;"></div>

            <div class="action-buttons">
                <button class="btn btn-secondary" onclick="openSuspendModal(${userid}, '${username}', '${firstname} ${lastname}')">
                    <i class="fas fa-user-clock"></i> Suspend User
                </button>
                <button class="btn btn-danger" onclick="confirmRemoveUser(${userid}, '${username}', '${firstname} ${lastname}')">
                    <i class="fas fa-user-times"></i> Remove User
                </button>
            </div>
        </div>
    `;

    // Highlight the selected user in the list
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(u => u.classList.remove('active'));
    item.classList.add('active');

    // Attach role change handler to the "Go" button
    const goBtn = document.getElementById('roleGoBtn');
    if (goBtn) {
        goBtn.addEventListener('click', function() {
            handleRoleChange(username);
        });
    }

    // Update with suspension info if suspensions module is loaded
    if (typeof updateUserDetailsWithSuspension === 'function') {
        await updateUserDetailsWithSuspension(userid);
    }
}

// ============================================
// ROLE MANAGEMENT
// ============================================

/**
 * Handle role assignment or removal for a user
 * Makes API call to update user roles and displays status message
 * @param {string} username - Username of the user to update
 */
async function handleRoleChange(username) {
    // Get form elements
    const actionSelect = document.getElementById('roleActionSelect');
    const roleSelect = document.getElementById('roleTypeSelect');
    const goBtn = document.getElementById('roleGoBtn');
    const statusMessage = document.getElementById('roleStatusMessage');

    // Validate elements exist
    if (!actionSelect || !roleSelect) return;

    // Get selected action and role
    const action = actionSelect.value;  // 'assign' or 'remove'
    const role = roleSelect.value;      // 'Admin' or 'Game Manager'

    // Disable button during request to prevent duplicate submissions
    goBtn.disabled = true;
    goBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    // Hide any previous status messages
    statusMessage.style.display = 'none';

    try {
        // Make API request to manage role
        const response = await fetch('/admin/manage-role', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                action: action,
                role: role
            })
        });

        const data = await response.json();

        // Show status message container
        statusMessage.style.display = 'block';

        if (data.success) {
            // Display success message with green styling
            statusMessage.style.backgroundColor = '#d4edda';
            statusMessage.style.color = '#155724';
            statusMessage.style.border = '1px solid #c3e6cb';
            statusMessage.innerHTML = `
                <i class="fas fa-check-circle"></i> ${data.message}
            `;

            // Reload page after 2 seconds to show updated stats and badges
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            // Display error message with red styling
            statusMessage.style.backgroundColor = '#f8d7da';
            statusMessage.style.color = '#721c24';
            statusMessage.style.border = '1px solid #f5c6cb';
            statusMessage.innerHTML = `
                <i class="fas fa-exclamation-circle"></i> ${data.message}
            `;
        }
    } catch (error) {
        // Handle network or other errors
        console.error('Error managing role:', error);
        statusMessage.style.display = 'block';
        statusMessage.style.backgroundColor = '#f8d7da';
        statusMessage.style.color = '#721c24';
        statusMessage.style.border = '1px solid #f5c6cb';
        statusMessage.innerHTML = `
            <i class="fas fa-exclamation-circle"></i> Failed to update role. Please try again.
        `;
    } finally {
        // Re-enable button with original icon
        goBtn.disabled = false;
        goBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    }
}

// ============================================
// USER DELETION
// ============================================

/**
 * Display confirmation modal for user deletion
 * Shows strong warning about permanent deletion with checkbox confirmation
 * @param {number} userId - User ID to delete
 * @param {string} username - Username for display
 * @param {string} fullName - Full name for display
 */
function confirmRemoveUser(userId, username, fullName) {
    // Create custom confirmation modal with strong warning styling
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.id = 'removeUserModal';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header" style="background-color: #d32f2f; color: white;">
                <h2><i class="fas fa-exclamation-triangle"></i> Permanently Delete User</h2>
            </div>
            <div class="modal-body">
                <!-- Warning Banner -->
                <div style="background-color: #fff3cd; border-left: 4px solid #ff9800; padding: 1rem; margin-bottom: 1rem; border-radius: 4px;">
                    <strong style="color: #d32f2f;"><i class="fas fa-exclamation-circle"></i> WARNING:</strong>
                    <p style="color: #856404; margin-top: 0.5rem; margin-bottom: 0;">
                        This action is <strong>PERMANENT</strong> and <strong>CANNOT BE UNDONE</strong>.
                    </p>
                </div>

                <p style="margin-bottom: 1rem;">
                    You are about to permanently delete:
                </p>

                <!-- User Info Display -->
                <div style="background-color: #000000; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                    <p style="margin: 0.25rem 0;"><strong>Name:</strong> ${fullName}</p>
                    <p style="margin: 0.25rem 0;"><strong>Username:</strong> @${username}</p>
                </div>

                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">
                    This will delete all associated data including:
                </p>

                <!-- Data Deletion List -->
                <ul style="color: var(--text-secondary); font-size: 0.875rem; margin-left: 1.5rem; margin-bottom: 1rem;">
                    <li>User account and profile</li>
                    <li>Permissions and roles</li>
                    <li>Discord connectivity</li>
                    <li>Their life essence</li>
                </ul>

                <!-- Confirmation Checkbox -->
                <div style="background-color: #ffebee; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="confirmDeleteCheckbox" style="margin-right: 0.5rem;">
                        <span style="color: #d32f2f; font-weight: 600;">
                            I understand this action cannot be undone
                        </span>
                    </label>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="closeRemoveUserModal()">
                    Cancel
                </button>
                <button class="btn btn-danger" id="confirmDeleteBtn" disabled onclick="removeUser(${userId}, '${username}', '${fullName}')">
                    <i class="fas fa-trash"></i> Permanently Delete User
                </button>
            </div>
        </div>
    `;

    // Add modal to DOM and prevent body scrolling
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Enable delete button only when checkbox is checked
    const checkbox = document.getElementById('confirmDeleteCheckbox');
    const deleteBtn = document.getElementById('confirmDeleteBtn');

    checkbox.addEventListener('change', function() {
        deleteBtn.disabled = !this.checked;
    });

    // Close modal on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeRemoveUserModal();
        }
    });
}

/**
 * Close the remove user modal and restore scrolling
 */
function closeRemoveUserModal() {
    const modal = document.getElementById('removeUserModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

/**
 * Execute user deletion after confirmation
 * Makes API call to delete user and refreshes page on success
 * @param {number} userId - User ID to delete
 * @param {string} username - Username for display (unused but kept for consistency)
 * @param {string} fullName - Full name for display (unused but kept for consistency)
 */
async function removeUser(userId, username, fullName) {
    const deleteBtn = document.getElementById('confirmDeleteBtn');
    const originalText = deleteBtn.innerHTML;

    // Show loading state
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

    try {
        // Make API request to delete user
        const response = await fetch('/admin/remove-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId })
        });

        const data = await response.json();

        if (data.success) {
            // Close modal
            closeRemoveUserModal();

            // Show success message
            alert(`✓ ${data.message}`);

            // Reload page to refresh user list and stats
            window.location.reload();
        } else {
            // Show error message
            alert(`Error: ${data.message}`);

            // Re-enable button with original text
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
        }
    } catch (error) {
        // Handle network or other errors
        console.error('Error removing user:', error);
        alert('An error occurred while removing the user. Please try again.');

        // Re-enable button with original text
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = originalText;
    }
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

/**
 * Make all functions globally accessible for:
 * - onclick handlers in HTML
 * - Other modules that need to call these functions
 * - Event handlers attached dynamically
 */
window.initializeAdminPanel = initializeAdminPanel;
window.filterUsers = filterUsers;
window.handleRoleChange = handleRoleChange;
window.confirmRemoveUser = confirmRemoveUser;
window.closeRemoveUserModal = closeRemoveUserModal;
window.removeUser = removeUser;
window.refreshUserListBadges = refreshUserListBadges;