/**
 * Teams Management JavaScript - REDESIGNED
 * New sidebar layout with tab navigation
 */

let currentSelectedTeamId = null;
let allTeamsData = [];

/**
 * Load teams based on user role
 * - Admins see all teams
 * - GMs see only teams they created
 */
async function loadTeams() {
    const sidebarLoading = document.getElementById('teamsSidebarLoading');
    const sidebarList = document.getElementById('teamsSidebarList');
    const sidebarEmpty = document.getElementById('teamsSidebarEmpty');

    // Show loading
    sidebarLoading.style.display = 'block';
    sidebarList.style.display = 'none';
    sidebarEmpty.style.display = 'none';

    try {
        const response = await fetch('/api/teams/sidebar');
        const data = await response.json();

        if (data.success && data.teams && data.teams.length > 0) {
            allTeamsData = data.teams;
            renderTeamsSidebar(data.teams);
            sidebarLoading.style.display = 'none';
            sidebarList.style.display = 'flex';
        } else {
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
 * Render teams in sidebar
 */
function renderTeamsSidebar(teams) {
    const sidebarList = document.getElementById('teamsSidebarList');
    sidebarList.innerHTML = '';

    teams.forEach(team => {
        const teamItem = document.createElement('div');
        teamItem.className = 'team-sidebar-item';
        teamItem.setAttribute('data-team-id', team.TeamID);
        teamItem.onclick = () => selectTeam(team.TeamID);

        teamItem.innerHTML = `
            <div class="team-sidebar-name">${team.teamName}</div>
            <div class="team-sidebar-game">${team.GameTitle || 'Unknown Game'}</div>
            <div class="team-sidebar-meta">
                <span><i class="fas fa-users"></i> ${team.member_count || 0}</span>
                <span><i class="fas fa-trophy"></i> ${team.teamMaxSize}</span>
            </div>
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

    // Load team details
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

            // Update header
            document.getElementById('teamDetailTitle').textContent = team.title;
            document.getElementById('teamDetailGame').textContent = `Game: ${team.game_title || 'Unknown'}`;

            // Update team icon with game image
            const teamIconLarge = document.querySelector('.team-icon-large');
            if (teamIconLarge) {
                if (team.game_icon_url) {
                    // Use game icon/image
                    teamIconLarge.innerHTML = `<img src="${team.game_icon_url}"
                                                     alt="${team.game_title}"
                                                     style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;"
                                                     onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-shield-alt\\'></i>';">`;
                } else {
                    // Fallback to shield icon
                    teamIconLarge.innerHTML = '<i class="fas fa-shield-alt"></i>';
                }
            }

            // Update stats
            document.getElementById('teamStatMembers').textContent = team.member_count || 0;
            document.getElementById('teamStatMaxSize').textContent = team.team_max_size || 0;

            // Show/hide action buttons based on permissions
            const isAdmin = window.userPermissions?.is_admin || false;
            const isGM = window.userPermissions?.is_gm || false;

            const addPlayerBtn = document.getElementById('addPlayerBtn');
            const deleteTeamBtn = document.getElementById('deleteTeamBtn');

            if (addPlayerBtn) {
                addPlayerBtn.style.display = (isAdmin || isGM) ? 'inline-flex' : 'none';
                // Make sure the onclick is properly attached
                addPlayerBtn.onclick = openAddTeamMembersModal;
            }

            if (deleteTeamBtn) {
                deleteTeamBtn.style.display = (isAdmin || isGM) ? 'inline-flex' : 'none';
            }

            // Load roster (default tab)
            loadRosterTab(team.members || []);
        }
    } catch (error) {
        console.error('Error loading team details:', error);
    }
}

/**
 * Load roster tab with members - UPDATED WITH UNIVERSAL BADGES
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

    members.forEach(member => {
        const memberCard = document.createElement('div');
        memberCard.className = 'roster-member-card';
        memberCard.setAttribute('data-member-name', member.name.toLowerCase());
        memberCard.setAttribute('data-member-username', member.username.toLowerCase());

        // Avatar
        let avatarHTML;
        if (member.profile_picture) {
            avatarHTML = `<img src="${member.profile_picture}" alt="${member.name}" class="roster-member-avatar">`;
        } else {
            const initials = member.name.split(' ').map(n => n[0]).join('');
            avatarHTML = `<div class="roster-member-initials">${initials}</div>`;
        }

        // Build role badges using UNIVERSAL badge system
        let badgesHTML = '';
        if (typeof buildUniversalRoleBadges === 'function') {
            badgesHTML = buildUniversalRoleBadges({
                userId: member.id,
                roles: member.roles || [],
                contextGameId: null // No specific game context in teams view
            });
        } else if (typeof buildRoleBadges === 'function') {
            // Fallback to legacy function
            badgesHTML = buildRoleBadges({
                roles: member.roles || [],
                isAssignedGM: false,
                gameIconUrl: null
            });
        }

        // Remove button (only for admins/GMs)
        const isAdmin = window.userPermissions?.is_admin || false;
        const isGM = window.userPermissions?.is_gm || false;
        const removeBtn = (isAdmin || isGM) ? `
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
 * Display available members - UPDATED WITH UNIVERSAL BADGES
 */
function displayAvailableMembersNew(members) {
    const list = document.getElementById('availableMembersList');
    list.innerHTML = '';

    members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-item';
        memberItem.setAttribute('data-username', member.username.toLowerCase());
        memberItem.setAttribute('data-name', member.name.toLowerCase());

        let profilePicHTML;
        if (member.profile_picture) {
            profilePicHTML = `<img src="${member.profile_picture}" alt="${member.name}" class="member-avatar">`;
        } else {
            const initials = member.name.split(' ').map(n => n[0]).join('');
            profilePicHTML = `<div class="member-avatar-initials">${initials}</div>`;
        }

        // Build role badges using UNIVERSAL badge system
        let badgesHTML = '';
        if (typeof buildUniversalRoleBadges === 'function') {
            badgesHTML = buildUniversalRoleBadges({
                userId: member.id,
                roles: member.roles || [],
                contextGameId: null
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
                   value="${member.id}"
                   style="margin-right: 1rem;">
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

            // Update active tab
            document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // Update active panel
            document.querySelectorAll('.team-tab-panel').forEach(panel => panel.classList.remove('active'));
            document.getElementById(`${targetTab}TabContent`)?.classList.add('active');
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
            // Reload teams and reset view
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
            selectTeam(currentSelectedTeamId); // Reload current team
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
    console.log('Opening add members modal for team:', currentSelectedTeamId);

    if (!currentSelectedTeamId) {
        console.error('No team selected');
        alert('Please select a team first');
        return;
    }

    const modal = document.getElementById('addTeamMembersModal');
    if (!modal) {
        console.error('Add team members modal not found in DOM');
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

        let profilePicHTML;
        if (member.profile_picture) {
            profilePicHTML = `<img src="${member.profile_picture}" alt="${member.name}" class="member-avatar">`;
        } else {
            const initials = member.name.split(' ').map(n => n[0]).join('');
            profilePicHTML = `<div class="member-avatar-initials">${initials}</div>`;
        }

        let badgesHTML = '';
        if (typeof buildRoleBadges === 'function') {
            badgesHTML = buildRoleBadges({
                roles: member.roles || [],
                isAssignedGM: false,
                gameIconUrl: null
            });
        }

        memberItem.innerHTML = `
            <input type="checkbox"
                   id="member_${member.id}"
                   value="${member.id}"
                   style="margin-right: 1rem;">
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
            selectTeam(currentSelectedTeamId); // Reload team
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