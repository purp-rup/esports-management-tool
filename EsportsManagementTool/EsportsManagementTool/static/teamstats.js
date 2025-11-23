/**
 * Team Statistics Management
 * Handles loading stats, recording match results, and displaying performance metrics
 */

let currentStatsTeamId = null;
let currentStatsGameId = null;
let matchEvents = [];
let teamStats = null;

/**
 * Load the stats tab when selected
 */
async function loadStatsTab(teamId, gameId) {
    console.log('Loading stats tab for team:', teamId, 'game:', gameId);
    
    currentStatsTeamId = teamId;
    currentStatsGameId = gameId;
    
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
        // Fetch team statistics
        const response = await fetch(`/api/teams/${teamId}/stats`);
        const data = await response.json();
        
        if (data.success) {
            teamStats = data.stats;
            matchEvents = data.match_events || [];
            renderStatsContent();
        } else {
            throw new Error(data.message || 'Failed to load statistics');
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        statsPanel.innerHTML = `
            <div class="stats-error">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Failed to Load Statistics</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

/**
 * Render the complete stats content
 */
function renderStatsContent() {
    const statsPanel = document.getElementById('statsTabContent');
    const isGM = window.userPermissions?.is_gm || false;
    const isAdmin = window.userPermissions?.is_admin || false;
    const canManage = isGM || isAdmin;
    
    // Calculate win percentage
    const totalMatches = teamStats.wins + teamStats.losses;
    const winPercentage = totalMatches > 0 
        ? ((teamStats.wins / totalMatches) * 100).toFixed(1) 
        : 0;
    
    statsPanel.innerHTML = `
        <div class="stats-container">
            <!-- Stats Summary Cards -->
            <div class="stats-summary-grid">
                <div class="stat-card stat-card-wins">
                    <div class="stat-card-icon">
                        <i class="fas fa-trophy"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-value">${teamStats.wins}</div>
                        <div class="stat-card-label">Wins</div>
                    </div>
                </div>
                
                <div class="stat-card stat-card-losses">
                    <div class="stat-card-icon">
                        <i class="fas fa-times-circle"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-value">${teamStats.losses}</div>
                        <div class="stat-card-label">Losses</div>
                    </div>
                </div>
                
                <div class="stat-card stat-card-percentage">
                    <div class="stat-card-icon">
                        <i class="fas fa-percent"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-value">${winPercentage}%</div>
                        <div class="stat-card-label">Win Rate</div>
                    </div>
                </div>
                
                <div class="stat-card stat-card-record">
                    <div class="stat-card-icon">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="stat-card-content">
                        <div class="stat-card-value">${teamStats.wins}-${teamStats.losses}</div>
                        <div class="stat-card-label">Record</div>
                    </div>
                </div>
            </div>
            
            <!-- Match History Section -->
            <div class="match-history-section">
                <div class="section-header">
                    <h3><i class="fas fa-history"></i> Match History</h3>
                    ${canManage ? `
                        <button class="btn btn-primary btn-sm" onclick="openRecordResultModal()">
                            <i class="fas fa-plus"></i> Record Result
                        </button>
                    ` : ''}
                </div>
                
                ${renderMatchHistory()}
            </div>
        </div>
    `;
}

/**
 * Render match history list
 */
function renderMatchHistory() {
    if (!matchEvents || matchEvents.length === 0) {
        return `
            <div class="match-history-empty">
                <i class="fas fa-calendar-times"></i>
                <p>No match results recorded yet</p>
                ${(window.userPermissions?.is_gm || window.userPermissions?.is_admin) ? 
                    '<small>Record your first match result to start tracking statistics</small>' : ''}
            </div>
        `;
    }
    
    let html = '<div class="match-history-list">';
    
    matchEvents.forEach(match => {
        const resultClass = match.result ? match.result.toLowerCase() : 'pending';
        const resultIcon = match.result === 'win' ? 'fa-trophy' : 
                          match.result === 'loss' ? 'fa-times-circle' : 
                          'fa-clock';
        const resultText = match.result ? match.result.toUpperCase() : 'PENDING';
        
        html += `
            <div class="match-history-item">
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
                </div>
                <div class="match-result match-result-${resultClass}">
                    <i class="fas ${resultIcon}"></i>
                    ${resultText}
                </div>
                ${(window.userPermissions?.is_gm || window.userPermissions?.is_admin) ? `
                    <div class="match-actions">
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

/**
 * Open modal to record a match result
 */
function openRecordResultModal() {
    const modal = document.getElementById('recordMatchResultModal');
    if (!modal) {
        console.error('Record match result modal not found');
        return;
    }
    
    // Populate events dropdown with unrecorded matches
    populateMatchEventsDropdown();
    
    // Reset form
    const form = document.getElementById('recordMatchResultForm');
    if (form) {
        form.reset();
    }
    
    // Clear message
    const messageDiv = document.getElementById('recordResultMessage');
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }
    
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Close record result modal
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
 */
async function populateMatchEventsDropdown() {
    const select = document.getElementById('matchEventSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Loading matches...</option>';
    
    try {
        const response = await fetch(`/api/teams/${currentStatsTeamId}/match-events`);
        const data = await response.json();
        
        if (data.success && data.events && data.events.length > 0) {
            select.innerHTML = '<option value="">Select a match...</option>';
            
            data.events.forEach(event => {
                const option = document.createElement('option');
                option.value = event.event_id;
                option.textContent = `${event.date} - ${event.name}`;
                option.dataset.hasResult = event.has_result;
                
                if (event.has_result) {
                    option.textContent += ` (${event.result.toUpperCase()})`;
                }
                
                select.appendChild(option);
            });
        } else {
            select.innerHTML = '<option value="">No past matches found</option>';
        }
    } catch (error) {
        console.error('Error loading match events:', error);
        select.innerHTML = '<option value="">Error loading matches</option>';
    }
}

/**
 * Handle result radio button selection
 */
function handleResultSelection(result) {
    // Update visual feedback for selected result
    const winBtn = document.querySelector('.result-option[data-result="win"]');
    const lossBtn = document.querySelector('.result-option[data-result="loss"]');
    
    if (winBtn && lossBtn) {
        winBtn.classList.toggle('selected', result === 'win');
        lossBtn.classList.toggle('selected', result === 'loss');
    }
}

/**
 * Submit match result
 */
async function submitMatchResult(event) {
    event.preventDefault();
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    const messageDiv = document.getElementById('recordResultMessage');
    
    // Disable submit button
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
    messageDiv.style.display = 'none';
    
    const formData = {
        team_id: currentStatsTeamId,
        event_id: document.getElementById('matchEventSelect').value,
        result: document.querySelector('input[name="matchResult"]:checked')?.value,
        notes: document.getElementById('matchNotes').value
    };
    
    // Validation
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
            showMessage(messageDiv, data.message, 'success');
            
            setTimeout(() => {
                closeRecordResultModal();
                // Reload stats tab
                loadStatsTab(currentStatsTeamId, currentStatsGameId);
            }, 1500);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showMessage(messageDiv, error.message || 'Failed to record result', 'error');
        resetSubmitButton(submitBtn, btnText, btnSpinner);
    }
}

/**
 * Edit an existing match result
 */
async function editMatchResult(eventId) {
    // Find the match in our data
    const match = matchEvents.find(m => m.event_id === eventId);
    if (!match) {
        alert('Match not found');
        return;
    }
    
    // Open modal and pre-populate with existing data
    openRecordResultModal();
    
    // Wait a bit for modal to populate dropdown
    setTimeout(() => {
        const select = document.getElementById('matchEventSelect');
        const notesField = document.getElementById('matchNotes');
        
        if (select) {
            select.value = eventId;
        }
        
        if (match.result) {
            const resultRadio = document.querySelector(`input[name="matchResult"][value="${match.result}"]`);
            if (resultRadio) {
                resultRadio.checked = true;
                handleResultSelection(match.result);
            }
        }
        
        if (match.notes && notesField) {
            notesField.value = match.notes;
        }
    }, 300);
}

/**
 * Helper: Show message
 */
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `form-message ${type}`;
    element.style.display = 'block';
}

/**
 * Helper: Reset submit button
 */
function resetSubmitButton(btn, textSpan, spinner) {
    btn.disabled = false;
    textSpan.style.display = 'inline';
    spinner.style.display = 'none';
}

// Export functions to global scope
window.loadStatsTab = loadStatsTab;
window.openRecordResultModal = openRecordResultModal;
window.closeRecordResultModal = closeRecordResultModal;
window.handleResultSelection = handleResultSelection;
window.submitMatchResult = submitMatchResult;
window.editMatchResult = editMatchResult;