/**
 * admin-panel.js
 * Handles all admin panel functionality including user management, role assignment, and game creation
 */

// ============================================
// GLOBAL STATE
// ============================================
let selectedUserId = null;

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize admin panel module
 */
function initializeAdminPanel() {
    console.log('Admin panel module initialized');
    attachAdminEventListeners();

    // Refresh user list badges after GM mappings load
    refreshUserListBadges();
}

/**
 * Attach all admin-related event listeners
 */
function attachAdminEventListeners() {
    // User item click handlers
    const userItems = document.querySelectorAll('.user-item');
    const detailsPanel = document.getElementById('userDetailsPanel');

    if (userItems && detailsPanel) {
        userItems.forEach(item => {
            item.addEventListener('click', async function() {
                await handleUserItemClick(this);
            });
        });
    }

    // Create game form submission
    const createGameForm = document.getElementById('createGameForm');
    if (createGameForm) {
        createGameForm.addEventListener('submit', handleCreateGameSubmit);
    }
}

// ============================================
// USER SEARCH
// ============================================

/**
 * Filter users in the user list
 */
function filterUsers() {
    const input = document.getElementById('userSearch');
    const filter = input.value.toLowerCase();
    const items = document.getElementById('userItems').getElementsByTagName('li');

    for (let i = 0; i < items.length; i++) {
        const text = items[i].textContent || items[i].innerText;
        items[i].style.display = text.toLowerCase().includes(filter) ? '' : 'none';
    }
}

/**
 * Build role badges for a user from their data attributes
 */
function buildBadgesFromUserItem(item) {
    const userid = parseInt(item.dataset.userid);
    const isAdmin = item.dataset.isAdmin === '1';
    const isGm = item.dataset.isGm === '1';
    const isPlayer = item.dataset.isPlayer === '1';

    // Build roles array
    const roles = [];
    if (isAdmin) roles.push('Admin');
    if (isGm) roles.push('Game Manager');
    if (isPlayer) roles.push('Player');

    // Generate badges with icons
    return buildUniversalRoleBadges({
        userId: userid,
        roles: roles,
        contextGameId: null
    });
}

/**
 * Refresh badges in the user list after GM mappings are loaded
 */
async function refreshUserListBadges() {
    // Wait for GM mappings to load
    if (typeof loadGMGameMappings === 'function' && !gmMappingsLoaded) {
        await loadGMGameMappings();
    }

    // Update each user item's badges
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(item => {
        const badgesHTML = buildBadgesFromUserItem(item);

        // Find the badge container in this user item
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
 * Handle user item click to show details
 */
async function handleUserItemClick(item) {
    const userid = item.dataset.userid;
    const username = item.dataset.username;
    const firstname = item.dataset.firstname;
    const lastname = item.dataset.lastname;
    const email = item.dataset.email;
    const date = item.dataset.date;
    const isActive = item.dataset.active === 'true';
    const lastSeen = item.dataset.lastSeen;

    selectedUserId = userid;

    // Ensure GM mappings are loaded
    if (typeof loadGMGameMappings === 'function' && !gmMappingsLoaded) {
        await loadGMGameMappings();
    }

    // Use the shared badge builder function
    const roleBadges = buildBadgesFromUserItem(item);

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

    // Highlight selected user
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(u => u.classList.remove('active'));
    item.classList.add('active');

    // Attach role change handler
    const goBtn = document.getElementById('roleGoBtn');
    if (goBtn) {
        goBtn.addEventListener('click', function() {
            handleRoleChange(username);
        });
    }

    // Update with suspension info (if suspensions.js is loaded)
    if (typeof updateUserDetailsWithSuspension === 'function') {
        await updateUserDetailsWithSuspension(userid);
    }
}

// ============================================
// ROLE MANAGEMENT
// ============================================

/**
 * Handle role assignment/removal
 */
async function handleRoleChange(username) {
    const actionSelect = document.getElementById('roleActionSelect');
    const roleSelect = document.getElementById('roleTypeSelect');
    const goBtn = document.getElementById('roleGoBtn');
    const statusMessage = document.getElementById('roleStatusMessage');

    if (!actionSelect || !roleSelect) return;

    const action = actionSelect.value;  // 'assign' or 'remove'
    const role = roleSelect.value;      // 'Admin' or 'Game Manager'

    // Disable button during request
    goBtn.disabled = true;
    goBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    // Hide previous messages
    statusMessage.style.display = 'none';

    try {
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

        // Show status message
        statusMessage.style.display = 'block';

        if (data.success) {
            // Success message
            statusMessage.style.backgroundColor = '#d4edda';
            statusMessage.style.color = '#155724';
            statusMessage.style.border = '1px solid #c3e6cb';
            statusMessage.innerHTML = `
                <i class="fas fa-check-circle"></i> ${data.message}
            `;

            // Refresh the page after 2 seconds to show updated stats
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            // Error message
            statusMessage.style.backgroundColor = '#f8d7da';
            statusMessage.style.color = '#721c24';
            statusMessage.style.border = '1px solid #f5c6cb';
            statusMessage.innerHTML = `
                <i class="fas fa-exclamation-circle"></i> ${data.message}
            `;
        }
    } catch (error) {
        console.error('Error managing role:', error);
        statusMessage.style.display = 'block';
        statusMessage.style.backgroundColor = '#f8d7da';
        statusMessage.style.color = '#721c24';
        statusMessage.style.border = '1px solid #f5c6cb';
        statusMessage.innerHTML = `
            <i class="fas fa-exclamation-circle"></i> Failed to update role. Please try again.
        `;
    } finally {
        // Re-enable button
        goBtn.disabled = false;
        goBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    }
}

// ============================================
// USER DELETION
// ============================================

/**
 * Confirm user deletion with warning dialog
 */
function confirmRemoveUser(userId, username, fullName) {
    // Create custom confirmation modal with strong warning
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header" style="background-color: #d32f2f; color: white;">
                <h2><i class="fas fa-exclamation-triangle"></i> Permanently Delete User</h2>
            </div>
            <div class="modal-body">
                <div style="background-color: #fff3cd; border-left: 4px solid #ff9800; padding: 1rem; margin-bottom: 1rem; border-radius: 4px;">
                    <strong style="color: #d32f2f;"><i class="fas fa-exclamation-circle"></i> WARNING:</strong>
                    <p style="color: #856404; margin-top: 0.5rem; margin-bottom: 0;">
                        This action is <strong>PERMANENT</strong> and <strong>CANNOT BE UNDONE</strong>.
                    </p>
                </div>

                <p style="margin-bottom: 1rem;">
                    You are about to permanently delete:
                </p>

                <div style="background-color: #000000; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                    <p style="margin: 0.25rem 0;"><strong>Name:</strong> ${fullName}</p>
                    <p style="margin: 0.25rem 0;"><strong>Username:</strong> @${username}</p>
                </div>

                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">
                    This will delete all associated data including:
                </p>

                <ul style="color: var(--text-secondary); font-size: 0.875rem; margin-left: 1.5rem; margin-bottom: 1rem;">
                    <li>User account and profile</li>
                    <li>Permissions and roles</li>
                    <li>Discord connectivity</li>
                    <li>Their life essence</li>
                </ul>

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

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Store modal reference
    modal.id = 'removeUserModal';

    // Enable delete button only when checkbox is checked
    const checkbox = document.getElementById('confirmDeleteCheckbox');
    const deleteBtn = document.getElementById('confirmDeleteBtn');

    checkbox.addEventListener('change', function() {
        deleteBtn.disabled = !this.checked;
    });

    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeRemoveUserModal();
        }
    });
}

/**
 * Close the remove user modal
 */
function closeRemoveUserModal() {
    const modal = document.getElementById('removeUserModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

/**
 * Execute user deletion
 */
async function removeUser(userId, username, fullName) {
    const deleteBtn = document.getElementById('confirmDeleteBtn');
    const originalText = deleteBtn.innerHTML;

    // Show loading state
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

    try {
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

            // Reload page to refresh user list
            window.location.reload();
        } else {
            // Show error message
            alert(`Error: ${data.message}`);

            // Re-enable button
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
        }
    } catch (error) {
        console.error('Error removing user:', error);
        alert('An error occurred while removing the user. Please try again.');

        // Re-enable button
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = originalText;
    }
}

// ============================================
// GAME CREATION
// ============================================

/**
 * Open create game modal
 */
function openCreateGameModal() {
    const modal = document.getElementById('createGameModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Reset form
    document.getElementById('createGameForm').reset();
    document.getElementById('gameFormMessage').style.display = 'none';

    // Reset image preview
    const imagePreview = document.getElementById('imagePreview');
    if (imagePreview) {
        imagePreview.style.display = 'none';
    }
}

/**
 * Close create game modal
 */
function closeCreateGameModal() {
    const modal = document.getElementById('createGameModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

/**
 * Handle create game form submission
 */
async function handleCreateGameSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const submitBtnText = document.getElementById('submitGameBtnText');
    const submitBtnSpinner = document.getElementById('submitGameBtnSpinner');
    const formMessage = document.getElementById('gameFormMessage');

    submitBtn.disabled = true;
    submitBtnText.style.display = 'none';
    submitBtnSpinner.style.display = 'inline-block';

    const formData = new FormData(e.target);

    const teamSizeCheckboxes = document.querySelectorAll('input[name="teamSize"]:checked');
    const teamSizes = Array.from(teamSizeCheckboxes).map(cb => parseInt(cb.value));

    formData.append('team_sizes', JSON.stringify(teamSizes));

    if (teamSizes.length === 0) {
        formMessage.textContent = 'Please select at least one team size';
        formMessage.className = 'form-message error';
        formMessage.style.display = 'block';

        submitBtn.disabled = false;
        submitBtnText.style.display = 'inline';
        submitBtnSpinner.style.display = 'none';
        return;
    }

    try {
        const response = await fetch('/create-game', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            formMessage.textContent = data.message || 'Game created successfully!';
            formMessage.className = 'form-message success';
            formMessage.style.display = 'block';

            // Clear the games cache
            if (typeof clearGamesCache === 'function') {
                clearGamesCache();
            }

            // Refresh all game dropdowns on the page
            await refreshAllGameDropdowns();

            // If on the communities/rosters tab, reload games
            if (typeof loadGames === 'function') {
                await loadGames();
            }

            // Close modal after brief delay
            setTimeout(() => {
                closeCreateGameModal();
                formMessage.style.display = 'none';
                window.location.reload();
            }, 1500);

        } else {
            throw new Error(data.message || 'Failed to create game');
        }
    } catch (error) {
        formMessage.textContent = error.message || 'Failed to create game. Please try again.';
        formMessage.className = 'form-message error';
        formMessage.style.display = 'block';

        submitBtn.disabled = false;
        submitBtnText.style.display = 'inline';
        submitBtnSpinner.style.display = 'none';
    }
}

// ============================================
// GAME DELETION
// ============================================

/**
 * Confirm game deletion
 */
function confirmDeleteGame(gameId, gameTitle) {
    if (!confirm(`Are you sure you want to delete "${gameTitle}"?\n\nThis action cannot be undone and may affect associated events.`)) {
        return;
    }

    deleteGame(gameId, gameTitle);
}

/**
 * Delete game from database
 */
async function deleteGame(gameId, gameTitle) {
    try {
        const response = await fetch('/delete-game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ game_id: gameId })
        });

        const data = await response.json();

        if (data.success) {
            // Clear the games cache
            if (typeof clearGamesCache === 'function') {
                clearGamesCache();
            }

            alert(`"${gameTitle}" has been deleted successfully!`);

            // Refresh all game dropdowns on the page
            await refreshAllGameDropdowns();

            // If on the communities/rosters tab, reload games
            if (typeof loadGames === 'function') {
                await loadGames();
            }
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error deleting game:', error);
        alert('An error occurred while deleting the game. Please try again.');
    }
}

/**
 * Refresh all game dropdowns on the current page
 */
async function refreshAllGameDropdowns() {
    // List of all game dropdown IDs that might exist on the page
    const dropdownIds = [
        { selectId: 'game', loadingId: 'gameLoadingIndicator' },           // Create event modal
        { selectId: 'editGame', loadingId: 'editGameLoadingIndicator' },   // Edit event modal
        { selectId: 'gameFilter', loadingId: 'gameFilterLoadingIndicator' } // Events filter
    ];

    // Refresh each dropdown that exists
    for (const dropdown of dropdownIds) {
        const selectElement = document.getElementById(dropdown.selectId);
        if (selectElement && typeof populateGameDropdown === 'function') {
            await populateGameDropdown(dropdown.selectId, dropdown.loadingId);
        }
    }
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

// Make functions available globally for onclick handlers
window.initializeAdminPanel = initializeAdminPanel;
window.filterUsers = filterUsers;
window.handleRoleChange = handleRoleChange;
window.confirmRemoveUser = confirmRemoveUser;
window.closeRemoveUserModal = closeRemoveUserModal;
window.removeUser = removeUser;
window.openCreateGameModal = openCreateGameModal;
window.closeCreateGameModal = closeCreateGameModal;
window.confirmDeleteGame = confirmDeleteGame;
window.deleteGame = deleteGame;
window.refreshUserListBadges = refreshUserListBadges;
window.refreshAllGameDropdowns = refreshAllGameDropdowns;