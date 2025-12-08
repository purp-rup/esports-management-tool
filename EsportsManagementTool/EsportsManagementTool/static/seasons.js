/**
 * Seasons Management JavaScript
 * Handles UI and API interactions for seasons system
 */

let currentSeason = null;
let seasonHistory = [];

/**
 * Open the Manage Seasons modal
 */
function openManageSeasonsModal() {
    const modal = document.getElementById('manageSeasonsModal');
    modal.style.display = 'block';

    // Prevent background scrolling
    document.body.style.overflow = 'hidden';

    // Load current season and history
    loadSeasonsData();
}

/**
 * Close the Manage Seasons modal
 */
function closeManageSeasonsModal() {
    const modal = document.getElementById('manageSeasonsModal');
    modal.style.display = 'none';

    // Restore background scrolling
    document.body.style.overflow = 'auto';

    // Clear any messages
    hideMessage('seasonsMessage');
}

/**
 * Load current season and history
 */
async function loadSeasonsData() {
    showLoading('seasonsLoading');
    hideContent('seasonsContent');

    try {
        // Fetch current season
        const currentResponse = await fetch('/api/seasons/current');
        const currentData = await currentResponse.json();

        if (currentData.success) {
            currentSeason = currentData.season;
        }

        // Fetch season history
        const historyResponse = await fetch('/api/seasons/history');
        const historyData = await historyResponse.json();

        if (historyData.success) {
            seasonHistory = historyData.seasons;
        }

        // Render the UI
        renderSeasonsUI();

    } catch (error) {
        console.error('Error loading seasons:', error);
        showMessage('seasonsMessage', 'Failed to load seasons data', 'error');
    } finally {
        hideLoading('seasonsLoading');
        showContent('seasonsContent');
    }
}

/**
 * Render the seasons UI based on current state
 */
function renderSeasonsUI() {
    const container = document.getElementById('seasonsContent');

    let html = '';

    // Current Season Section
    if (currentSeason) {
        html += `
            <div class="season-section">
                <h3><i class="fas fa-calendar-check"></i> Active Season</h3>
                <div class="current-season-card">
                    <div class="season-card-header">
                        <h4>${escapeHtml(currentSeason.season_name)}</h4>
                        <span class="season-status-badge active">Active</span>
                    </div>
                    <div class="season-card-body">
                        <div class="season-info-row">
                            <span class="season-info-label">Start Date:</span>
                            <span class="season-info-value">${formatDate(currentSeason.start_date)}</span>
                        </div>
                        <div class="season-info-row">
                            <span class="season-info-label">End Date:</span>
                            <span class="season-info-value">${formatDate(currentSeason.end_date)}</span>
                        </div>
                        <div class="season-info-row">
                            <span class="season-info-label">Duration:</span>
                            <span class="season-info-value">${calculateDuration(currentSeason.start_date, currentSeason.end_date)}</span>
                        </div>
                    </div>
                    <div class="season-card-actions">
                        <button class="btn btn-primary" onclick="openEditSeasonForm()">
                            <i class="fas fa-edit"></i> Edit Season
                        </button>
                        <button class="btn btn-secondary" onclick="confirmEndSeason()">
                            <i class="fas fa-stop-circle"></i> End Season
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="season-section">
                <h3><i class="fas fa-calendar-plus"></i> Create New Season</h3>
                <div class="empty-season-state">
                    <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
                    <p>No active season found. Create one to get started!</p>
                    <button class="btn btn-primary" onclick="openCreateSeasonForm()">
                        <i class="fas fa-plus"></i> Create Season
                    </button>
                </div>
            </div>
        `;
    }

    // Season History Section
    html += `
        <div class="season-section">
            <h3><i class="fas fa-history"></i> Season History</h3>
    `;

    if (seasonHistory.length > 0) {
        html += '<div class="season-history-list">';

        seasonHistory.forEach(season => {
            html += `
                <div class="season-history-card">
                    <div class="season-card-header">
                        <h4>${escapeHtml(season.season_name)}</h4>
                        <span class="season-status-badge ended">Ended</span>
                    </div>
                    <div class="season-card-body">
                        <div class="season-info-row">
                            <span class="season-info-label">Start Date:</span>
                            <span class="season-info-value">${formatDate(season.start_date)}</span>
                        </div>
                        <div class="season-info-row">
                            <span class="season-info-label">End Date:</span>
                            <span class="season-info-value">${formatDate(season.end_date)}</span>
                        </div>
                        <div class="season-info-row">
                            <span class="season-info-label">Duration:</span>
                            <span class="season-info-value">${calculateDuration(season.start_date, season.end_date)}</span>
                        </div>
                        ${season.creator_username ? `
                            <div class="season-info-row">
                                <span class="season-info-label">Created By:</span>
                                <span class="season-info-value">@${escapeHtml(season.creator_username)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        html += '</div>';
    } else {
        html += `
            <div class="empty-state-small">
                <i class="fas fa-inbox"></i>
                <p>No previous seasons found</p>
            </div>
        `;
    }

    html += '</div>';

    container.innerHTML = html;
}

/**
 * Open create season form
 */
function openCreateSeasonForm() {
    const container = document.getElementById('seasonsContent');

    container.innerHTML = `
        <form id="createSeasonForm" class="season-form" onsubmit="handleCreateSeason(event)">
            <h3><i class="fas fa-calendar-plus"></i> Create New Season</h3>

            <div class="form-group">
                <label for="newSeasonName">Season Name *</label>
                <input type="text"
                       id="newSeasonName"
                       name="season_name"
                       placeholder="e.g., Fall 2024, Spring 2025"
                       required>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="newSeasonStart">Start Date *</label>
                    <input type="date"
                           id="newSeasonStart"
                           name="start_date"
                           required>
                </div>

                <div class="form-group">
                    <label for="newSeasonEnd">End Date *</label>
                    <input type="date"
                           id="newSeasonEnd"
                           name="end_date"
                           required>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="loadSeasonsData()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button type="submit" class="btn btn-primary">
                    <span class="btn-text">Create Season</span>
                    <i class="btn-spinner fas fa-spinner fa-spin" style="display: none;"></i>
                </button>
            </div>
        </form>
    `;
}

/**
 * Open edit season form
 */
function openEditSeasonForm() {
    if (!currentSeason) return;

    const container = document.getElementById('seasonsContent');

    container.innerHTML = `
        <form id="editSeasonForm" class="season-form" onsubmit="handleUpdateSeason(event)">
            <h3><i class="fas fa-edit"></i> Edit Season</h3>

            <div class="form-group">
                <label for="editSeasonName">Season Name *</label>
                <input type="text"
                       id="editSeasonName"
                       name="season_name"
                       value="${escapeHtml(currentSeason.season_name)}"
                       required>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="editSeasonStart">Start Date</label>
                    <input type="date"
                           id="editSeasonStart"
                           name="start_date"
                           value="${currentSeason.start_date}"
                           disabled>
                    <small style="color: var(--text-secondary);">Start date cannot be changed</small>
                </div>

                <div class="form-group">
                    <label for="editSeasonEnd">End Date *</label>
                    <input type="date"
                           id="editSeasonEnd"
                           name="end_date"
                           value="${currentSeason.end_date}"
                           min="${currentSeason.start_date}"
                           required>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="loadSeasonsData()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button type="submit" class="btn btn-primary">
                    <span class="btn-text">Update Season</span>
                    <i class="btn-spinner fas fa-spinner fa-spin" style="display: none;"></i>
                </button>
            </div>
        </form>
    `;
}

/**
 * Handle create season form submission
 */
async function handleCreateSeason(event) {
    event.preventDefault();

    const form = event.target;
    const btn = form.querySelector('button[type="submit"]');
    const btnText = btn.querySelector('.btn-text');
    const btnSpinner = btn.querySelector('.btn-spinner');

    const formData = {
        season_name: form.season_name.value,
        start_date: form.start_date.value,
        end_date: form.end_date.value
    };

    // Disable button
    btn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';

    try {
        const response = await fetch('/api/seasons/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            showMessage('seasonsMessage', data.message, 'success');
            // Reload the seasons data
            await loadSeasonsData();
        } else {
            showMessage('seasonsMessage', data.message, 'error');
        }

    } catch (error) {
        console.error('Error creating season:', error);
        showMessage('seasonsMessage', 'Failed to create season', 'error');
    } finally {
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

/**
 * Handle update season form submission
 */
async function handleUpdateSeason(event) {
    event.preventDefault();

    if (!currentSeason) return;

    const form = event.target;
    const btn = form.querySelector('button[type="submit"]');
    const btnText = btn.querySelector('.btn-text');
    const btnSpinner = btn.querySelector('.btn-spinner');

    const formData = {
        season_name: form.season_name.value,
        end_date: form.end_date.value
    };

    // Disable button
    btn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';

    try {
        const response = await fetch(`/api/seasons/${currentSeason.season_id}/update`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            showMessage('seasonsMessage', data.message, 'success');
            // Reload the seasons data
            await loadSeasonsData();
        } else {
            showMessage('seasonsMessage', data.message, 'error');
        }

    } catch (error) {
        console.error('Error updating season:', error);
        showMessage('seasonsMessage', 'Failed to update season', 'error');
    } finally {
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

/**
 * Confirm ending the current season
 */
function confirmEndSeason() {
    if (!currentSeason) return;

    const confirmed = confirm(
        `Are you sure you want to end "${currentSeason.season_name}"?\n\n` +
        `This will make the season inactive and you'll be able to create a new one.`
    );

    if (confirmed) {
        endCurrentSeason();
    }
}

/**
 * End the current season
 */
async function endCurrentSeason() {
    if (!currentSeason) return;

    try {
        const response = await fetch(`/api/seasons/${currentSeason.season_id}/end`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showMessage('seasonsMessage', data.message, 'success');
            // Reload the seasons data
            await loadSeasonsData();
        } else {
            showMessage('seasonsMessage', data.message, 'error');
        }

    } catch (error) {
        console.error('Error ending season:', error);
        showMessage('seasonsMessage', 'Failed to end season', 'error');
    }
}

/**
 * Helper function to format dates
 */
function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Helper function to calculate duration between dates
 */
function calculateDuration(startStr, endStr) {
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 30) {
        return `${diffDays} days`;
    } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        const days = diffDays % 30;
        return days > 0 ? `${months} month${months > 1 ? 's' : ''}, ${days} day${days > 1 ? 's' : ''}`
                        : `${months} month${months > 1 ? 's' : ''}`;
    } else {
        const years = Math.floor(diffDays / 365);
        const months = Math.floor((diffDays % 365) / 30);
        return months > 0 ? `${years} year${years > 1 ? 's' : ''}, ${months} month${months > 1 ? 's' : ''}`
                          : `${years} year${years > 1 ? 's' : ''}`;
    }
}

/**
 * Helper function to escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Helper functions for UI state
 */
function showLoading(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';
}

function hideLoading(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

function showContent(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';
}

function hideContent(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

function showMessage(id, message, type) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = message;
        el.className = `form-message ${type}`;
        el.style.display = 'block';

        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => hideMessage(id), 5000);
        }
    }
}

function hideMessage(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}