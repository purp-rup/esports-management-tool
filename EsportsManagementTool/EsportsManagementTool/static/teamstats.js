/**
 * teamstats.js
 * ============================================================================
 * TEAM STATISTICS MANAGEMENT
 * ORGANIZED BY CLAUDEAI
 * ============================================================================
 * Handles team performance tracking and statistics:
 * - Win/loss record display
 * - Win percentage calculation
 * - Match history timeline
 * - Match result recording (for GMs/Admins)
 * - Match result editing
 * - Statistics visualization with cards
 * - Integration with team match events
 *
 * This module provides comprehensive statistics tracking for esports teams,
 * allowing game managers to record match outcomes and view performance metrics.
 * ============================================================================
 */

// ============================================
// GLOBAL STATE
// ============================================

/**
 * Currently displayed team ID for stats
 * @type {string|null}
 */
let currentStatsTeamId = null;

/**
 * Game ID associated with current team
 * @type {string|null}
 */
let currentStatsGameId = null;

/**
 * Array of match events for current team
 * @type {Array}
 */
let matchEvents = [];

/**
 * Current team statistics object
 * Contains wins, losses, and calculated metrics
 * @type {Object|null}
 */
let teamStats = null;

// ============================================
// LEAGUE FILTERING STATE
// ============================================

/**
 * Currently selected league filter (null = all leagues)
 * @type {number|null}
 */
let currentLeagueFilter = null;

/**
 * Available leagues for current team
 * @type {Array}
 */
let availableLeagues = [];
// ============================================
// STATS TAB LOADING
// ============================================

/**
 * Load the stats tab when selected (with optional league filter)
 *
 * @param {string} teamId - ID of team to load stats for
 * @param {string} gameId - ID of game associated with team
 * @param {number|null} leagueId - Optional league ID to filter by
 */
async function loadStatsTab(teamId, gameId, leagueId = null) {
    console.log('Loading stats tab for team:', teamId, 'game:', gameId, 'league:', leagueId);

    // Store current context
    currentStatsTeamId = teamId;
    currentStatsGameId = gameId;
    currentLeagueFilter = leagueId;

    const statsPanel = document.getElementById('statsTabContent');

    if (!statsPanel) {
        console.error('Stats tab content not found');
        return;
    }

    // Show loading state
    statsPanel.innerHTML = `
        <div class="stats-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading statistics...</p>
        </div>
    `;

    try {
        // Build URL with optional league filter
        let url = `/api/teams/${teamId}/stats`;
        if (leagueId) {
            url += `?league_id=${leagueId}`;
        }

        // Fetch team statistics from API
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            // Store statistics and match events
            teamStats = data.stats;
            matchEvents = data.match_events || [];
            availableLeagues = data.team_leagues || [];

            // Render the complete stats UI
            renderStatsContent();
        } else {
            throw new Error(data.message || 'Failed to load statistics');
        }
    } catch (error) {
        console.error('Error loading stats:', error);

        // Show error state
        statsPanel.innerHTML = `
            <div class="stats-error">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Failed to Load Statistics</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// ============================================
// STATS RENDERING WITH LEAGUE FILTER
// ============================================

/**
 * Render the complete stats content with league filter dropdown
 * Displays summary cards and match history
 */
function renderStatsContent() {
    const statsPanel = document.getElementById('statsTabContent');

    // Calculate statistics
    const wins = parseInt(teamStats.wins) || 0;
    const losses = parseInt(teamStats.losses) || 0;
    const totalMatches = wins + losses;

    let winPercentage = '0';
    if (totalMatches > 0) {
        const rawPercentage = (wins / totalMatches) * 100;
        winPercentage = (rawPercentage % 1 === 0) ? rawPercentage.toFixed(0) : rawPercentage.toFixed(1);
    }

    // Build league filter dropdown
    let leagueFilterHTML = '';
    if (availableLeagues && availableLeagues.length > 0) {
        leagueFilterHTML = `
            <div class="stats-league-filter">
                <label for="statsLeagueFilter">
                    <i class="fas fa-trophy"></i> Filter by League:
                </label>
                <select id="statsLeagueFilter" onchange="handleLeagueFilterChange()">
                    <option value="">All Leagues</option>
                    ${availableLeagues.map(league => `
                        <option value="${league.id}" ${currentLeagueFilter === league.id ? 'selected' : ''}>
                            ${league.name}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    // Build stats UI
    statsPanel.innerHTML = `
        <div class="stats-container">
            <!-- League Filter Dropdown -->
            ${leagueFilterHTML}

            <!-- Stats Summary Cards -->
            <div class="stats-summary-grid">
                <!-- Wins Card -->
                <div class="stat-card stat-card-wins">
                    <div class="stat-card-icon">
                        <i class="fas fa-trophy"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-value">${wins}</div>
                        <div class="stat-card-label">Wins</div>
                    </div>
                </div>

                <!-- Losses Card -->
                <div class="stat-card stat-card-losses">
                    <div class="stat-card-icon">
                        <i class="fas fa-times-circle"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-value">${losses}</div>
                        <div class="stat-card-label">Losses</div>
                    </div>
                </div>

                <!-- Win Rate Card -->
                <div class="stat-card stat-card-percentage">
                    <div class="stat-card-icon">
                        <i class="fas fa-percent"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-value">${winPercentage}%</div>
                        <div class="stat-card-label">Win Rate</div>
                    </div>
                </div>

                <!-- Record Card -->
                <div class="stat-card stat-card-record">
                    <div class="stat-card-icon">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-value">${wins}-${losses}</div>
                        <div class="stat-card-label">Record</div>
                    </div>
                </div>
            </div>

            <!-- Match History Section -->
            <div class="match-history-section">
                <div class="section-header">
                    <h3>
                        <i class="fas fa-history"></i> 
                        Match History
                        ${currentLeagueFilter ? `<span style="color: var(--stockton-blue); font-size: 0.875rem; font-weight: normal; margin-left: 0.5rem;">(${availableLeagues.find(l => l.id === currentLeagueFilter)?.name})</span>` : ''}
                    </h3>
                </div>

                ${renderMatchHistory()}
            </div>
        </div>
    `;

}

// ============================================
// LEAGUE FILTER HANDLER
// ============================================

/**
 * Handle league filter dropdown change
 * Reloads stats with selected league filter
 */
function handleLeagueFilterChange() {
    const filterSelect = document.getElementById('statsLeagueFilter');
    if (!filterSelect) return;

    const selectedLeagueId = filterSelect.value ? parseInt(filterSelect.value) : null;
    
    // Reload stats with new filter
    loadStatsTab(currentStatsTeamId, currentStatsGameId, selectedLeagueId);
}

// ============================================
// MATCH HISTORY RENDERING
// ============================================

/**
 * Render match history list with league badges
 * Displays all recorded match results in chronological order
 *
 * @returns {string} HTML string for match history
 */
function renderMatchHistory() {
    if (!matchEvents || matchEvents.length === 0) {
        const filterText = currentLeagueFilter ? ' for this league' : '';
        return `
            <div class="match-history-empty">
                <i class="fas fa-calendar-times"></i>
                <p>No match results recorded yet${filterText}</p>
            </div>
        `;
    }

    const currentTeam = allTeamsData.find(t => t.TeamID === currentStatsTeamId);
    const isGameManager = currentTeam && currentTeam.gm_id === window.currentUserId;
    const isActiveSeason = window.currentTeamSeasonIsActive === 1;

    // Only allow editing if active season AND user is GM
    const canEdit = isGameManager && isActiveSeason;

    let html = '<div class="match-history-list">';

    matchEvents.forEach(match => {
        const resultClass = match.result ? match.result.toLowerCase() : 'pending';
        const resultIcon = match.result === 'win' ? 'fa-trophy' :
                          match.result === 'loss' ? 'fa-times-circle' :
                          'fa-clock';
        const resultText = match.result ? match.result.toUpperCase() : 'PENDING';

        const leagueBadge = match.league_name ? `
            <span class="match-league-badge" title="League: ${match.league_name}">
                <i class="fas fa-trophy"></i> ${match.league_name}
            </span>
        ` : '';

        html += `
            <div class="match-history-item" 
                 onclick="openMatchDetailsModal(${match.event_id})"
                 style="cursor: pointer;">
                <div class="match-date">
                    <i class="fas fa-calendar"></i>
                    ${match.date}
                </div>

                <div class="match-info">
                    <div class="match-name">${match.name}</div>
                    ${match.location ? `
                        <div class="match-location">
                            <i class="fas fa-map-marker-alt"></i> ${match.location}
                        </div>
                    ` : ''}
                    ${leagueBadge}
                </div>

                <div class="match-result match-result-${resultClass}">
                    <i class="fas ${resultIcon}"></i>
                    ${resultText}
                </div>

                ${canEdit ? `
                    <div class="match-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon"
                                onclick="editMatchResult(${match.event_id})"
                                title="Edit result">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    });

    html += '</div>';
    return html;
}

// ============================================
// RECORD MATCH RESULT MODAL
// ============================================

/**
 * Open modal to record a match result
 * Resets form and populates match events dropdown
 */
function openRecordResultModal() {
    // Check if season is active
    const isActiveSeason = window.currentTeamSeasonIsActive === 1;
    if (!isActiveSeason) {
        alert('Cannot record match results for teams from past seasons.');
        return;
    }

    const modal = document.getElementById('recordMatchResultModal');
    if (!modal) {
        console.error('Record match result modal not found');
        return;
    }

    // ========================================
    // RESET FORM STATE
    // ========================================
    const form = document.getElementById('recordMatchResultForm');
    if (form) {
        form.reset();
    }

    // Clear any previous messages
    const messageDiv = document.getElementById('recordResultMessage');
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }

    // Reset submit button state BEFORE populating dropdown
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = false;
        const btnText = submitBtn.querySelector('.btn-text');
        const btnSpinner = submitBtn.querySelector('.btn-spinner');
        if (btnText) btnText.style.display = 'inline';
        if (btnSpinner) btnSpinner.style.display = 'none';
    }

    // Clear any selected result options
    const resultOptions = document.querySelectorAll('.result-option');
    resultOptions.forEach(option => option.classList.remove('selected'));

    // ========================================
    // POPULATE FORM
    // ========================================
    // Populate events dropdown with available matches
    populateMatchEventsDropdown();

    // ========================================
    // SHOW MODAL
    // ========================================
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Close record result modal
 * Restores body scrolling
 */
function closeRecordResultModal() {
    const modal = document.getElementById('recordMatchResultModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Populate the events dropdown with past match events
 * Fetches match-type events that can have results recorded
 *
 * @param {number} preSelectEventId - Optional event ID to pre-select after loading
 */
async function populateMatchEventsDropdown(preSelectEventId = null) {
    const select = document.getElementById('matchEventSelect');
    if (!select) return;

    // Show loading state
    select.innerHTML = '<option value="">Loading matches...</option>';

    try {
        // Fetch available match events
        const response = await fetch(`/api/teams/${currentStatsTeamId}/match-events`);
        const data = await response.json();

        if (data.success && data.events && data.events.length > 0) {
            // Build dropdown options
            select.innerHTML = '<option value="">Select a match...</option>';

            data.events.forEach(event => {
                const option = document.createElement('option');
                option.value = event.event_id;
                option.textContent = `${event.date} - ${event.name}`;
                option.dataset.hasResult = event.has_result;

                // Indicate if result already recorded
                if (event.has_result) {
                    option.textContent += ` (${event.result.toUpperCase()})`;
                }

                select.appendChild(option);
            });

            // Pre-select the event if specified (used when editing)
            if (preSelectEventId) {
                select.value = preSelectEventId;
            }
        } else {
            // No matches available
            select.innerHTML = '<option value="">No past matches found</option>';
        }
    } catch (error) {
        console.error('Error loading match events:', error);
        select.innerHTML = '<option value="">Error loading matches</option>';
    }
}

// ============================================
// RESULT SELECTION
// ============================================

/**
 * Handle result radio button selection
 * Updates visual feedback for selected result option
 *
 * @param {string} result - Selected result ('win' or 'loss')
 */
function handleResultSelection(result) {
    // Get result option buttons
    const winBtn = document.querySelector('.result-option[data-result="win"]');
    const lossBtn = document.querySelector('.result-option[data-result="loss"]');

    if (winBtn && lossBtn) {
        // Update selected class based on choice
        winBtn.classList.toggle('selected', result === 'win');
        lossBtn.classList.toggle('selected', result === 'loss');
    }
}

// ============================================
// MATCH RESULT SUBMISSION
// ============================================

/**
 * Submit match result to backend
 * Validates form data and updates statistics
 *
 * @param {Event} event - Form submit event
 */
async function submitMatchResult(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    const messageDiv = document.getElementById('recordResultMessage');

    // ========================================
    // SHOW LOADING STATE
    // ========================================
    submitBtn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnSpinner) btnSpinner.style.display = 'inline-block';
    if (messageDiv) messageDiv.style.display = 'none';

    // ========================================
    // COLLECT FORM DATA
    // ========================================
    const formData = {
        team_id: currentStatsTeamId,
        event_id: document.getElementById('matchEventSelect').value,
        result: document.querySelector('input[name="matchResult"]:checked')?.value,
        notes: document.getElementById('matchNotes').value
    };

    // ========================================
    // VALIDATION
    // ========================================
    if (!formData.event_id) {
        showMessage(messageDiv, 'Please select a match', 'error');
        resetSubmitButton(submitBtn, btnText, btnSpinner);
        return;
    }

    if (!formData.result) {
        showMessage(messageDiv, 'Please select a result (Win or Loss)', 'error');
        resetSubmitButton(submitBtn, btnText, btnSpinner);
        return;
    }

    // ========================================
    // SUBMIT TO BACKEND
    // ========================================
    try {
        const response = await fetch('/api/teams/record-match-result', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            // Show success message
            showMessage(messageDiv, data.message, 'success');

            // Close modal and reload stats after brief delay
            setTimeout(() => {
                closeRecordResultModal();
                // Reload stats tab to show updated data
                loadStatsTab(currentStatsTeamId, currentStatsGameId);
            }, 1500);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        // Show error message
        showMessage(messageDiv, error.message || 'Failed to record result', 'error');
        resetSubmitButton(submitBtn, btnText, btnSpinner);
    }
}

// ============================================
// EDIT MATCH RESULT
// ============================================

/**
 * Edit an existing match result
 * Opens modal with pre-populated form data
 *
 * @param {number} eventId - ID of event to edit
 */
async function editMatchResult(eventId) {
    // Find the match in cached data
    const match = matchEvents.find(m => m.event_id === eventId);
    if (!match) {
        alert('Match not found');
        return;
    }

    // ========================================
    // OPEN MODAL
    // ========================================
    const modal = document.getElementById('recordMatchResultModal');
    if (!modal) {
        console.error('Record match result modal not found');
        return;
    }

    // ========================================
    // RESET FORM STATE
    // ========================================
    const form = document.getElementById('recordMatchResultForm');
    if (form) {
        form.reset();
    }

    // Clear any previous messages
    const messageDiv = document.getElementById('recordResultMessage');
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }

    // Reset submit button state
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = false;
        const btnText = submitBtn.querySelector('.btn-text');
        const btnSpinner = submitBtn.querySelector('.btn-spinner');
        if (btnText) btnText.style.display = 'inline';
        if (btnSpinner) btnSpinner.style.display = 'none';
    }

    // Clear any selected result options
    const resultOptions = document.querySelectorAll('.result-option');
    resultOptions.forEach(option => option.classList.remove('selected'));

    // ========================================
    // SHOW MODAL
    // ========================================
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // ========================================
    // POPULATE FORM WITH EXISTING DATA
    // ========================================
    // Populate dropdown with the event pre-selected, then set other fields
    await populateMatchEventsDropdown(eventId);

    // Set the result radio button if there's an existing result
    if (match.result) {
        const resultRadio = document.querySelector(`input[name="matchResult"][value="${match.result}"]`);
        if (resultRadio) {
            resultRadio.checked = true;
            handleResultSelection(match.result);
        }
    }

    // Set notes if they exist
    const notesField = document.getElementById('matchNotes');
    if (match.notes && notesField) {
        notesField.value = match.notes;
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Show a message to the user
 *
 * @param {HTMLElement} element - Message container element
 * @param {string} message - Message text to display
 * @param {string} type - Message type ('success' or 'error')
 */
function showMessage(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.className = `form-message ${type}`;
    element.style.display = 'block';
}

/**
 * Reset submit button to default state
 *
 * @param {HTMLElement} btn - Submit button element
 * @param {HTMLElement} textSpan - Button text span
 * @param {HTMLElement} spinner - Loading spinner element
 */
function resetSubmitButton(btn, textSpan, spinner) {
    if (!btn) return;
    btn.disabled = false;
    if (textSpan) textSpan.style.display = 'inline';
    if (spinner) spinner.style.display = 'none';
}
/**
 * Open match details modal
 * Shows full information about a specific match
 * 
 * @param {number} eventId - ID of the match event to display
 */
async function openMatchDetailsModal(eventId) {
    const modal = document.getElementById('matchDetailsModal');
    if (!modal) {
        console.error('Match details modal not found');
        return;
    }

    const loadingDiv = document.getElementById('matchDetailsLoading');
    const contentDiv = document.getElementById('matchDetailsContent');
    const editBtn = document.getElementById('editMatchDetailsBtn');

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    loadingDiv.style.display = 'block';
    contentDiv.style.display = 'none';

    try {
        const match = matchEvents.find(m => m.event_id === eventId);
        if (!match) throw new Error('Match not found');

        // Date
        const matchDate = new Date(match.date + 'T00:00:00');
        const formattedDate = matchDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Time
        const timeDisplay = match.start_time || 'Time not set';

        // Result
        let resultHTML = `
            <span class="match-detail-result pending">
                <i class="fas fa-clock"></i>
                PENDING
            </span>
        `;

        if (match.result) {
            const resultClass = match.result.toLowerCase();
            const resultIcon = match.result === 'win' ? 'fa-trophy' : 'fa-times-circle';

            resultHTML = `
                <span class="match-detail-result ${resultClass}">
                    <i class="fas ${resultIcon}"></i>
                    ${match.result.toUpperCase()}
                </span>
            `;
        }

        // League
        let leagueHTML = '';
        if (match.league_name) {
            leagueHTML = `
                <div class="match-detail-section">
                    <div class="match-detail-label">
                        <i class="fas fa-trophy"></i>
                        League
                    </div>
                    <div class="match-detail-value">
                        <span class="match-league-badge">
                            <i class="fas fa-trophy"></i> ${match.league_name}
                        </span>
                    </div>
                </div>
            `;
        }

        // Notes
        let notesHTML = '';
        if (match.notes && match.notes.trim()) {
            notesHTML = `
                <div class="match-detail-section full-width">
                    <div class="match-detail-label">
                        <i class="fas fa-sticky-note"></i>
                        Notes
                    </div>
                    <div class="match-detail-notes">
                        ${match.notes}
                    </div>
                </div>
            `;
        }

        // Metadata
        let metadataHTML = '';
        if (match.result && match.recorded_by) {
            metadataHTML = `
                <div class="match-detail-section full-width">
                    <div class="match-detail-label">
                        <i class="fas fa-info-circle"></i>
                        Recording Information
                    </div>
                    <div class="match-detail-metadata">
                        <div class="match-detail-metadata-item">
                            <i class="fas fa-user"></i>
                            <span>Recorded by ${match.recorded_by}</span>
                        </div>
                        <div class="match-detail-metadata-item">
                            <i class="fas fa-clock"></i>
                            <span>
                                Recorded on ${new Date(match.recorded_at).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Title
        document.getElementById('matchDetailsTitle').textContent = match.name;

        // Render ONCE
        contentDiv.innerHTML = `
            <div class="match-details-grid">
                <div class="match-detail-section">
                    <div class="match-detail-label">
                        <i class="fas fa-calendar-day"></i>
                        Date
                    </div>
                    <div class="match-detail-value">${formattedDate}</div>
                </div>

                <div class="match-detail-section">
                    <div class="match-detail-label">
                        <i class="fas fa-clock"></i>
                        Time
                    </div>
                    <div class="match-detail-value">${timeDisplay}</div>
                </div>

                <div class="match-detail-section">
                    <div class="match-detail-label">
                        <i class="fas fa-map-marker-alt"></i>
                        Location
                    </div>
                    <div class="match-detail-value">${match.location || 'Not specified'}</div>
                </div>

                <div class="match-detail-section">
                    <div class="match-detail-label">
                        <i class="fas fa-flag-checkered"></i>
                        Result
                    </div>
                    <div class="match-detail-value">
                        ${resultHTML}
                    </div>
                </div>

                ${leagueHTML}
                ${notesHTML}
                ${metadataHTML}
            </div>
        `;

        // Edit permissions
        const currentTeam = allTeamsData.find(t => t.TeamID === currentStatsTeamId);
        const isGameManager = currentTeam && currentTeam.gm_id === window.currentUserId;
        const isActiveSeason = window.currentTeamSeasonIsActive === 1;

         // Only show edit button if: GM + active season + match has result
        if (editBtn && isGameManager && isActiveSeason && match.result) {
            editBtn.style.display = 'flex';
            editBtn.onclick = () => {
                closeMatchDetailsModal();
                editMatchResult(eventId);
            };
        } else if (editBtn) {
            editBtn.style.display = 'none';
        }

        loadingDiv.style.display = 'none';
        contentDiv.style.display = 'block';

    } catch (error) {
        console.error('Error loading match details:', error);
        contentDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <i class="fas fa-exclamation-circle" style="font-size: 3rem; margin-bottom: 1rem; color: #ff5252;"></i>
                <p>Failed to load match details</p>
                <small>${error.message}</small>
            </div>
        `;
        loadingDiv.style.display = 'none';
        contentDiv.style.display = 'block';
    }
}


/**
 * Close match details modal
 */
function closeMatchDetailsModal() {
    const modal = document.getElementById('matchDetailsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

/**
 * Export functions for use by other modules and HTML onclick handlers
 */
window.loadStatsTab = loadStatsTab;
window.openRecordResultModal = openRecordResultModal;
window.closeRecordResultModal = closeRecordResultModal;
window.openMatchDetailsModal = openMatchDetailsModal;
window.closeMatchDetailsModal = closeMatchDetailsModal;
window.handleResultSelection = handleResultSelection;
window.submitMatchResult = submitMatchResult;
window.editMatchResult = editMatchResult;
window.handleLeagueFilterChange = handleLeagueFilterChange;
