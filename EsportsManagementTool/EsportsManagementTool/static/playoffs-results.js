/**
 * playoffs-results.js
 * ============================================================================
 * Handles playoffs results recording interface for Game Managers
 * ============================================================================
 */

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Only initialize for Game Managers
    if (window.userPermissions && window.userPermissions.is_gm) {
        checkPendingResults();
    }
});

// ============================================
// NOTIFICATION BANNER
// ============================================

/**
 * Check if GM has pending playoffs results
 * Shows banner if within 7 days of season end, once per day per browser session
 */
function checkPendingResults() {
    // Only show banner once per day — check localStorage for today's date
    const today = new Date().toISOString().split('T')[0];
    const lastShown = localStorage.getItem('playoffsBannerDate');
    if (lastShown === today) {
        return; // Already shown today, skip API call entirely
    }

    fetch('/api/playoffs-results/check-pending')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.has_pending) {
                showPlayoffsBanner(
                    data.pending_count, 
                    data.days_until_end,
                    data.season_name
                );
                // Record that we showed the banner today so it won't reappear until tomorrow
                const today = new Date().toISOString().split('T')[0];
                localStorage.setItem('playoffsBannerDate', today);
            }
        })
        .catch(error => {
            console.error('Error checking pending results:', error);
        });
}

/**
 * Display the playoffs results notification banner
 */
function showPlayoffsBanner(pendingCount, daysUntilEnd, seasonName) {
    // Remove the session storage check - we want the banner to show on every page load
    // The user can dismiss it temporarily, but it will come back on refresh
    
    const urgentClass = daysUntilEnd <= 3 ? 'urgent' : '';
    const urgentText = daysUntilEnd <= 3 ? 'URGENT: ' : '';
    
    const banner = document.createElement('div');
    banner.className = `playoffs-banner ${urgentClass}`;
    banner.id = 'playoffsBanner';
    
    banner.innerHTML = `
        <div class="playoffs-banner-content">
            <div class="playoffs-banner-left">
                <div class="playoffs-banner-icon">
                    <i class="fas fa-trophy"></i>
                </div>
                <div class="playoffs-banner-text">
                    <h3>${urgentText}Playoffs Results Need Recording</h3>
                    <p>${pendingCount} team(s) need results recorded for ${seasonName} • ${daysUntilEnd} day(s) remaining</p>
                </div>
            </div>
            <div class="playoffs-banner-actions">
                <button class="playoffs-banner-btn" onclick="openPlayoffsResultsModal()">
                    <i class="fas fa-clipboard-check"></i>
                    Record Results Now
                </button>
                <button class="playoffs-banner-close" onclick="dismissPlayoffsBanner()">
                    Dismiss
                </button>
            </div>
        </div>
    `;
    
    // Insert banner at top of page
    document.body.insertBefore(banner, document.body.firstChild);
    document.body.classList.add('has-playoffs-banner');
}

/**
 * Dismiss banner for this session
 */
function dismissPlayoffsBanner() {
    const banner = document.getElementById('playoffsBanner');
    if (banner) {
        banner.style.animation = 'bannerSlideUp 0.5s ease-out';
        setTimeout(() => {
            banner.remove();
            document.body.classList.remove('has-playoffs-banner');
        }, 500);
    }
    
}

// Add slide up animation
const style = document.createElement('style');
style.textContent = `
    @keyframes bannerSlideUp {
        from {
            transform: translateY(0);
            opacity: 1;
        }
        to {
            transform: translateY(-100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ============================================
// RECORD RESULTS MODAL
// ============================================
function openPlayoffsResultsModal() {
    // Load pending teams
    fetch('/api/playoffs-results/pending-teams')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (data.teams.length === 0) {
                    showPlayoffsGlobalMessage('success', 'All playoffs results have been recorded! Great job!');
                    dismissPlayoffsBanner();
                    return;
                }
                
                displayPlayoffsResultsModal(data.teams, data.season, data.placement_options);
            } else {
                showPlayoffsGlobalMessage('error', 'Failed to load pending teams');
            }
        })
        .catch(error => {
            console.error('Error loading pending teams:', error);
            showPlayoffsGlobalMessage('error', 'Failed to load pending teams');
        });
}

// Display the record results modal with pending teams
function displayPlayoffsResultsModal(teams, season, placementOptions) {
    // Group teams by game
    const teamsByGame = {};
    teams.forEach(team => {
        if (!teamsByGame[team.GameTitle]) {
            teamsByGame[team.GameTitle] = [];
        }
        teamsByGame[team.GameTitle].push(team);
    });
    
    // Build team list HTML using createElement to avoid template literal issues
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'playoffs-results-container';
    
    for (const [gameTitle, gameTeams] of Object.entries(teamsByGame)) {
        // Create game section
        const gameSection = document.createElement('div');
        gameSection.className = 'playoffs-game-section';
        
        // Game title
        const gameTitleEl = document.createElement('h4');
        gameTitleEl.className = 'playoffs-game-title';
        gameTitleEl.innerHTML = '<i class="fas fa-gamepad"></i> ' + gameTitle;
        gameSection.appendChild(gameTitleEl);
        
        // Teams list
        const teamsList = document.createElement('div');
        teamsList.className = 'playoffs-teams-list';
        
        gameTeams.forEach(team => {
            // Team card
            const teamCard = document.createElement('div');
            teamCard.className = 'playoffs-team-card';
            teamCard.setAttribute('data-team-id', team.teamID);
            teamCard.setAttribute('data-league-id', team.league_id);
            
            // Team info
            const teamInfo = document.createElement('div');
            teamInfo.className = 'playoffs-team-info';
            teamInfo.innerHTML = '<h5>' + team.TeamTitle + '</h5><p>League: ' + team.league_name + '</p>';
            
            // Team actions
            const teamActions = document.createElement('div');
            teamActions.className = 'playoffs-team-actions';
            
            // Placement dropdown — built as a universal filter-box
            const panelId = `playoffsPlacementPanel-${team.teamID}-${team.league_id}`;

            const comboBox = document.createElement('div');
            comboBox.className = 'filter-box tag-select-box playoffs-placement-box';
            comboBox.id = `playoffsPlacementBox-${team.teamID}-${team.league_id}`;

            const trigger = document.createElement('div');
            trigger.className = 'tag-select-trigger';
            trigger.onclick = function() {
                togglePlayoffsPlacementPanel(trigger, panelId);
            };

            const display = document.createElement('div');
            display.className = 'combo-select-display';
            display.id = `playoffsPlacementDisplay-${team.teamID}-${team.league_id}`;
            display.innerHTML = '<span class="combo-placeholder">Select Placement</span>';

            const arrow = document.createElement('i');
            arrow.className = 'fas fa-chevron-down tag-select-arrow';

            trigger.appendChild(display);
            trigger.appendChild(arrow);

            const panel = document.createElement('div');
            panel.className = 'filter-box-panel tag-select-panel playoffs-placement-panel';
            panel.id = panelId;
            panel.addEventListener('click', e => e.stopPropagation());

            // Teams with no recorded playoffs matches can only report
            // "Did Not Qualify" — hide every other placement for them.
            const availableOptions = team.has_playoffs_matches
                ? placementOptions
                : placementOptions.filter(opt => opt === 'Did Not Qualify');

            availableOptions.forEach(opt => {
                const item = document.createElement('div');
                item.className = 'filter-box-item';
                item.textContent = opt;
                item.onclick = function(e) {
                    e.stopPropagation();
                    selectPlayoffsPlacement(team.teamID, team.league_id, opt);
                };
                panel.appendChild(item);
            });

            comboBox.appendChild(trigger);
            comboBox.appendChild(panel);

            // Hidden input holds the actual value recordSingleResult() reads
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.className = 'playoffs-placement-value';
            hiddenInput.setAttribute('data-team-id', team.teamID);
            hiddenInput.setAttribute('data-league-id', team.league_id);
            hiddenInput.value = '';

            // Save button
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn btn-primary btn-sm';
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
            saveBtn.onclick = function() {
                recordSingleResult(team.teamID, team.league_id, season.season_id);
            };

            teamActions.appendChild(comboBox);
            teamActions.appendChild(hiddenInput);
            teamActions.appendChild(saveBtn);
            
            teamCard.appendChild(teamInfo);
            teamCard.appendChild(teamActions);
            teamsList.appendChild(teamCard);
        });
        
        gameSection.appendChild(teamsList);
        resultsContainer.appendChild(gameSection);
    }
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'playoffsResultsModal';
    modal.style.display = 'flex';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content modal-content-large';
    
    // Modal header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    modalHeader.innerHTML = '<h2>Record Playoffs Results - ' + season.season_name + '</h2>' +
        '<button class="modal-close" onclick="closePlayoffsResultsModal()">' +
        '<i class="fas fa-times"></i></button>';
    
    // Modal body
    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    
    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.innerHTML = 'Record final playoffs placements for your teams. ' +
        'Season ends: <strong>' + formatDate(season.end_date) + '</strong>';
    
    const messageDiv = document.createElement('div');
    messageDiv.id = 'playoffsResultsMessage';
    messageDiv.className = 'form-message';
    messageDiv.style.display = 'none';
    
    // Notes section
    const notesSection = document.createElement('div');
    notesSection.className = 'playoffs-notes-section';
    notesSection.innerHTML = '<label for="playoffsNotes">Additional Notes (Optional)</label>' +
        '<textarea id="playoffsNotes" rows="3" placeholder="Add any additional context or notes about the season..."></textarea>';
    
    modalBody.appendChild(subtitle);
    modalBody.appendChild(messageDiv);
    modalBody.appendChild(resultsContainer);
    modalBody.appendChild(notesSection);
    
    // Character Counter
    attachCharacterCounter('playoffsNotes', 250);

    // Modal footer
    const modalFooter = document.createElement('div');
    modalFooter.className = 'modal-footer';
    modalFooter.innerHTML = '<button class="btn btn-secondary" onclick="closePlayoffsResultsModal()">Close</button>';
    
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    modal.appendChild(modalContent);
    
    document.body.appendChild(modal);
    lockBodyScroll('playoffsResultsModal');
}

// Record playoffs result for a team
function recordSingleResult(teamId, leagueId, seasonId) {
    // Find the hidden input holding the selected placement for this team-league combination
    const placementInput = document.querySelector(`input.playoffs-placement-value[data-team-id="${teamId}"][data-league-id="${leagueId}"]`);

    if (!placementInput) {
        console.error('Could not find placement input for team:', teamId);
        showModalMessage('error', 'Error: Could not find placement selector');
        return;
    }

    const placement = placementInput.value;
    
    if (!placement || placement === '') {
        showModalMessage('error', 'Please select a placement');
        return;
    }
    
    const notes = document.getElementById('playoffsNotes')?.value || '';
    
    // Get the button that was clicked
    const button = window.event ? window.event.target.closest('button') : null;
    let originalHTML = '';
    
    if (button) {
        originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        button.disabled = true;
    }
    
    console.log('Recording result:', { teamId, leagueId, seasonId, placement, notes });
    
    fetch('/api/playoffs-results/record', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            team_id: teamId,
            league_id: leagueId,
            season_id: seasonId,
            placement: placement,
            notes: notes
        })
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Response data:', data);
        
        if (data.success) {
            // Remove the team card from display
            const teamCard = document.querySelector(`.playoffs-team-card[data-team-id="${teamId}"][data-league-id="${leagueId}"]`);
            if (teamCard) {
                teamCard.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => {
                    teamCard.remove();
                    
                    // Check if all teams are done
                    const remainingTeams = document.querySelectorAll('.playoffs-team-card');
                    if (remainingTeams.length === 0) {
                        showModalMessage('success', 'All results recorded! Closing modal...');
                        setTimeout(() => {
                            closePlayoffsResultsModal();
                            dismissPlayoffsBanner();
                            showMessage('success', 'All playoffs results have been recorded successfully!');
                        }, 1500);
                    } else {
                        showModalMessage('success', 'Result saved successfully!');
                    }
                }, 300);
            }
        } else {
            showModalMessage('error', data.message || 'Failed to record result');
            if (button) {
                button.innerHTML = originalHTML;
                button.disabled = false;
            }
        }
    })
    .catch(error => {
        console.error('Error recording result:', error);
        showModalMessage('error', 'Failed to record result: ' + error.message);
        if (button) {
            button.innerHTML = originalHTML;
            button.disabled = false;
        }
    });
}

// Open/close a team's placement dropdown panel.
function togglePlayoffsPlacementPanel(triggerEl, panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const isOpen = panel.classList.contains('open');

    closeAllFilterPanels();
    document.querySelectorAll('.playoffs-placement-box .tag-select-trigger.active')
        .forEach(t => t.classList.remove('active'));

    if (isOpen) {
        return;
    }

    if (panel.parentElement !== document.body) {
        document.body.appendChild(panel);
    }

    const triggerRect = triggerEl.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = `${triggerRect.bottom + 4}px`;
    panel.style.left = `${triggerRect.left}px`;
    panel.style.width = `${triggerRect.width}px`;
    panel.style.minWidth = `${triggerRect.width}px`;
    panel.style.zIndex = '10000';

    panel.classList.add('open');
    triggerEl.classList.add('active');
}

/**
 * Handle selecting a placement from a team's tag-select-box dropdown.
 * Updates the visible trigger text, stores the value in the hidden input,
 * and closes the panel.
 */
function selectPlayoffsPlacement(teamId, leagueId, placement) {
    const display = document.getElementById(`playoffsPlacementDisplay-${teamId}-${leagueId}`);
    const input = document.querySelector(`input.playoffs-placement-value[data-team-id="${teamId}"][data-league-id="${leagueId}"]`);

    if (display) {
        display.textContent = placement;
    }
    if (input) {
        input.value = placement;
    }

    closeAllFilterPanels();
}

// Close playoffs results modal
function closePlayoffsResultsModal() {
    document.querySelectorAll('.playoffs-placement-panel').forEach(p => p.remove());

    const modal = document.getElementById('playoffsResultsModal');
    if (modal) {
        modal.remove();
        unlockBodyScroll('playoffsResultsModal');
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Show message in modal
function showModalMessage(type, message) {
    const messageDiv = document.getElementById('playoffsResultsMessage');
    if (messageDiv) {
        messageDiv.textContent = message;
        messageDiv.className = `form-message form-message-${type}`;
        messageDiv.style.display = 'block';
        
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
}

// Show global message
function showPlayoffsGlobalMessage(type, message) {
    if (type === 'success') {
        showDeleteSuccessMessage(message);
    } else {
        showDeleteErrorMessage(message);
    }
}

// Add fadeOut animation
const fadeStyle = document.createElement('style');
fadeStyle.textContent = `
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(20px);
        }
    }
`;
document.head.appendChild(fadeStyle);

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================
window.checkPendingResults = checkPendingResults;
window.openPlayoffsResultsModal = openPlayoffsResultsModal;
window.selectPlayoffsPlacement = selectPlayoffsPlacement;
window.closePlayoffsResultsModal = closePlayoffsResultsModal;
window.recordSingleResult = recordSingleResult;
window.dismissPlayoffsBanner = dismissPlayoffsBanner;