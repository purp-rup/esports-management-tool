/**
 * Manage Communities JavaScript
 * Handles the unified community management modal
 * Similar structure to leagues.js
 */

let currentEditingCommunity = null;
let allCommunities = [];
let communityCroppedImageBlob = null;

/**
 * Open the Manage Communities modal
 */
async function openManageCommunitiesModal() {
    const modal = document.getElementById('manageCommunitiesModal');
    if (!modal) {
        console.error('Manage Communities modal not found');
        return;
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Load communities
    await loadCommunitiesForManagement();
}

/**
 * Close the Manage Communities modal
 */
function closeManageCommunitiesModal() {
    const modal = document.getElementById('manageCommunitiesModal');
    if (!modal) return;

    modal.style.display = 'none';
    document.body.style.overflow = 'auto';

    // Reset state
    currentEditingCommunity = null;
    allCommunities = [];
    communityCroppedImageBlob = null;
}

/**
 * Load all communities from server
 */
async function loadCommunitiesForManagement() {
    const loadingEl = document.getElementById('communitiesManageLoading');
    const contentEl = document.getElementById('communitiesManageContent');

    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';

    try {
        const response = await fetch('/api/games/manage/all');
        const data = await response.json();

        if (response.ok && data.success) {
            allCommunities = data.games || [];
            renderCommunitiesContent();
        } else {
            showCommunityMessage(data.message || 'Failed to load communities', 'error');
        }
    } catch (error) {
        console.error('Error loading communities:', error);
        showCommunityMessage('Failed to load communities', 'error');
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
    }
}

/**
 * Render communities content based on current state
 */
function renderCommunitiesContent() {
    const contentEl = document.getElementById('communitiesManageContent');
    if (!contentEl) return;

    if (allCommunities.length === 0) {
        // No communities - show create form immediately
        contentEl.innerHTML = `
            <div class="communities-empty-state">
                <div class="communities-empty-icon">
                    <i class="fas fa-gamepad"></i>
                </div>
                <h3>No Communities Registered</h3>
                <p>Create your first game community to get started</p>
            </div>
        `;
        showCommunityForm();
    } else {
        // Show communities grid with option to add new
        contentEl.innerHTML = `
            <div class="communities-modal-actions">
                <h3><i class="fas fa-list"></i> Registered Games</h3>
                <button class="btn btn-primary" onclick="showCommunityForm()">
                    <i class="fas fa-plus"></i> New Community
                </button>
            </div>
            <div class="communities-grid" id="communitiesGrid"></div>
        `;

        renderCommunitiesGrid();
    }
}

/**
 * Render the communities grid
 */
function renderCommunitiesGrid() {
    const gridEl = document.getElementById('communitiesGrid');
    if (!gridEl) return;

    gridEl.innerHTML = '';

    const isDeveloper = window.userPermissions?.is_developer || false;
    const isAdmin = window.userPermissions?.is_admin || false;

    allCommunities.forEach(community => {
        const card = document.createElement('div');
        // Add hidden class if community is hidden
        card.className = 'community-manage-card' + (community.hidden ? ' hidden-community' : '');

        const iconHtml = community.image_url
            ? `<img src="${community.image_url}" alt="${community.title}">`
            : '<i class="fas fa-gamepad"></i>';

        let gmInfoHtml = '';
        if (community.current_gm) {
            // Get GM profile picture or initials
            let gmProfilePic;
            if (community.current_gm.profile_picture) {
                gmProfilePic = `<img src="${community.current_gm.profile_picture}" alt="${community.current_gm.username}" class="gm-avatar-small">`;
            } else {
                const initials = community.current_gm.username.substring(0, 2).toUpperCase();
                gmProfilePic = `<div class="gm-avatar-initials-small">${initials}</div>`;
            }

            gmInfoHtml = `
                <div class="community-gm-compact">
                    <div class="gm-compact-label">Current GM:</div>
                    <div class="gm-compact-user">
                        ${gmProfilePic}
                        <span>@${escapeHtml(community.current_gm.username)}</span>
                    </div>
                </div>
            `;
        } else {
            gmInfoHtml = `
                <div class="community-gm-compact no-gm">
                    <div class="gm-compact-label">No current GM</div>
                </div>
            `;
        }

        // Hide/Unhide button (for admins and developers)
        const hideButtonHtml = (isAdmin || isDeveloper) ? `
            <div class="community-header-right">
                <div class="community-header-actions">
                    <button class="community-action-btn"
                            onclick="openGameDetailsModal(${community.id}); event.stopPropagation();"
                            title="View community">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${community.current_gm
                        ? `<button class="community-action-btn remove-gm-btn"
                                   onclick="removeGameManager(${community.id}); event.stopPropagation();"
                                   title="Remove GM">
                               <i class="fas fa-user-minus"></i>
                           </button>`
                        : `<button class="community-action-btn assign-gm-btn"
                                   onclick="openAssignGMModal(${community.id}); event.stopPropagation();"
                                   title="Assign GM">
                               <i class="fas fa-user-shield"></i>
                           </button>`
                    }
                    <button class="community-action-btn ${community.hidden ? 'hidden-active' : ''}"
                            onclick="toggleCommunityHidden(${community.id}); event.stopPropagation();"
                            title="${community.hidden ? 'Unhide' : 'Hide'} community">
                        <i class="fas fa-eye${community.hidden ? '' : '-slash'}"></i>
                    </button>
                </div>
                ${gmInfoHtml}
            </div>
        ` : '';

        let gmActionHtml = '';
        if (community.current_gm) {
            gmActionHtml = `
                <button class="btn btn-community-remove-gm"
                        onclick="removeGameManager(${community.id}); event.stopPropagation();">
                    <i class="fas fa-user-minus"></i> Remove GM
                </button>
            `;
        } else {
            gmActionHtml = `
                <button class="btn btn-community-assign-gm"
                        onclick="openAssignGMModal(${community.id}); event.stopPropagation();">
                    <i class="fas fa-user-shield"></i> Assign GM
                </button>
            `;
        }

        const deleteButtonHtml = isDeveloper
            ? `<button class="btn btn-community-delete"
                       onclick="confirmDeleteCommunity(${community.id}, '${escapeHtml(community.title)}'); event.stopPropagation();">
                    <i class="fas fa-trash"></i> Delete
               </button>`
            : `<button class="btn btn-community-hide" disabled style="opacity: 0.5; cursor: not-allowed;">
                    <i class="fas fa-lock"></i> Developer Only
               </button>`;

        card.innerHTML = `
            ${hideButtonHtml}

            <div class="community-manage-header">
                <div class="community-manage-icon">
                    ${iconHtml}
                </div>
                <div class="community-manage-info">
                    <div class="community-manage-title">
                        ${escapeHtml(community.title)}
                    </div>
                    <span class="community-abbreviation">${escapeHtml(community.abbreviation)}</span>
                    <div class="community-division">
                        <i class="fas fa-tag"></i> ${escapeHtml(community.division)}
                    </div>
                </div>
            </div>

            <div class="community-action-buttons">
                <button class="btn btn-secondary" onclick="editCommunity(${community.id}); event.stopPropagation();">
                    <i class="fas fa-edit"></i> Edit
                </button>
                ${deleteButtonHtml}
            </div>
        `;

        gridEl.appendChild(card);
    });
}

/**
 * Show the community form (for create or edit)
 */
function showCommunityForm(community = null) {
    const contentEl = document.getElementById('communitiesManageContent');
    if (!contentEl) return;

    currentEditingCommunity = community;
    const isEditing = community !== null;

    // Image preview
    const imagePreviewHtml = community && community.image_url
        ? `<img src="${community.image_url}" alt="Community icon">`
        : '<i class="fas fa-gamepad"></i>';

    // Division dropdown options
    const divisions = ['Strategy', 'Shooter', 'Sports', 'Other'];
    const divisionOptionsHtml = divisions.map(div =>
        `<option value="${div}" ${community && community.division === div ? 'selected' : ''}>${div}</option>`
    ).join('');

    // Team sizes checkboxes
    const teamSizeValues = community ? community.team_sizes.split(',').map(s => s.trim()) : [];
    const teamSizesHtml = Array.from({length: 10}, (_, i) => i + 1).map(size => {
        const checked = teamSizeValues.includes(size.toString());
        return `
            <label class="team-size-checkbox">
                <input type="checkbox" name="teamSize" value="${size}" ${checked ? 'checked' : ''}>
                <span>
                    <i class="fas fa-${size === 1 ? 'user' : 'users'} checkbox-icon"></i>
                    <div class="checkbox-text">${size} Player${size > 1 ? 's' : ''}</div>
                </span>
            </label>
        `;
    }).join('');

    contentEl.innerHTML = `
        <div class="communities-modal-actions">
            <h3>
                <i class="fas fa-${isEditing ? 'edit' : 'plus'}"></i>
                ${isEditing ? 'Edit' : 'Create'} Community
            </h3>
            ${allCommunities.length > 0 ? `
                <button class="btn btn-secondary" onclick="loadCommunitiesForManagement()">
                    <i class="fas fa-arrow-left"></i> Back to Communities
                </button>
            ` : ''}
        </div>

        <form id="communityForm" onsubmit="submitCommunityForm(event)">
            <div class="community-form-group">
                <label for="communityTitle">Game Title *</label>
                <input type="text"
                       id="communityTitle"
                       name="title"
                       placeholder="e.g., League of Legends, Valorant"
                       value="${community ? escapeHtml(community.title) : ''}"
                       required>
            </div>

            <div class="community-form-group">
                <label for="communityAbbreviation">Abbreviation *</label>
                <input type="text"
                       id="communityAbbreviation"
                       name="abbreviation"
                       placeholder="e.g., LOL, VAL"
                       value="${community ? escapeHtml(community.abbreviation) : ''}"
                       maxlength="5"
                       pattern="[A-Za-z0-9 ]+"
                       style="text-transform: uppercase;"
                       required>
                <small>Max 5 characters, letters and numbers only. Used for team IDs.</small>
            </div>

            <div class="community-form-group">
                <label for="communityDivision">Division *</label>
                <select id="communityDivision" name="division" required>
                    <option value="">Select division</option>
                    ${divisionOptionsHtml}
                </select>
                <small>Choose the category this game belongs to</small>
            </div>

            <div class="community-form-group">
                <label>Game Icon/Image</label>
                <div class="community-image-upload">
                    <div class="community-image-preview" id="communityImagePreview">
                        ${imagePreviewHtml}
                    </div>
                    <input type="file"
                           id="communityImage"
                           name="image"
                           accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                           onchange="previewCommunityImage(event)">
                    <small>Recommended: Square image, at least 200x200px (PNG, JPG, GIF, WEBP)</small>
                </div>
            </div>

            <div class="community-form-group">
                <label for="communityDescription">Description *</label>
                <textarea id="communityDescription"
                          name="description"
                          placeholder="Enter game description"
                          rows="4"
                          required>${community ? escapeHtml(community.description) : ''}</textarea>
            </div>

            <div class="community-form-group">
                <label>Team Size(s) *</label>
                <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                    Select all applicable team sizes for this game
                </p>
                <div class="team-sizes-grid">
                    ${teamSizesHtml}
                </div>
            </div>

            <div id="communityFormMessage" class="form-message" style="display: none;"></div>

            <div class="form-actions">
                ${allCommunities.length > 0 ? `
                    <button type="button" class="btn btn-secondary" onclick="loadCommunitiesForManagement()">
                        Cancel
                    </button>
                ` : ''}
                <button type="submit" class="btn btn-primary">
                    <span id="communitySubmitBtnText">
                        <i class="fas fa-${isEditing ? 'save' : 'plus'}"></i>
                        ${isEditing ? 'Update' : 'Create'} Community
                    </span>
                    <i id="communitySubmitBtnSpinner" class="fas fa-spinner fa-spin" style="display: none;"></i>
                </button>
            </div>
        </form>
    `;

    // Auto-uppercase abbreviation input
    const abbrevInput = document.getElementById('communityAbbreviation');
    if (abbrevInput) {
        abbrevInput.addEventListener('input', function(e) {
            this.value = this.value.toUpperCase();
        });
    }
}

/**
 * Preview community image when file is selected
 */
function previewCommunityImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        alert('Please select a valid image file (PNG, JPG, GIF, or WEBP)');
        event.target.value = '';
        return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Image file size must be less than 5MB');
        event.target.value = '';
        return;
    }

    // Open cropper (reuse existing cropper from leagues or avatar)
    currentImageField = 'community';
    openImageCropper(file);
}

/**
 * Submit community form (create or update)
 */
async function submitCommunityForm(event) {
    event.preventDefault();

    const submitBtn = document.getElementById('communitySubmitBtnText');
    const spinner = document.getElementById('communitySubmitBtnSpinner');
    const form = event.target;
    const formData = new FormData();

    // Get form values
    const title = form.querySelector('#communityTitle').value;
    const abbreviation = form.querySelector('#communityAbbreviation').value.toUpperCase();
    const division = form.querySelector('#communityDivision').value;
    const description = form.querySelector('#communityDescription').value;

    // Get selected team sizes
    const teamSizeCheckboxes = form.querySelectorAll('input[name="teamSize"]:checked');
    const teamSizes = Array.from(teamSizeCheckboxes).map(cb => cb.value);

    if (teamSizes.length === 0) {
        showCommunityFormMessage('Please select at least one team size', 'error');
        return;
    }

    const isEditing = currentEditingCommunity !== null;

    // Use the correct keys that match the backend
    if (isEditing) {
        // Update route expects: title, description, division, team_sizes, image
        formData.append('title', title);
        formData.append('abbreviation', abbreviation);
        formData.append('description', description);
        formData.append('division', division);
        formData.append('team_sizes', JSON.stringify(teamSizes));
    } else {
        // Create route expects: gameTitle, gameDescription, division, team_sizes, gameImage
        formData.append('gameTitle', title);
        formData.append('abbreviation', abbreviation);
        formData.append('gameDescription', description);
        formData.append('division', division);
        formData.append('team_sizes', JSON.stringify(teamSizes));
    }

    // Handle image with correct key based on operation
    if (communityCroppedImageBlob) {
        const filename = 'community_icon_' + Date.now() + '.png';
        const imageKey = isEditing ? 'image' : 'gameImage';
        formData.append(imageKey, communityCroppedImageBlob, filename);
    } else {
        const fileInput = document.getElementById('communityImage');
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const imageKey = isEditing ? 'image' : 'gameImage';
            formData.append(imageKey, fileInput.files[0]);
        }
    }

    // Show loading state
    if (submitBtn) submitBtn.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';

    try {
        const url = isEditing
            ? `/api/games/manage/${currentEditingCommunity.id}`
            : '/create-game';

        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Show success notification
            showDeleteSuccessMessage(
                data.message || (isEditing ? 'Community updated successfully' : 'Community created successfully')
            );

            // Clear cropped image
            communityCroppedImageBlob = null;

            // Reload communities after delay
            setTimeout(() => {
                loadCommunitiesForManagement();
            }, 1500);
        } else {
            // Show error in form
            showCommunityFormMessage(data.message || 'Failed to save community', 'error');

            // Reset button state
            if (submitBtn) submitBtn.style.display = 'inline';
            if (spinner) spinner.style.display = 'none';
        }
    } catch (error) {
        console.error('Error submitting community form:', error);
        showCommunityFormMessage('Failed to save community', 'error');

        // Reset button state
        if (submitBtn) submitBtn.style.display = 'inline';
        if (spinner) spinner.style.display = 'none';
    }
}

/**
 * Edit an existing community
 */
function editCommunity(communityId) {
    const community = allCommunities.find(c => c.id === communityId);
    if (community) {
        showCommunityForm(community);
    }
}

/**
 * Apply crop for community image
 * This needs to be called when the universal cropper's "Apply Crop" button is clicked
 */
function applyCropForCommunity() {
    if (!cropper) return;

    cropper.getCroppedCanvas({
        width: 400,
        height: 400,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    }).toBlob((blob) => {
        communityCroppedImageBlob = blob;

        // Update preview
        const preview = document.getElementById('communityImagePreview');
        if (preview) {
            const url = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${url}" alt="Cropped icon">`;
        }

        closeImageCropper();
    }, 'image/png');
}

/**
 * Confirm community deletion using universal delete modal
 */
function confirmDeleteCommunity(communityId, communityTitle) {
    const community = allCommunities.find(c => c.id === communityId);
    if (!community) return;

    const additionalInfo = `
        <div style="margin-top: 1rem; padding: 1rem; background: rgba(255, 82, 82, 0.1); border: 1px solid rgba(255, 82, 82, 0.3); border-radius: 8px;">
            <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
                <i class="fas fa-exclamation-triangle" style="color: #ff5252;"></i>
                This will permanently delete:
            </p>
            <ul style="margin: 0.5rem 0 0 1.5rem; color: var(--text-secondary); font-size: 0.875rem;">
                <li>All community members (${community.member_count} members)</li>
                <li>All teams (${community.team_count} teams)</li>
                <li>Game icon and information</li>
            </ul>
            <p style="margin: 0.5rem 0 0 0; color: #ff5252; font-size: 0.875rem; font-weight: 600;">
                This action cannot be undone.
            </p>
        </div>
    `;

    openDeleteConfirmModal({
        title: 'Delete Community?',
        itemName: communityTitle,
        message: `Are you sure you want to delete ${communityTitle}?`,
        additionalInfo: additionalInfo,
        buttonText: 'Delete Community',
        onConfirm: executeCommunityDeletion,
        itemId: communityId
    });
}

/**
 * Execute the actual community deletion
 */
async function executeCommunityDeletion(communityId) {
    try {
        const response = await fetch(`/api/games/manage/${communityId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            closeDeleteConfirmModal();
            showDeleteSuccessMessage(data.message || 'Community deleted successfully');

            setTimeout(() => {
                loadCommunitiesForManagement();
            }, 1500);
        } else {
            closeDeleteConfirmModal();
            showDeleteErrorMessage(data.message || 'Failed to delete community');
        }
    } catch (error) {
        console.error('Error deleting community:', error);
        closeDeleteConfirmModal();
        showDeleteErrorMessage('Failed to delete community');
    }
}

/**
 * Show message in community modal (for form validation errors)
 */
function showCommunityMessage(message, type) {
    const messageEl = document.getElementById('communitiesMessage');
    if (!messageEl) {
        const formMessageEl = document.getElementById('communityFormMessage');
        if (formMessageEl) {
            showCommunityFormMessage(message, type);
        }
        return;
    }

    messageEl.textContent = message;
    messageEl.className = `form-message ${type}`;
    messageEl.style.display = 'block';

    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

/**
 * Show message in community form
 */
function showCommunityFormMessage(message, type) {
    const messageEl = document.getElementById('communityFormMessage');
    if (!messageEl) return;

    messageEl.textContent = message;
    messageEl.className = `form-message ${type}`;
    messageEl.style.display = 'block';

    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

// ===============================
// HIDE COMMUNITY FUNCTIONALITY
// ===============================

/**
 * Toggle hidden status of a community
 */
async function toggleCommunityHidden(communityId) {
    const community = allCommunities.find(c => c.id === communityId);
    if (!community) return;

    const action = community.hidden ? 'unhide' : 'hide';

    try {
        const response = await fetch(`/api/games/manage/${communityId}/toggle-hidden`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Update local state
            community.hidden = data.hidden;

            // Show success message
            showDeleteSuccessMessage(data.message || `Community ${action}d successfully`);

            // Re-render grid to show visual changes
            renderCommunitiesGrid();
        } else {
            showDeleteErrorMessage(data.message || `Failed to ${action} community`);
        }
    } catch (error) {
        console.error(`Error toggling hidden status:`, error);
        showDeleteErrorMessage(`Failed to ${action} community`);
    }
}

// ============================================
// GM ASSIGNMENT FUNCTIONALITY
// ============================================

/**
 * Open assign GM modal
 * Shows list of available GMs for assignment
 * @param {number} gameId - Game ID to assign GM to
 */
async function openAssignGMModal(gameId) {
    currentGameIdForGM = gameId;
    const modal = document.getElementById('assignGMModal');
    const loading = document.getElementById('gmListLoading');
    const container = document.getElementById('gmListContainer');
    const empty = document.getElementById('gmListEmpty');
    const gmList = document.getElementById('gmList');

    // Show modal and loading state
    modal.style.display = 'block';
    loading.style.display = 'block';
    container.style.display = 'none';
    empty.style.display = 'none';
    document.body.style.overflow = 'hidden';

    try {
        // Fetch available GMs from API
        const response = await fetch(`/api/game/${gameId}/available-gms`);
        const data = await response.json();

        if (data.success && data.game_managers.length > 0) {
            // Display list of available GMs
            gmList.innerHTML = '';

            data.game_managers.forEach(gm => {
                const gmItem = createGMSelectionItem(gm, gameId);
                gmList.appendChild(gmItem);
            });

            loading.style.display = 'none';
            container.style.display = 'block';
        } else {
            // No GMs available
            loading.style.display = 'none';
            empty.style.display = 'block';
        }
    } catch (error) {
        // Handle errors
        console.error('Error loading GMs:', error);
        loading.innerHTML = '<p style="color: #ff5252;">Failed to load Game Managers</p>';
    }
}

/**
 * Create a GM selection item element
 * @param {Object} gm - GM user object
 * @param {number} gameId - Game ID for assignment
 * @returns {HTMLElement} GM selection item element
 */
function createGMSelectionItem(gm, gameId) {
    const gmItem = document.createElement('div');
    gmItem.className = 'gm-selection-item';
    gmItem.onclick = () => confirmAssignGM(gameId, gm.id, gm.name);

    // Profile picture or initials
    let profilePicHTML;
    if (gm.profile_picture) {
        profilePicHTML = `<img src="${gm.profile_picture}" alt="${gm.name}" class="member-avatar">`;
    } else {
        const initials = gm.name.split(' ').map(n => n[0]).join('');
        profilePicHTML = `<div class="member-avatar-initials">${initials}</div>`;
    }

    gmItem.innerHTML = `
        ${profilePicHTML}
        <div class="member-info">
            <div class="member-name">${gm.name}</div>
            <div class="member-username">@${gm.username}</div>
        </div>
        <i class="fas fa-chevron-right" style="margin-left: auto; color: var(--text-secondary);"></i>
    `;

    return gmItem;
}

/**
 * Close assign GM modal
 */
function closeAssignGMModal() {
    const modal = document.getElementById('assignGMModal');
    modal.style.display = 'none';

    // Check if there are other modals still open
    const openModals = document.querySelectorAll('.modal');
    const hasOpenModals = Array.from(openModals).some(m => {
        if (m.id === 'assignGMModal') return false; // Exclude the modal we're closing
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

    currentGameIdForGM = null;
}

/**
 * Confirm GM assignment using delete confirmation modal
 */
async function confirmAssignGM(gameId, gmUserId, gmName) {
    const community = allCommunities.find(c => c.id === gameId);

    openDeleteConfirmModal({
        title: 'Assign Game Manager?',
        itemName: gmName,
        message: `Are you sure you want to assign ${gmName} as the Game Manager?`,
        additionalInfo: `
            <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(33, 150, 243, 0.1); border: 1px solid rgba(33, 150, 243, 0.3); border-radius: 6px; color: #2196F3;">
                <i class="fas fa-info-circle"></i> This will grant ${gmName} Game Manager permissions for <strong>${community?.title || 'this community'}</strong>.
            </div>
        `,
        buttonText: 'Assign GM',
        onConfirm: async () => {
            try {
                const response = await fetch(`/api/game/${gameId}/assign-gm`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gm_user_id: gmUserId })
                });
                const data = await response.json();

                closeDeleteConfirmModal();

                if (data.success) {
                    showDeleteSuccessMessage(data.message || 'Game Manager assigned successfully');
                    closeAssignGMModal();

                    setTimeout(async () => {
                        if (typeof refreshGMGameMappings === 'function') await refreshGMGameMappings();
                        await loadCommunitiesForManagement();
                    }, 1500);
                } else {
                    showDeleteErrorMessage(data.message || 'Failed to assign Game Manager');
                }
            } catch (error) {
                console.error('Error assigning GM:', error);
                closeDeleteConfirmModal();
                showDeleteErrorMessage('Failed to assign Game Manager');
            }
        },
        itemId: gameId
    });
}

/**
 * Remove GM assignment from a game using delete confirmation modal
 */
async function removeGameManager(gameId) {
    const community = allCommunities.find(c => c.id === gameId);
    if (!community?.current_gm) return;

    const gmName = community.current_gm.username;

    openDeleteConfirmModal({
        title: 'Remove Game Manager?',
        itemName: `@${gmName}`,
        message: `Are you sure you want to remove @${gmName} as Game Manager?`,
        additionalInfo: `
            <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(255, 152, 0, 0.1); border: 1px solid rgba(255, 152, 0, 0.3); border-radius: 6px; color: #ff9800;">
                <i class="fas fa-exclamation-triangle"></i> This will remove Game Manager permissions for <strong>${community.title}</strong> from @${gmName}.
            </div>
        `,
        buttonText: 'Remove GM',
        onConfirm: async () => {
            try {
                const response = await fetch(`/api/game/${gameId}/remove-gm`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();

                closeDeleteConfirmModal();

                if (data.success) {
                    showDeleteSuccessMessage(data.message || 'Game Manager removed successfully');

                    setTimeout(async () => {
                        if (typeof refreshGMGameMappings === 'function') await refreshGMGameMappings();
                        await loadCommunitiesForManagement();
                    }, 1500);
                } else {
                    showDeleteErrorMessage(data.message || 'Failed to remove Game Manager');
                }
            } catch (error) {
                console.error('Error removing GM:', error);
                closeDeleteConfirmModal();
                showDeleteErrorMessage('Failed to remove Game Manager');
            }
        },
        itemId: gameId
    });
}

// Export functions to global scope
window.openManageCommunitiesModal = openManageCommunitiesModal;
window.closeManageCommunitiesModal = closeManageCommunitiesModal;
window.loadCommunitiesForManagement = loadCommunitiesForManagement;
window.showCommunityForm = showCommunityForm;
window.editCommunity = editCommunity;
window.confirmDeleteCommunity = confirmDeleteCommunity;
window.previewCommunityImage = previewCommunityImage;
window.submitCommunityForm = submitCommunityForm;
window.applyCropForCommunity = applyCropForCommunity;
window.toggleCommunityHidden = toggleCommunityHidden;

// GM assignment
window.openAssignGMModal = openAssignGMModal;
window.closeAssignGMModal = closeAssignGMModal;
window.confirmAssignGM = confirmAssignGM;
window.removeGameManager = removeGameManager;