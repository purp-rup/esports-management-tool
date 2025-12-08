/**
 * teams.js
 * ============================================================================
 * TEAMS DETAIL MANAGEMENT
 * ORGANIZED BY CLAUDEAI
 * ============================================================================
 * Handles team detail view functionality:
 * - Team selection and detail display
 * - Team header with stats
 * - Roster tab with member management
 * - Team member add/remove operations
 * - Team editing (name, max size)
 * - Team deletion
 * - Next scheduled event display
 * - Tab switching (Roster, Schedule, Stats, VODs)
 * ============================================================================
 */

// ============================================
// UTILITY: DEBOUNCE FUNCTION
// ============================================

/**
 * Debounce function to limit how often a function is called
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Cache for team details
 */
let currentTeamCache = null;

/**
 * Cache for role badges
 */
const badgeCache = new Map();

// ============================================
// TEAM SELECTION & DETAILS
// ============================================

/**
 * Select a team from sidebar
 * Updates UI and loads team details
 */
async function selectTeam(teamId) {
    window.currentSelectedTeamId = teamId;

    document.querySelectorAll('.team-sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-team-id="${teamId}"]`)?.classList.add('active');

    document.getElementById('teamsWelcomeState').style.display = 'none';
    document.getElementById('teamsDetailContent').style.display = 'block';

    document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.team-tab-panel').forEach(panel => panel.classList.remove('active'));

    const rosterTab = document.querySelector('[data-team-tab="roster"]');
    const rosterPanel = document.getElementById('rosterTabContent');
    if (rosterTab) rosterTab.classList.add('active');
    if (rosterPanel) rosterPanel.classList.add('active');

    const schedulePanel = document.getElementById('scheduleTabContent');
    if (schedulePanel) {
        schedulePanel.innerHTML = `
            <div class="schedule-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading schedules...</p>
            </div>
        `;
    }

    await loadTeamDetails(teamId);
}

/**
 * Load detailed team information
 */
async function loadTeamDetails(teamId) {
    try {
        const response = await fetch(`/api/teams/${teamId}/details`);
        const data = await response.json();

        if (data.success) {
            const team = data.team;

            // Cache the team data
            currentTeamCache = {
                teamId: teamId,
                team: team,
                timestamp: Date.now()
            };

            window.currentTeamCanManage = team.can_manage;

            const addVodBtn = document.querySelector('.btn[onclick="showAddVodModal()"]');
            if (addVodBtn) {
                addVodBtn.style.display = team.can_manage ? 'inline-flex' : 'none';
            }

            document.getElementById('teamDetailTitle').textContent = team.title;
            document.getElementById('teamDetailGame').textContent = `Game: ${team.game_title || 'Unknown'}`;

            const divisionElement = document.getElementById('teamDetailDivision');
            if (divisionElement) {
                if (team.division) {
                    divisionElement.textContent = `Division: ${team.division}`;
                    divisionElement.style.display = 'block';
                } else {
                    divisionElement.style.display = 'none';
                }
            }

            // Display season information
            const seasonElement = document.getElementById('teamDetailSeason');
            if (seasonElement) {
                if (team.season_name) {
                    const seasonStatus = team.season_is_active ?
                        '<span style="color: #22c55e;">●</span>' :
                        '<span style="color: #94a3b8;">●</span>';
                    seasonElement.innerHTML = `${seasonStatus} Season: ${team.season_name}`;
                    seasonElement.style.display = 'block';
                } else {
                    seasonElement.textContent = 'Season: Not assigned';
                    seasonElement.style.display = 'block';
                }
            }

            const teamIconLarge = document.querySelector('.team-icon-large');
            if (teamIconLarge) {
                if (team.game_icon_url) {
                    teamIconLarge.innerHTML = `<img src="${team.game_icon_url}"
                                                     alt="${team.game_title}"
                                                     loading="lazy"
                                                     style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;"
                                                     onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-shield-alt\\'></i>';">`;
                } else {
                    teamIconLarge.innerHTML = '<i class="fas fa-shield-alt"></i>';
                }
            }

            document.getElementById('teamStatMembers').textContent = team.member_count || 0;
            document.getElementById('teamStatMaxSize').textContent = team.team_max_size || 0;

            if (team.game_id) {
                loadNextScheduledEvent(teamId, team.game_id);
            } else {
                const container = document.getElementById('nextScheduledEventContainer');
                if (container) {
                    container.innerHTML = `
                        <div class="next-scheduled-event-empty">
                            <i class="fas fa-exclamation-circle"></i>
                            <p>Team has no associated game</p>
                        </div>
                    `;
                }
            }

            const isAdmin = window.userPermissions?.is_admin || window.userPermissions.is_developer || false;
            const isGM = window.userPermissions?.is_gm || false;

            const addPlayerBtn = document.getElementById('addPlayerBtn');
            const deleteTeamBtn = document.getElementById('deleteTeamBtn');

            if (addPlayerBtn) {
                addPlayerBtn.style.display = (isAdmin || isGM) ? 'inline-flex' : 'none';
                addPlayerBtn.onclick = openAddTeamMembersModal;
            }

            if (deleteTeamBtn) {
                deleteTeamBtn.style.display = (isAdmin || isGM) ? 'inline-flex' : 'none';
            }

            if (typeof initScheduleButton === 'function') {
                await initScheduleButton(teamId, team.game_id);
            }

            loadRosterTab(team.members || []);
        }
    } catch (error) {
        console.error('Error loading team details:', error);
    }
}

// ============================================
// NEXT SCHEDULED EVENT
// ============================================

/**
 * Load the next scheduled event for a team
 */
async function loadNextScheduledEvent(teamId, gameId) {
    const container = document.getElementById('nextScheduledEventContainer');

    if (!container) {
        console.error('nextScheduledEventContainer not found');
        return;
    }

    if (!teamId || !gameId) {
        console.error('Invalid teamId or gameId:', { teamId, gameId });
        container.innerHTML = `
            <div class="next-scheduled-event-empty">
                <i class="fas fa-exclamation-circle"></i>
                <p>Invalid team or game data</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="text-align: center; padding: 1rem; color: var(--text-secondary);">
            <i class="fas fa-spinner fa-spin"></i> Loading...
        </div>
    `;

    try {
        console.log(`Fetching scheduled event for team ${teamId}, game ${gameId}`);
        const response = await fetch(`/api/teams/${teamId}/next-scheduled-event`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Scheduled event response:', data);

        if (data.success && data.event) {
            const event = data.event;

            container.innerHTML = `
                <div class="next-scheduled-event-card" onclick="openEventModal(${event.id})">
                    <div class="next-event-header">
                        <i class="fas fa-calendar-plus"></i>
                        <h4>Next Scheduled Event</h4>
                    </div>
                    <div class="next-event-content">
                        <div class="next-event-time">
                            ${event.is_all_day ?
                                '<i class="fas fa-calendar"></i> All Day' :
                                `<i class="fas fa-clock"></i> ${event.start_time}`
                            }
                        </div>
                        <div class="next-event-title">${event.name}</div>
                        <div class="next-event-date">
                            <i class="fas fa-calendar-day"></i> ${event.date}
                        </div>
                        <span class="next-event-type ${event.event_type.toLowerCase()}">${event.event_type}</span>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="next-scheduled-event-empty">
                    <i class="fas fa-calendar-times"></i>
                    <p>No upcoming scheduled events</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading next scheduled event:', error);
        container.innerHTML = `
            <div class="next-scheduled-event-empty">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load scheduled events</p>
                <small style="color: var(--text-secondary); font-size: 0.75rem;">${error.message}</small>
            </div>
        `;
    }
}

// ============================================
// ROSTER TAB
// ============================================

/**
 * Load roster tab with team members
 */
function loadRosterTab(members) {
    const rosterList = document.getElementById('rosterMembersList');
    const rosterEmpty = document.getElementById('rosterEmpty');

    if (members.length === 0) {
        rosterList.style.display = 'none';
        rosterEmpty.style.display = 'block';
        return;
    }

    rosterList.style.display = 'grid';
    rosterEmpty.style.display = 'none';

    const isAdmin = window.userPermissions?.is_admin || window.userPermissions.is_developer || false;
    const isGM = window.userPermissions?.is_gm || false;
    const canManage = isAdmin || isGM;

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    members.forEach(member => {
        const memberCard = document.createElement('div');
        memberCard.className = 'roster-member-card';

        memberCard.setAttribute('data-member-name', member.name.toLowerCase());
        memberCard.setAttribute('data-member-username', member.username.toLowerCase());

        let avatarHTML;
        if (member.profile_picture) {
            avatarHTML = `<img src="${member.profile_picture}"
                              alt="${member.name}"
                              loading="lazy"
                              class="roster-member-avatar">`;
        } else {
            const initials = member.name.split(' ').map(n => n[0]).join('');
            avatarHTML = `<div class="roster-member-initials">${initials}</div>`;
        }

        // Use cached badges
        const cacheKey = `${member.id}-${(member.roles || []).join(',')}`;
        let badgesHTML = '';

        if (badgeCache.has(cacheKey)) {
            badgesHTML = badgeCache.get(cacheKey);
        } else {
            if (typeof buildUniversalRoleBadges === 'function') {
                badgesHTML = buildUniversalRoleBadges({
                    userId: member.id,
                    roles: member.roles || [],
                    contextGameId: null,
                    excludeRoles: ['Player']
                });
            } else if (typeof buildRoleBadges === 'function') {
                badgesHTML = buildRoleBadges({
                    roles: member.roles || [],
                    isAssignedGM: false,
                    gameIconUrl: null
                });
            }
            badgeCache.set(cacheKey, badgesHTML);
        }

        const removeBtn = canManage ? `
            <button class="btn-icon-danger"
                    onclick="event.stopPropagation(); confirmRemoveMemberNew('${member.id}', '${member.name.replace(/'/g, "\\'")}')"
                    title="Remove member">
                <i class="fas fa-user-minus"></i>
            </button>
        ` : '';

        memberCard.innerHTML = `
            ${avatarHTML}
            <div class="roster-member-info">
                <div class="roster-member-name">${member.name}</div>
                <div class="roster-member-username">@${member.username}</div>
                <div class="roster-member-badges">${badgesHTML}</div>
            </div>
            <div class="roster-member-actions">
                ${removeBtn}
            </div>
        `;

        fragment.appendChild(memberCard);
    });

    // Single DOM update
    rosterList.innerHTML = '';
    rosterList.appendChild(fragment);
}

/**
 * Filter roster members by search input
 */
const filterRosterMembers = debounce(function() {
    const searchInput = document.getElementById('rosterSearchInput');
    const filter = searchInput.value.toLowerCase();
    const memberCards = document.querySelectorAll('.roster-member-card');

    memberCards.forEach(card => {
        const name = card.getAttribute('data-member-name');
        const username = card.getAttribute('data-member-username');

        if (name.includes(filter) || username.includes(filter)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}, 300);

// ============================================
// TEAM MEMBER MANAGEMENT
// ============================================

/**
 * Open add team members modal
 */
function openAddTeamMembersModal() {
    if (!window.currentSelectedTeamId) {
        alert('Please select a team first');
        return;
    }

    const modal = document.getElementById('addTeamMembersModal');
    if (!modal) {
        console.error('Add team members modal not found');
        return;
    }

    const loading = document.getElementById('availableMembersLoading');
    const list = document.getElementById('availableMembersList');
    const empty = document.getElementById('noAvailableMembers');
    const teamName = document.getElementById('teamDetailTitle')?.textContent || 'Team';

    const teamNameElement = document.getElementById('addMembersTeamName');
    if (teamNameElement) {
        teamNameElement.textContent = teamName;
    }

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    if (loading) loading.style.display = 'block';
    if (list) list.style.display = 'none';
    if (empty) empty.style.display = 'none';

    fetch(`/api/teams/${window.currentSelectedTeamId}/available-members`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.members && data.members.length > 0) {
                displayAvailableMembersNew(data.members);
                if (loading) loading.style.display = 'none';
                if (list) list.style.display = 'block';
            } else {
                if (loading) loading.style.display = 'none';
                if (empty) empty.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error loading available members:', error);
            if (loading) loading.style.display = 'none';
            if (empty) empty.style.display = 'block';
        });
}

/**
 * Display available members in add modal
 */
function displayAvailableMembersNew(members) {
    const list = document.getElementById('availableMembersList');
    list.innerHTML = '';

    members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-item';

        memberItem.setAttribute('data-username', member.username.toLowerCase());
        memberItem.setAttribute('data-name', member.name.toLowerCase());

        memberItem.onclick = function(e) {
            if (e.target.type === 'checkbox' || e.target.closest('.role-badge')) {
                return;
            }
            const checkbox = this.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
            }
        };

        let profilePicHTML;
        if (member.profile_picture) {
            profilePicHTML = `<img src="${member.profile_picture}" alt="${member.name}" class="member-avatar">`;
        } else {
            const initials = member.name.split(' ').map(n => n[0]).join('');
            profilePicHTML = `<div class="member-avatar-initials">${initials}</div>`;
        }

        let badgesHTML = '';
        if (typeof buildUniversalRoleBadges === 'function') {
            badgesHTML = buildUniversalRoleBadges({
                userId: member.id,
                roles: member.roles || [],
                contextGameId: null,
                excludeRoles: ['Player']
            });
        } else if (typeof buildRoleBadges === 'function') {
            badgesHTML = buildRoleBadges({
                roles: member.roles || [],
                isAssignedGM: false,
                gameIconUrl: null
            });
        }

        memberItem.innerHTML = `
            <input type="checkbox"
                   id="member_${member.id}"
                   value="${member.id}">
            ${profilePicHTML}
            <div class="member-info">
                <div class="member-name">${member.name}</div>
                <div class="member-username">@${member.username}</div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                ${badgesHTML}
            </div>
        `;
        list.appendChild(memberItem);
    });
}

/**
 * Add selected members to team
 */
async function addSelectedMembersToTeam() {
    const checkboxes = document.querySelectorAll('#availableMembersList input[type="checkbox"]:checked');
    const memberIds = Array.from(checkboxes).map(cb => cb.value);

    if (memberIds.length === 0) {
        alert('Please select at least one member');
        return;
    }

    try {
        const response = await fetch(`/api/teams/${window.currentSelectedTeamId}/add-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_ids: memberIds })
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);
            closeAddTeamMembersModal();
            selectTeam(window.currentSelectedTeamId);
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to add members');
    }
}

/**
 * Close add members modal
 */
function closeAddTeamMembersModal() {
    const modal = document.getElementById('addTeamMembersModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Filter available members by search input
 */
const filterAvailableMembers = debounce(function() {
    const searchInput = document.getElementById('addMemberSearch');
    if (!searchInput) return;

    const filter = searchInput.value.toLowerCase();
    const memberItems = document.querySelectorAll('#availableMembersList .member-item');

    memberItems.forEach(item => {
        const username = item.getAttribute('data-username');
        const name = item.getAttribute('data-name');

        if (username.includes(filter) || name.includes(filter)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}, 300);

/**
 * Confirm and remove member from team
 */
function confirmRemoveMemberNew(memberId, memberName) {
    if (confirm(`Remove "${memberName}" from this team?`)) {
        removeMemberNew(memberId, memberName);
    }
}

/**
 * Remove member from current team
 */
async function removeMemberNew(memberId, memberName) {
    try {
        const response = await fetch(`/api/teams/${window.currentSelectedTeamId}/remove-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: memberId })
        });

        const data = await response.json();

        if (data.success) {
            alert(`"${memberName}" removed successfully`);
            selectTeam(window.currentSelectedTeamId);
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error removing member:', error);
        alert('Failed to remove member');
    }
}

/**
 * Helper function to populate team sizes
 * Add to teams.js
 */
function populateTeamSizes(sizes, currentMaxSize, sizeContainer) {
    sizeContainer.innerHTML = '';
    sizeContainer.className = 'team-size-options';

    sizes.forEach((size) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'team-size-option';

        const radioId = `editTeamSize${size}`;
        const isSelected = parseInt(size) === parseInt(currentMaxSize);
        const playerText = size === 1 ? 'player' : 'players';

        optionDiv.innerHTML = `
            <input type="radio"
                   name="team_sizes"
                   value="${size}"
                   id="${radioId}"
                   ${isSelected ? 'checked' : ''}>
            <label for="${radioId}">
                <div class="size-content">
                    <i class="fas fa-users size-icon"></i>
                    <div class="size-text">
                        <span class="size-number">${size} ${size == 1 ? 'Player' : 'Players'}</span>
                        <span class="size-description">Maximum ${size} ${playerText} per team</span>
                    </div>
                </div>
            </label>
        `;

        sizeContainer.appendChild(optionDiv);
    });
}

// ============================================
// TEAM EDITING
// ============================================

/**
 * Open edit team modal
 */
async function openEditTeamModal(teamId, teamName, currentMaxSize, availableSizes) {
    const modal = document.getElementById('editTeamModal');
    const modalTitle = document.getElementById('editTeamModalTitle');
    const teamIdField = document.getElementById('editTeamID');
    const teamTitleInput = document.getElementById('editTeamTitle');
    const sizeContainer = document.getElementById('editTeamSizesContainer');
    const formMessage = document.getElementById('editTeamFormMessage');

    if (!modal) {
        console.error('Edit team modal not found');
        return;
    }

    document.getElementById('editTeamForm').reset();
    formMessage.style.display = 'none';

    modalTitle.textContent = teamName;
    teamIdField.value = teamId;
    teamTitleInput.value = teamName;

    // Check if we have cached team data
    if (currentTeamCache &&
        currentTeamCache.teamId === teamId &&
        (Date.now() - currentTeamCache.timestamp) < 60000) { // 1 minute cache

        console.log('Using cached team data for edit modal');
        const team = currentTeamCache.team;

        try {
            // Still need to fetch game details, but we saved one API call
            const gameResponse = await fetch(`/api/game/${team.game_id}/details`);
            const gameData = await gameResponse.json();

            if (gameData.success) {
                populateTeamSizes(gameData.game.team_sizes || availableSizes.split(',').map(s => s.trim()),
                                 currentMaxSize,
                                 sizeContainer);
            }
        } catch (error) {
            console.error('Error loading game details:', error);
            alert('Failed to load game information. Please try again.');
            return;
        }
    } else {
        // Cache miss - fetch the data
        try {
            const response = await fetch(`/api/teams/${teamId}/details`);
            const data = await response.json();

            if (data.success) {
                const team = data.team;

                const gameResponse = await fetch(`/api/game/${team.game_id}/details`);
                const gameData = await gameResponse.json();

                if (gameData.success) {
                    populateTeamSizes(gameData.game.team_sizes || availableSizes.split(',').map(s => s.trim()),
                                     currentMaxSize,
                                     sizeContainer);
                }
            }
        } catch (error) {
            console.error('Error loading team details for edit:', error);
            alert('Failed to load team information. Please try again.');
            return;
        }
    }

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Close edit team modal
 */
function closeEditTeamModal() {
    const modal = document.getElementById('editTeamModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * Setup edit team form submission handler
 */
function setupEditTeamForm() {
    const editTeamForm = document.getElementById('editTeamForm');
    if (!editTeamForm) return;

    editTeamForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const submitBtn = editTeamForm.querySelector('button[type="submit"]');
        const submitBtnText = document.getElementById('updateTeamBtnText');
        const submitBtnSpinner = document.getElementById('updateTeamBtnSpinner');
        const formMessage = document.getElementById('editTeamFormMessage');

        submitBtn.disabled = true;
        submitBtnText.style.display = 'none';
        submitBtnSpinner.style.display = 'inline-block';

        const teamId = document.getElementById('editTeamID').value;
        const teamTitle = document.getElementById('editTeamTitle').value;

        const selectedSize = document.querySelector('input[name="team_sizes"]:checked');
        if (!selectedSize) {
            formMessage.textContent = 'Please select a team size.';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';

            submitBtn.disabled = false;
            submitBtnText.style.display = 'inline';
            submitBtnSpinner.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`/api/teams/${teamId}/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    team_title: teamTitle,
                    team_max_size: selectedSize.value
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                formMessage.textContent = data.message || 'Team updated successfully!';
                formMessage.className = 'form-message success';
                formMessage.style.display = 'block';

                // Invalidate caches
                invalidateTeamsCache();
                currentTeamCache = null;

                setTimeout(() => {
                    closeEditTeamModal();
                    window.loadTeams().then(() => {
                        selectTeam(teamId);
                    });
                }, 1500);
            } else {
                throw new Error(data.message || 'Failed to update team');
            }
        } catch (error) {
            formMessage.textContent = error.message || 'Failed to update team. Please try again.';
            formMessage.className = 'form-message error';
            formMessage.style.display = 'block';

            submitBtn.disabled = false;
            submitBtnText.style.display = 'inline';
            submitBtnSpinner.style.display = 'none';
        }
    });
}

// ============================================
// TEAM DELETION
// ============================================

/**
 * Confirm and delete selected team
 */
function confirmDeleteSelectedTeam() {
    if (!window.currentSelectedTeamId) return;

    const teamName = document.getElementById('teamDetailTitle').textContent;
    if (confirm(`Are you sure you want to delete "${teamName}"?\n\nThis action cannot be undone.`)) {
        deleteTeamNew(window.currentSelectedTeamId);
    }
}

/**
 * Delete team
 */
async function deleteTeamNew(teamId) {
    try {
        const response = await fetch('/delete-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_id: teamId })
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);

            // Invalidate cache
            invalidateTeamsCache();

            window.currentSelectedTeamId = null;
            document.getElementById('teamsWelcomeState').style.display = 'flex';
            document.getElementById('teamsDetailContent').style.display = 'none';
            window.loadTeams();
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error deleting team:', error);
        alert('Failed to delete team');
    }
}

// ============================================
// TAB SWITCHING
// ============================================

/**
 * Initialize tab switching and other event listeners
 */
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.team-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-team-tab');

            document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            document.querySelectorAll('.team-tab-panel').forEach(panel => panel.classList.remove('active'));
            document.getElementById(`${targetTab}TabContent`)?.classList.add('active');

            if (targetTab === 'schedule' && window.currentSelectedTeamId) {
                loadScheduleTab(window.currentSelectedTeamId);
            }

            if (targetTab === 'stats' && window.currentSelectedTeamId) {
                const team = window.allTeamsData.find(t => t.TeamID === window.currentSelectedTeamId);
                if (team && team.gameID) {
                    loadStatsTab(window.currentSelectedTeamId, team.gameID);
                }
            }

            if (targetTab === 'vods' && window.currentSelectedTeamId) {
                loadTeamVods(window.currentSelectedTeamId);
            }
        });
    });

    const teamsTab = document.querySelector('[data-tab="teams"]');
    if (teamsTab) {
        teamsTab.addEventListener('click', window.loadTeams);
    }

    setupEditTeamForm();
});

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

window.selectTeam = selectTeam;
window.filterRosterMembers = filterRosterMembers;
window.confirmDeleteSelectedTeam = confirmDeleteSelectedTeam;
window.confirmRemoveMemberNew = confirmRemoveMemberNew;
window.openAddTeamMembersModal = openAddTeamMembersModal;
window.addSelectedMembersToTeam = addSelectedMembersToTeam;
window.closeAddTeamMembersModal = closeAddTeamMembersModal;
window.filterAvailableMembers = filterAvailableMembers;
window.loadNextScheduledEvent = loadNextScheduledEvent;
window.openEditTeamModal = openEditTeamModal;
window.closeEditTeamModal = closeEditTeamModal;
window.populateTeamSizes = populateTeamSizes;