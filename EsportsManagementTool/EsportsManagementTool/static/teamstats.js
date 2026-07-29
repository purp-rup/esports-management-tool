/**
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

// Calculate stats in the background and display filter
async function renderStatsContent() {
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

    // Check if current user can record results for this team
    let canRecordResults = false;
    try {
        const permResponse = await fetch(`/api/teams/${currentStatsTeamId}/can-record`);
        const permData = await permResponse.json();
        canRecordResults = permData.success && permData.can_record;
    } catch (e) {
        console.error('Error checking record permissions:', e);
    }

    // Build league filter using the universal filter-box system
    let leagueFilterBoxHTML = '';
    if (availableLeagues && availableLeagues.length > 0) {
        const selectedLeague = availableLeagues.find(l => l.id === currentLeagueFilter);
        const currentLabel = selectedLeague ? selectedLeague.name : 'All Leagues';

        leagueFilterBoxHTML = `
            <div class="filter-box" id="statsLeagueFilterBox">
                <button class="filter-box-btn" id="statsLeagueFilterBtn" onclick="toggleFilterBox('statsLeagueFilterPanel')">
                    <span id="statsLeagueFilterLabel">${currentLabel}</span>
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="filter-box-panel" id="statsLeagueFilterPanel">
                    ${currentLeagueFilter !== null ? `
                        <div class="filter-box-item" onclick="applyStatsLeagueFilter(null, 'All Leagues')">All Leagues</div>
                    ` : ''}
                    ${availableLeagues
                        .filter(league => league.id !== currentLeagueFilter)
                        .map(league => `
                            <div class="filter-box-item" onclick="applyStatsLeagueFilter(${league.id}, '${league.name.replace(/'/g, "\\'")}')">
                                ${league.name}
                            </div>
                        `).join('')}
                </div>
            </div>
        `;
    }

    // Build playoffs results button for GMs and admins
    const playoffsBtnHTML = canRecordResults ? `
        <button class="btn btn-primary btn-sm"
                onclick="openPlayoffsResultsModal()"
                title="Record playoff results for your teams"
                style="display: flex; align-items: center; gap: 0.4rem;">
            <i class="fas fa-trophy"></i>
            <span class="playoffs-btn-record-word">Record </span>Playoff Results
        </button>
    ` : '';

    // Build stats UI
    statsPanel.innerHTML = `
        <div class="stats-container">
            <!-- Match History Section -->
            <div class="match-history-section">
                <div class="section-header">
                    <div class="section-header-left">
                        <h3>
                            <i class="fas fa-history"></i>
                            Match History
                        </h3>
                        ${leagueFilterBoxHTML}
                    </div>
                    ${playoffsBtnHTML}
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
 * Handle league filter-box selection
 * Updates the trigger label, closes the panel, and reloads stats with the selected league
 */
function applyStatsLeagueFilter(leagueId, leagueName) {
    const label = document.getElementById('statsLeagueFilterLabel');
    if (label) label.textContent = leagueName;

    closeAllFilterPanels();

    // Reload stats with new filter
    loadStatsTab(currentStatsTeamId, currentStatsGameId, leagueId);
}

// ============================================
// MATCH HISTORY RENDERING
// ============================================

/**
 * Format a raw "HH:MM:SS" time string into 12-hour display (e.g. "2:30 PM")
 *
 * @param {string|null} startTime - Raw start time from the backend
 * @returns {string|null} Formatted time, or null if not set
 */
function formatMatchTime(startTime) {
    if (!startTime) return null;
    const parts = String(startTime).split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

// Renders the match history cards (expandable) in the Match Results tab
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

    matchEvents.forEach((match, index) => {
        const rowIndex = Math.floor(index / 2);

        const resultClass = match.result ? match.result.toLowerCase() : 'pending';
        const resultIcon = match.result === 'win' ? 'fa-trophy' :
                          match.result === 'loss' ? 'fa-times-circle' :
                          'fa-clock';
        const resultText = match.result
            ? `${match.result.toUpperCase()}${match.score_display ? ` ${match.score_display}` : ''}`
            : 'PENDING';
        const playoffsBadge = match.is_playoffs ? `
            <span class="match-playoffs-badge" title="Playoffs match">
                <i class="fas fa-star"></i> Playoffs
            </span>
        ` : '';

        const leagueBadge = match.league_name ? `
            <span class="match-league-badge" title="League: ${match.league_name}">
                <i class="fas fa-trophy"></i> ${match.league_name}
            </span>
        ` : '';

        // Expanded content: only start time + opponent school
        const timeDisplay = formatMatchTime(match.start_time);
        const hasOpponent = match.opponent_school && match.opponent_school.trim();

        const expandRows = `
            ${timeDisplay ? `
                <div class="match-expand-row">
                    <i class="fas fa-clock"></i>
                    <span>${timeDisplay}</span>
                </div>
            ` : ''}
            ${hasOpponent ? `
                <div class="match-expand-row">
                    <i class="fas fa-shield-alt"></i>
                    <span>vs ${match.opponent_school}</span>
                </div>
            ` : ''}
            ${!timeDisplay && !hasOpponent ? `
                <div class="match-expand-empty">No additional details available</div>
            ` : ''}
        `;

        html += `
            <div class="match-history-item"
                 data-row-index="${rowIndex}"
                 onclick="toggleMatchCardExpand(${rowIndex})"
                 title="Click for more details"
                 style="cursor: pointer;">
                <i class="fas fa-chevron-down match-expand-chevron"></i>

                <div class="match-date">
                    <i class="fas fa-calendar"></i>
                    ${match.date_display}
                </div>

                <div class="match-info">
                    <div class="match-name">${match.name}</div>
                    ${match.location ? `
                        <div class="match-location">
                            <i class="fas fa-map-marker-alt"></i> ${match.location}
                        </div>
                    ` : ''}
                    ${leagueBadge}
                    <div class="match-expand-content">
                        ${expandRows}
                    </div>
                </div>

                <div class="match-result match-result-${resultClass}">
                    <i class="fas ${resultIcon}"></i>
                    ${resultText}
                </div>

                ${canEdit ? `
                    <div class="match-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon btn-icon-edit"
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

/**
 * Toggle the expanded state for every card sharing a row index.
 * Ensures both cards in a row expand/collapse together so neither
 * looks awkwardly taller than the other.
 */
function toggleMatchCardExpand(rowIndex) {
    const cardsInRow = document.querySelectorAll(`.match-history-item[data-row-index="${rowIndex}"]`);
    if (cardsInRow.length === 0) return;

    const shouldExpand = !cardsInRow[0].classList.contains('expanded');
    cardsInRow.forEach(card => card.classList.toggle('expanded', shouldExpand));
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
    lockBodyScroll('recordMatchResultModal');
}

// Close record result modal
function closeRecordResultModal() {
    const modal = document.getElementById('recordMatchResultModal');
    if (modal) {
        modal.style.display = 'none';
        unlockBodyScroll('recordMatchResultModal');
    }
}

/**
 * Populate the match tag-select combobox with past match events
 * Fetches match-type events that can have results recorded
 */
async function populateMatchEventsDropdown(preSelectEventId = null) {
    const panel = document.getElementById('matchEventOptionsPanel');
    const displayArea = document.getElementById('matchEventSelectDisplay');
    const hiddenInput = document.getElementById('matchEventSelect');
    if (!panel || !displayArea || !hiddenInput) return;

    // Reset selection state and show loading
    hiddenInput.value = '';
    displayArea.innerHTML = '<span class="combo-placeholder">Loading matches...</span>';
    panel.innerHTML = '<div class="filter-box-flyout-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        // Fetch available match events
        const response = await fetch(`/api/teams/${currentStatsTeamId}/match-events`);
        const data = await response.json();

        if (data.success && data.events && data.events.length > 0) {
            displayArea.innerHTML = '<span class="combo-placeholder">Select a match...</span>';

            panel.innerHTML = data.events.map(event => {
                let text = `${event.date} - ${event.name}`;
                if (event.has_result) {
                    text += ` (${event.result.toUpperCase()})`;
                }
                return `
                    <div class="filter-box-item" onclick="event.stopPropagation(); selectMatchEvent(${event.event_id}, '${text.replace(/'/g, "\\'")}')">
                        ${text}
                    </div>
                `;
            }).join('');

            // Pre-select the event if specified (used when editing)
            if (preSelectEventId) {
                const preSelected = data.events.find(e => e.event_id === preSelectEventId);
                if (preSelected) {
                    let text = `${preSelected.date} - ${preSelected.name}`;
                    if (preSelected.has_result) {
                        text += ` (${preSelected.result.toUpperCase()})`;
                    }
                    selectMatchEvent(preSelectEventId, text);
                }
            }
        } else {
            // No matches available
            displayArea.innerHTML = '<span class="combo-placeholder">No past matches found</span>';
            panel.innerHTML = '<div class="filter-box-flyout-loading">No past matches found</div>';
        }
    } catch (error) {
        console.error('Error loading match events:', error);
        displayArea.innerHTML = '<span class="combo-placeholder">Error loading matches</span>';
        panel.innerHTML = '<div class="filter-box-flyout-loading">Failed to load</div>';
    }
}

/**
 * Handle selecting a match from the tag-select combobox panel
 * Updates the hidden form value + trigger display, then closes the panel
 */
function selectMatchEvent(eventId, labelText) {
    const hiddenInput = document.getElementById('matchEventSelect');
    const displayArea = document.getElementById('matchEventSelectDisplay');
    if (hiddenInput) hiddenInput.value = eventId;
    if (displayArea) {
        displayArea.innerHTML = `<span class="combo-selected-text">${labelText}</span>`;
    }
    closeAllFilterPanels();
}

// ============================================
// RESULT SELECTION
// ============================================

// Supports choosing win/loss depending on which box is chosen
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

/**
 * Auto-select Win/Loss based on the entered scores.
 * Runs on every keystroke in either score field; only acts once both
 * fields hold valid, differing numbers — otherwise leaves the current
 * selection (manual or none) untouched.
 */
function handleScoreInput() {
    const teamScoreRaw = document.getElementById('matchTeamScore').value.trim();
    const opponentScoreRaw = document.getElementById('matchOpponentScore').value.trim();

    if (teamScoreRaw === '' || opponentScoreRaw === '') return;

    const teamScore = parseInt(teamScoreRaw, 10);
    const opponentScore = parseInt(opponentScoreRaw, 10);
    if (isNaN(teamScore) || isNaN(opponentScore) || teamScore === opponentScore) return;

    const result = teamScore > opponentScore ? 'win' : 'loss';
    const resultRadio = document.querySelector(`input[name="matchResult"][value="${result}"]`);
    if (resultRadio) {
        resultRadio.checked = true;
        handleResultSelection(result);
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
    const teamScoreRaw = document.getElementById('matchTeamScore').value.trim();
    const opponentScoreRaw = document.getElementById('matchOpponentScore').value.trim();

    const formData = {
        team_id: currentStatsTeamId,
        event_id: document.getElementById('matchEventSelect').value,
        result: document.querySelector('input[name="matchResult"]:checked')?.value,
        is_playoffs: document.getElementById('matchPlayoffs').checked,
        opponent_school: document.getElementById('matchOpponentSchool').value.trim(),
        team_score: teamScoreRaw === '' ? null : teamScoreRaw,
        opponent_score: opponentScoreRaw === '' ? null : opponentScoreRaw
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

     if (!formData.opponent_school) {
        showMessage(messageDiv, 'Please enter the opposing school or team', 'error');
        resetSubmitButton(submitBtn, btnText, btnSpinner);
        return;
    }

    if ((formData.team_score === null) !== (formData.opponent_score === null)) {
        showMessage(messageDiv, 'Please enter both scores, or leave both blank', 'error');
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

    // Open Modal
    const modal = document.getElementById('recordMatchResultModal');
    if (!modal) {
        console.error('Record match result modal not found');
        return;
    }

    // Reset Form State
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

    // Show the modal
    modal.style.display = 'block';
    lockBodyScroll('recordMatchResultModal');

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

    // Set opponent school if it exists
    const opponentSchoolField = document.getElementById('matchOpponentSchool');
    if (opponentSchoolField) {
        opponentSchoolField.value = match.opponent_school || '';
    }

    // Set score fields if they exist
    const teamScoreField = document.getElementById('matchTeamScore');
    const opponentScoreField = document.getElementById('matchOpponentScore');
    if (teamScoreField) teamScoreField.value = match.team_score ?? '';
    if (opponentScoreField) opponentScoreField.value = match.opponent_score ?? '';

    // Set playoffs checkbox if applicable
    const playoffsCheckbox = document.getElementById('matchPlayoffs');
    if (playoffsCheckbox) {
        playoffsCheckbox.checked = match.is_playoffs || false;
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


// ============================================
// EXPORT FUNCTIONS
// ============================================
window.loadStatsTab = loadStatsTab;
window.openRecordResultModal = openRecordResultModal;
window.closeRecordResultModal = closeRecordResultModal;
window.handleResultSelection = handleResultSelection;
window.handleScoreInput = handleScoreInput;
window.submitMatchResult = submitMatchResult;
window.editMatchResult = editMatchResult;
window.selectMatchEvent = selectMatchEvent;
window.applyStatsLeagueFilter = applyStatsLeagueFilter;
