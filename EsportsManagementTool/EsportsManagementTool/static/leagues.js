/**
 * League Management JavaScript
 * Handles league CRUD operations with image cropping
 */

let currentEditingLeague = null;
let allLeagues = [];
let cropper = null;
let croppedImageBlob = null;
let currentImageField = null; // Track which field is being edited

/**
 * Open the Manage Leagues modal
 */
async function openManageLeaguesModal() {
    const modal = document.getElementById('manageLeaguesModal');
    if (!modal) return;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Load leagues
    await loadLeagues();
}

/**
 * Close the Manage Leagues modal
 */
function closeManageLeaguesModal() {
    const modal = document.getElementById('manageLeaguesModal');
    if (!modal) return;

    modal.style.display = 'none';
    document.body.style.overflow = 'auto';

    // Reset state
    currentEditingLeague = null;
    allLeagues = [];
}

/**
 * Load all leagues from the server
 */
async function loadLeagues() {
    const loadingEl = document.getElementById('leaguesLoading');
    const contentEl = document.getElementById('leaguesContent');

    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';

    try {
        const response = await fetch('/league/all');
        const data = await response.json();

        if (response.ok) {
            allLeagues = data.leagues || [];
            renderLeaguesContent();
        } else {
            showLeagueMessage(data.error || 'Failed to load leagues', 'error');
        }
    } catch (error) {
        console.error('Error loading leagues:', error);
        showLeagueMessage('Failed to load leagues', 'error');
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
    }
}

/**
 * Render leagues content based on current state
 */
function renderLeaguesContent() {
    const contentEl = document.getElementById('leaguesContent');
    if (!contentEl) return;

    if (allLeagues.length === 0) {
        // No leagues - show create form immediately
        contentEl.innerHTML = `
            <div class="league-empty-state">
                <div class="league-empty-icon">
                    <i class="fas fa-trophy"></i>
                </div>
                <h3>No Leagues Registered</h3>
                <p>Create your first league to get started</p>
            </div>
        `;
        showLeagueForm();
    } else {
        // Show leagues grid with option to add new
        contentEl.innerHTML = `
            <div class="league-modal-actions">
                <h3><i class="fas fa-list"></i> Registered Leagues</h3>
                <button class="btn btn-primary" onclick="showLeagueForm()">
                    <i class="fas fa-plus"></i> Add New League
                </button>
            </div>
            <div class="league-grid" id="leagueGrid"></div>
        `;

        renderLeagueGrid();
    }
}

/**
 * Render the league grid
 */
function renderLeagueGrid() {
    const gridEl = document.getElementById('leagueGrid');
    if (!gridEl) return;

    gridEl.innerHTML = '';

    allLeagues.forEach(league => {
        const card = document.createElement('div');
        card.className = 'league-card';

        const logoHtml = league.logo
            ? `<img src="${league.logo}" alt="${league.name}">`
            : '<i class="fas fa-trophy"></i>';

        const websiteHtml = league.website_url
            ? `<a href="${league.website_url}"
                  class="league-card-url"
                  target="_blank"
                  rel="noopener noreferrer"
                  onclick="event.stopPropagation()">
                    <i class="fas fa-external-link-alt"></i>
                    Visit Website
               </a>`
            : '<span style="color: var(--text-secondary); font-size: 0.875rem;">No website</span>';

        card.innerHTML = `
            <div class="league-card-header">
                <div class="league-logo-container">
                    ${logoHtml}
                </div>
                <div class="league-card-info">
                    <h4 class="league-card-name">${escapeHtml(league.name)}</h4>
                    ${websiteHtml}
                </div>
            </div>
            <div class="league-card-actions">
                <button class="btn btn-secondary" onclick="editLeague(${league.id}); event.stopPropagation();">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-secondary" onclick="confirmDeleteLeague(${league.id}); event.stopPropagation();">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        `;

        gridEl.appendChild(card);
    });
}

/**
 * Show the league form (for create or edit)
 */
function showLeagueForm(league = null) {
    const contentEl = document.getElementById('leaguesContent');
    if (!contentEl) return;

    currentEditingLeague = league;
    const isEditing = league !== null;

    const logoPreviewHtml = league && league.logo
        ? `<img src="${league.logo}" alt="League logo">`
        : '<i class="fas fa-trophy"></i>';

    contentEl.innerHTML = `
        <div class="league-modal-actions">
            <h3>
                <i class="fas fa-${isEditing ? 'edit' : 'plus'}"></i>
                ${isEditing ? 'Edit' : 'Create'} League
            </h3>
            ${allLeagues.length > 0 ? `
                <button class="btn btn-secondary" onclick="loadLeagues()">
                    <i class="fas fa-arrow-left"></i> Back to Leagues
                </button>
            ` : ''}
        </div>

        <form id="leagueForm" onsubmit="submitLeagueForm(event)">
            <div class="league-form-group">
                <label for="leagueName">League Name *</label>
                <input type="text"
                       id="leagueName"
                       name="name"
                       placeholder="e.g., NACE Starleague, ECAC"
                       value="${league ? escapeHtml(league.name) : ''}"
                       required>
            </div>

            <div class="league-form-group">
                <label>League Logo</label>
                <div class="league-logo-upload">
                    <div class="league-logo-preview" id="leagueLogoPreview">
                        ${logoPreviewHtml}
                    </div>
                    <div class="league-logo-upload-input">
                        <input type="file"
                               id="leagueLogo"
                               name="logo"
                               accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                               onchange="previewLeagueLogo(event)">
                        <small>Recommended: Square image, at least 200x200px (PNG, JPG, GIF, WEBP)</small>
                    </div>
                </div>
            </div>

            <div class="league-form-group">
                <label for="leagueWebsite">League Website (Optional)</label>
                <input type="url"
                       id="leagueWebsite"
                       name="website_url"
                       placeholder="https://example.com"
                       value="${league && league.website_url ? escapeHtml(league.website_url) : ''}">
                <small>Full URL to the league's official website</small>
            </div>

            <div id="leagueFormMessage" class="form-message" style="display: none;"></div>

            <div class="form-actions">
                ${allLeagues.length > 0 ? `
                    <button type="button" class="btn btn-secondary" onclick="loadLeagues()">
                        Cancel
                    </button>
                ` : ''}
                <button type="submit" class="btn btn-primary">
                    <span id="leagueSubmitBtnText">
                        <i class="fas fa-${isEditing ? 'save' : 'plus'}"></i>
                        ${isEditing ? 'Update' : 'Create'} League
                    </span>
                    <i id="leagueSubmitBtnSpinner" class="fas fa-spinner fa-spin" style="display: none;"></i>
                </button>
            </div>
        </form>
    `;
}

/**
 * Preview league logo when file is selected - Now opens cropper
 */
function previewLeagueLogo(event) {
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

    currentImageField = 'league';
    openImageCropper(file);
}

/**
 * Open image cropper modal
 */
function openImageCropper(file) {
    const modal = document.getElementById('imageCropperModal');
    if (!modal) {
        console.error('Image cropper modal not found');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageElement = document.getElementById('imageToCrop');
        imageElement.src = e.target.result;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Initialize Cropper.js after a short delay to ensure image is loaded
        setTimeout(() => {
            if (cropper) {
                cropper.destroy();
            }

            cropper = new Cropper(imageElement, {
                aspectRatio: 1, // Square crop for logos
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 0.8,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
            });
        }, 100);
    };
    reader.readAsDataURL(file);
}

/**
 * Close image cropper modal
 */
function closeImageCropper() {
    const modal = document.getElementById('imageCropperModal');
    if (!modal) return;

    modal.style.display = 'none';
    document.body.style.overflow = 'auto';

    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
}

/**
 * Crop controls
 */
function cropZoomIn() {
    if (cropper) cropper.zoom(0.1);
}

function cropZoomOut() {
    if (cropper) cropper.zoom(-0.1);
}

function cropRotateLeft() {
    if (cropper) cropper.rotate(-90);
}

function cropRotateRight() {
    if (cropper) cropper.rotate(90);
}

function cropReset() {
    if (cropper) cropper.reset();
}

/**
 * Apply crop and close modal
 */
function applyCrop() {
    if (!cropper) return;

    cropper.getCroppedCanvas({
        width: 400,
        height: 400,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    }).toBlob((blob) => {
        croppedImageBlob = blob;

        // Update preview
        const preview = document.getElementById('leagueLogoPreview');
        if (preview) {
            const url = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${url}" alt="Cropped logo">`;
        }

        closeImageCropper();
    }, 'image/png');
}

/**
 * Submit league form (create or update)
 */
async function submitLeagueForm(event) {
    event.preventDefault();

    const submitBtn = document.getElementById('leagueSubmitBtnText');
    const spinner = document.getElementById('leagueSubmitBtnSpinner');
    const form = event.target;
    const formData = new FormData();

    // Add text fields
    const nameInput = form.querySelector('input[name="name"]');
    const websiteInput = form.querySelector('input[name="website_url"]');

    formData.append('name', nameInput ? nameInput.value : '');
    formData.append('website_url', websiteInput ? websiteInput.value : '');

    // Add image: Priority is cropped image, then original file
    if (croppedImageBlob) {
        const filename = 'league_logo_' + Date.now() + '.png';
        formData.append('logo', croppedImageBlob, filename);
    } else {
        const fileInput = document.getElementById('leagueLogo');
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            formData.append('logo', fileInput.files[0]);
        }
    }

    // Show loading state
    if (submitBtn) submitBtn.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';

    try {
        const isEditing = currentEditingLeague !== null;
        const url = isEditing
            ? `/league/${currentEditingLeague.id}`
            : '/league/create';

        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            showLeagueMessage(
                data.message || (isEditing ? 'League updated successfully' : 'League created successfully'),
                'success'
            );

            // Clear cropped image after successful upload
            croppedImageBlob = null;

            // Reload leagues after a short delay
            setTimeout(() => {
                loadLeagues();
            }, 1500);
        } else {
            showLeagueMessage(data.error || 'Failed to save league', 'error');

            // Reset button state
            if (submitBtn) submitBtn.style.display = 'inline';
            if (spinner) spinner.style.display = 'none';
        }
    } catch (error) {
        console.error('Error submitting league form:', error);
        showLeagueMessage('Failed to save league', 'error');

        // Reset button state
        if (submitBtn) submitBtn.style.display = 'inline';
        if (spinner) spinner.style.display = 'none';
    }
}

/**
 * Edit an existing league
 */
function editLeague(leagueId) {
    const league = allLeagues.find(l => l.id === leagueId);
    if (league) {
        showLeagueForm(league);
    }
}

/**
 * Confirm league deletion
 */
function confirmDeleteLeague(leagueId) {
    const league = allLeagues.find(l => l.id === leagueId);
    if (!league) return;

    const confirmMsg = `Are you sure you want to delete "${league.name}"? This action cannot be undone.`;

    if (confirm(confirmMsg)) {
        deleteLeague(leagueId);
    }
}

/**
 * Delete a league
 */
async function deleteLeague(leagueId) {
    try {
        const response = await fetch(`/league/${leagueId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            showLeagueMessage(data.message || 'League deleted successfully', 'success');

            // Reload leagues after a short delay
            setTimeout(() => {
                loadLeagues();
            }, 1500);
        } else {
            showLeagueMessage(data.error || 'Failed to delete league', 'error');
        }
    } catch (error) {
        console.error('Error deleting league:', error);
        showLeagueMessage('Failed to delete league', 'error');
    }
}

/**
 * Show message in league modal
 */
function showLeagueMessage(message, type) {
    const messageEl = document.getElementById('leaguesMessage');
    if (!messageEl) {
        // Try the form message if modal message doesn't exist
        const formMessageEl = document.getElementById('leagueFormMessage');
        if (formMessageEl) {
            formMessageEl.textContent = message;
            formMessageEl.className = `form-message ${type}`;
            formMessageEl.style.display = 'block';

            setTimeout(() => {
                formMessageEl.style.display = 'none';
            }, 5000);
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
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('manageLeaguesModal');
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeManageLeaguesModal();
            }
        });
    }
});