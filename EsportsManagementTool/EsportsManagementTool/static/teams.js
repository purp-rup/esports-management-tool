/**
 * Teams Management JavaScript
 * Supports role-based view switching with persistence
 */

let currentSelectedTeamId = null;
let allTeamsData = [];
let availableViews = [];
let currentView = null;

// Session storage key for view persistence
const VIEW_STORAGE_KEY = 'teams_selected_view';

/**
 * Initialize view switcher on page load
 */
async function initializeViewSwitcher() {
    try {
        const response = await fetch('/api/teams/available-views');
        const data = await response.json();

        if (data.success && data.views && data.views.length > 0) {
            availableViews = data.views;

            // Get stored view preference or use first (highest priority) view
            const storedView = sessionStorage.getItem(VIEW_STORAGE_KEY);
            const validStoredView = availableViews.find(v => v.value === storedView);
            currentView = validStoredView ? storedView : availableViews[0].value;

            // Show switcher only if user has multiple views
            if (data.has_multiple) {
                renderViewSwitcher();
            } else {
                hideViewSwitcher();
            }
        } else {
            hideViewSwitcher();
        }
    } catch (error) {
        console.error('Error initializing view switcher:', error);
        hideViewSwitcher();
    }
}

/**
 * Render the view switcher dropdown
 */
function renderViewSwitcher() {
    const viewSwitcher = document.getElementById('teamViewSwitcher');
    const viewSelect = document.getElementById('teamViewSelect');

    if (!viewSwitcher || !viewSelect) {
        console.error('View switcher elements not found');
        return;
    }

    // Clear existing options
    viewSelect.innerHTML = '';

    // Add options
    availableViews.forEach(view => {
        const option = document.createElement('option');
        option.value = view.value;
        option.textContent = view.label;
        if (view.value === currentView) {
            option.selected = true;
        }
        viewSelect.appendChild(option);
    });

    // Show the switcher
    viewSwitcher.classList.remove('hidden');

    // Attach change event
    viewSelect.onchange = handleViewChange;
}

/**
 * Hide the view switcher
 */
function hideViewSwitcher() {
    const viewSwitcher = document.getElementById('teamViewSwitcher');
    if (viewSwitcher) {
        viewSwitcher.classList.add('hidden');
    }
}

/**
 * Handle view change from dropdown
 */
function handleViewChange(event) {
    const newView = event.target.value;
    if (newView !== currentView) {
        currentView = newView;

        // Persist the selection
        sessionStorage.setItem(VIEW_STORAGE_KEY, newView);

        // Reset selected team and reload
        currentSelectedTeamId = null;
        document.getElementById('teamsWelcomeState').style.display = 'flex';
        document.getElementById('teamsDetailContent').style.display = 'none';

        // Reload teams with new view
        loadTeams();
    }
}

/**
 * Load teams based on user role and selected view
 */
async function loadTeams() {
    const sidebarLoading = document.getElementById('teamsSidebarLoading');
    const sidebarList = document.getElementById('teamsSidebarList');
    const sidebarEmpty = document.getElementById('teamsSidebarEmpty');
    const sidebarSubtitle = document.querySelector('.teams-subtitle');

    // Initialize view switcher if not already done
    if (availableViews.length === 0) {
        await initializeViewSwitcher();
    }

    // Show loading
    sidebarLoading.style.display = 'block';
    sidebarList.style.display = 'none';
    sidebarEmpty.style.display = 'none';

    try {
        // Build URL with view parameter if we have a current view
        const url = currentView
            ? `/api/teams/sidebar?view=${currentView}`
            : '/api/teams/sidebar';

        const response = await fetch(url);
        const data = await response.json();

        if (data.success && data.teams && data.teams.length > 0) {
            allTeamsData = data.teams;

            // Update subtitle based on current view with team count
            if (sidebarSubtitle) {
                const viewLabel = getSubtitleForView(currentView, data.teams.length);
                sidebarSubtitle.textContent = viewLabel;
            }

            renderTeamsSidebar(data.teams);
            sidebarLoading.style.display = 'none';
            sidebarList.style.display = 'flex';
        } else {
            // Update subtitle to show zero count
            if (sidebarSubtitle) {
                const viewLabel = getSubtitleForView(currentView, 0);
                sidebarSubtitle.textContent = viewLabel;
            }

            // Update empty state message based on view
            if (sidebarEmpty) {
                const emptyMessage = getEmptyMessageForView(currentView);
                sidebarEmpty.innerHTML = `<i class="fas fa-users"></i><p>${emptyMessage}</p>`;
            }

            sidebarLoading.style.display = 'none';
            sidebarEmpty.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading teams:', error);
        sidebarLoading.style.display = 'none';
        sidebarEmpty.style.display = 'block';
    }
}

/**
 * Get subtitle text based on current view
 * @param {string} view - Current view mode
 * @param {number} count - Number of teams in current view
 */
function getSubtitleForView(view, count = 0) {
    const viewObj = availableViews.find(v => v.value === view);
    let label = '';

    if (viewObj) {
        label = viewObj.label;
    } else {
        // Fallback based on user permissions
        const isAdmin = window.userPermissions?.is_admin || false;
        const isGM = window.userPermissions?.is_gm || false;

        if (isAdmin) {
            label = 'All Teams';
        } else if (isGM) {
            label = 'Teams I Manage';
        } else {
            label = 'Your Teams';
        }
    }

    // Add count to label
    return `${label} (${count})`;
}

/**
 * Get empty state message based on current view
 */
function getEmptyMessageForView(view) {
    switch (view) {
        case 'all':
            return 'No teams have been created yet.';
        case 'manage':
            return 'You are not managing any teams yet.';
        case 'play':
            return 'You are not a member of any teams yet.';
        default:
            return 'No teams available.';
    }
}

/**
 * Render teams in sidebar
 */
function renderTeamsSidebar(teams) {
    const sidebarList = document.getElementById('teamsSidebarList');
    sidebarList.innerHTML = '';

    teams.forEach(team => {
        const teamItem = document.createElement('div');
        teamItem.className = 'team-sidebar-item';
        teamItem.setAttribute('data-team-id', team.TeamID);
        teamItem.setAttribute('data-gm-id', team.gm_id || ''); // Store GM ID for permission check

        // Check if current user is the GM for THIS specific game
        const isGameManager = team.gm_id && team.gm_id === window.currentUserId;

        // Only add click handler to the main area, not the edit button
        teamItem.innerHTML = `
            <div class="team-sidebar-content" onclick="selectTeam('${team.TeamID}')">
                <div class="team-sidebar-name">${team.teamName}</div>
                <div class="team-sidebar-game">${team.GameTitle || 'Unknown Game'}</div>
                <div class="team-sidebar-meta">
                    <span><i class="fas fa-users"></i> ${team.member_count || 0}</span>
                    <span><i class="fas fa-trophy"></i> ${team.teamMaxSize}</span>
                </div>
            </div>
            ${isGameManager ? `
                <button class="team-edit-btn"
                        onclick="event.stopPropagation(); openEditTeamModal('${team.TeamID}', '${team.teamName.replace(/'/g, "\\'")}', ${team.teamMaxSize}, '${team.TeamSizes || ''}')"
                        title="Edit team">
                    <i class="fas fa-edit"></i>
                </button>
            ` : ''}
        `;

        sidebarList.appendChild(teamItem);
    });
}

/**
 * Select a team from sidebar
 */
async function selectTeam(teamId) {
    currentSelectedTeamId = teamId;

    // Update sidebar selection
    document.querySelectorAll('.team-sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-team-id="${teamId}"]`)?.classList.add('active');

    // Hide welcome, show details
    document.getElementById('teamsWelcomeState').style.display = 'none';
    document.getElementById('teamsDetailContent').style.display = 'block';

    // Reset to Roster tab (first tab)
    document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.team-tab-panel').forEach(panel => panel.classList.remove('active'));

    const rosterTab = document.querySelector('[data-team-tab="roster"]');
    const rosterPanel = document.getElementById('rosterTabContent');
    if (rosterTab) rosterTab.classList.add('active');
    if (rosterPanel) rosterPanel.classList.add('active');

    // Clear Schedule tab content so it reloads when clicked
    const schedulePanel = document.getElementById('scheduleTabContent');
    if (schedulePanel) {
        schedulePanel.innerHTML = `
            <div class="schedule-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading schedules...</p>
            </div>
        `;
    }

    // Load team details
    await loadTeamDetails(teamId);
}

/**
 * Method to load the next scheduled event onto the next-scheduled-event-card for each team.
 */
async function loadNextScheduledEvent(teamId, gameId) {
    const container = document.getElementById('nextScheduledEventContainer');

    if (!container) {
        console.error('nextScheduledEventContainer not found');
        return;
    }

    // Validate inputs
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

    // Show loading state
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

            // Format similar to "Today's Events" on calendar
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
            // No scheduled events
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

/**
 * Load detailed team information
 */
async function loadTeamDetails(teamId) {
    try {
        const response = await fetch(`/api/teams/${teamId}/details`);
        const data = await response.json();

        if (data.success) {
            const team = data.team;

            // Update header
            document.getElementById('teamDetailTitle').textContent = team.title;
            document.getElementById('teamDetailGame').textContent = `Game: ${team.game_title || 'Unknown'}`;

            // Update team icon with game image
            const teamIconLarge = document.querySelector('.team-icon-large');
            if (teamIconLarge) {
                if (team.game_icon_url) {
                    teamIconLarge.innerHTML = `<img src="${team.game_icon_url}"
                                                     alt="${team.game_title}"
                                                     style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;"
                                                     onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-shield-alt\\'></i>';">`;
                } else {
                    teamIconLarge.innerHTML = '<i class="fas fa-shield-alt"></i>';
                }
            }

            // Update stats
            document.getElementById('teamStatMembers').textContent = team.member_count || 0;
            document.getElementById('teamStatMaxSize').textContent = team.team_max_size || 0;

            // Load next scheduled event card with correct game_id
            if (team.game_id) {
                loadNextScheduledEvent(teamId, team.game_id);
            } else {
                // Show empty state if no game_id
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

            // Show/hide action buttons based on permissions
            const isAdmin = window.userPermissions?.is_admin || false;
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

            // Load roster (default tab)
            loadRosterTab(team.members || []);
        }
    } catch (error) {
        console.error('Error loading team details:', error);
    }
}

/**
 * Load roster tab with members
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
    rosterList.innerHTML = '';

    const isAdmin = window.userPermissions?.is_admin || false;
    const isGM = window.userPermissions?.is_gm || false;
    const canManage = isAdmin || isGM;

    members.forEach(member => {
        const memberCard = document.createElement('div');
        memberCard.className = 'roster-member-card';
        memberCard.setAttribute('data-member-name', member.name.toLowerCase());
        memberCard.setAttribute('data-member-username', member.username.toLowerCase());

        let avatarHTML;
        if (member.profile_picture) {
            avatarHTML = `<img src="${member.profile_picture}" alt="${member.name}" class="roster-member-avatar">`;
        } else {
            const initials = member.name.split(' ').map(n => n[0]).join('');
            avatarHTML = `<div class="roster-member-initials">${initials}</div>`;
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

        rosterList.appendChild(memberCard);
    });
}

/**
 * Filter roster members by search
 */
function filterRosterMembers() {
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
}

/**
 * Handle team tab switching
 */
document.addEventListener('DOMContentLoaded', function() {
    // Tab switching
    document.querySelectorAll('.team-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-team-tab');

            document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            document.querySelectorAll('.team-tab-panel').forEach(panel => panel.classList.remove('active'));
            document.getElementById(`${targetTab}TabContent`)?.classList.add('active');

            // Load schedule data when Schedule tab is clicked (handled here, but rest of schedule tab code is in scheduled-events.js).
            if (targetTab === 'schedule' && currentSelectedTeamId) {
                loadScheduleTab(currentSelectedTeamId);
            }
                //Load stats when Stats tab is clicked
            if (targetTab === 'stats' && currentSelectedTeamId) {
                const team = allTeamsData.find(t => t.TeamID === currentSelectedTeamId);
                if (team && team.gameID) {
                    loadStatsTab(currentSelectedTeamId, team.gameID);
                }
            }
        });
    });

    // Load teams when Teams tab is clicked
    const teamsTab = document.querySelector('[data-tab="teams"]');
    if (teamsTab) {
        teamsTab.addEventListener('click', loadTeams);
    }
});

/**
 * Confirm and delete selected team
 */
function confirmDeleteSelectedTeam() {
    if (!currentSelectedTeamId) return;

    const teamName = document.getElementById('teamDetailTitle').textContent;
    if (confirm(`Are you sure you want to delete "${teamName}"?\n\nThis action cannot be undone.`)) {
        deleteTeamNew(currentSelectedTeamId);
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
            currentSelectedTeamId = null;
            document.getElementById('teamsWelcomeState').style.display = 'flex';
            document.getElementById('teamsDetailContent').style.display = 'none';
            loadTeams();
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error deleting team:', error);
        alert('Failed to delete team');
    }
}

/**
 * Confirm and remove member
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
        const response = await fetch(`/api/teams/${currentSelectedTeamId}/remove-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: memberId })
        });

        const data = await response.json();

        if (data.success) {
            alert(`"${memberName}" removed successfully`);
            selectTeam(currentSelectedTeamId);
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error removing member:', error);
        alert('Failed to remove member');
    }
}

/**
 * Open add team members modal
 */
function openAddTeamMembersModal() {
    if (!currentSelectedTeamId) {
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

    fetch(`/api/teams/${currentSelectedTeamId}/available-members`)
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
 * Display available members
 */
function displayAvailableMembersNew(members) {
    const list = document.getElementById('availableMembersList');
    list.innerHTML = '';

    members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-item';
        memberItem.setAttribute('data-username', member.username.toLowerCase());
        memberItem.setAttribute('data-name', member.name.toLowerCase());

        // Make the whole item clickable to toggle checkbox
        memberItem.onclick = function(e) {
            // Don't toggle if clicking the checkbox itself or badges
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
        const response = await fetch(`/api/teams/${currentSelectedTeamId}/add-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_ids: memberIds })
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);
            closeAddTeamMembersModal();
            selectTeam(currentSelectedTeamId);
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

    // Reset form
    document.getElementById('editTeamForm').reset();
    formMessage.style.display = 'none';

    // Set values
    modalTitle.textContent = teamName;
    teamIdField.value = teamId;
    teamTitleInput.value = teamName;

    // Get available team sizes for this game
    // We need to fetch the team details to get the game's available sizes
    try {
        const response = await fetch(`/api/teams/${teamId}/details`);
        const data = await response.json();

        if (data.success) {
            const team = data.team;

            // Get game details to fetch available team sizes
            const gameResponse = await fetch(`/api/game/${team.game_id}/details`);
            const gameData = await gameResponse.json();

            if (gameData.success) {
                const sizes = gameData.game.team_sizes || availableSizes.split(',').map(s => s.trim());

                // Populate team size radio buttons
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
        }
    } catch (error) {
        console.error('Error loading team details for edit:', error);
        alert('Failed to load team information. Please try again.');
        return;
    }

    // Show modal
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
 * Setup edit team form submission
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

                setTimeout(() => {
                    closeEditTeamModal();
                    // Reload teams and re-select the current team
                    loadTeams().then(() => {
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

// Initialize edit form on DOM load
document.addEventListener('DOMContentLoaded', function() {
    setupEditTeamForm();
});

/**
 * Filter available members
 */
function filterAvailableMembers() {
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
}

// Export functions to window object
window.loadTeams = loadTeams;
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