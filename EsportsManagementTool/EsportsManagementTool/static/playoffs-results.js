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
                <button class="playoffs-banner-btn" onclick="openRecordResultsModal()">
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

/**
 * Open modal to record playoffs results
 */
function openRecordResultsModal() {
    // Load pending teams
    fetch('/api/playoffs-results/pending-teams')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (data.teams.length === 0) {
                    showMessage('success', 'All playoffs results have been recorded! Great job!');
                    dismissPlayoffsBanner();
                    return;
                }
                
                displayRecordResultsModal(data.teams, data.season, data.placement_options);
            } else {
                showMessage('error', 'Failed to load pending teams');
            }
        })
        .catch(error => {
            console.error('Error loading pending teams:', error);
            showMessage('error', 'Failed to load pending teams');
        });
}

/**
 * Display the record results modal with pending teams
 */
function displayRecordResultsModal(teams, season, placementOptions) {
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
            
            // Select dropdown
            const select = document.createElement('select');
            select.className = 'playoffs-placement-select';
            select.setAttribute('data-team-id', team.teamID);
            select.setAttribute('data-league-id', team.league_id);
            
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Select Placement';
            select.appendChild(defaultOption);
            
            placementOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                select.appendChild(option);
            });
            
            // Save button
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn btn-primary btn-sm';
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
            saveBtn.onclick = function() {
                recordSingleResult(team.teamID, team.league_id, season.season_id);
            };
            
            teamActions.appendChild(select);
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
    modal.id = 'recordResultsModal';
    modal.style.display = 'flex';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content modal-content-large';
    
    // Modal header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    modalHeader.innerHTML = '<h2>Record Playoffs Results - ' + season.season_name + '</h2>' +
        '<button class="modal-close" onclick="closeRecordResultsModal()">' +
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
    modalFooter.innerHTML = '<button class="btn btn-secondary" onclick="closeRecordResultsModal()">Close</button>';
    
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    modal.appendChild(modalContent);
    
    document.body.appendChild(modal);
}

/**
 * Record result for a single team
 */
function recordSingleResult(teamId, leagueId, seasonId) {
    // Find the select element for this specific team-league combination
    const select = document.querySelector(`select.playoffs-placement-select[data-team-id="${teamId}"]`);
    
    if (!select) {
        console.error('Could not find select element for team:', teamId);
        showModalMessage('error', 'Error: Could not find placement selector');
        return;
    }
    
    const placement = select.value;
    
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
                            closeRecordResultsModal();
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
/**
 * Close record results modal
 */
function closeRecordResultsModal() {
    const modal = document.getElementById('recordResultsModal');
    if (modal) {
        modal.remove();
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Show message in modal
 */
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

/**
 * Show global message
 */
function showMessage(type, message) {
    // Reuse existing notification system if available
    if (typeof showNotification === 'function') {
        showNotification(message, type);
    } else {
        alert(message);
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
window.openRecordResultsModal = openRecordResultsModal;
window.closeRecordResultsModal = closeRecordResultsModal;
window.recordSingleResult = recordSingleResult;
window.dismissPlayoffsBanner = dismissPlayoffsBanner;