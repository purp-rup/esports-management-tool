/**
 * Teams Management JavaScript
 * Handles team loading, display, and modal interactions
 */

let currentTeamId = null;

/**
 * Load all teams from the server
 */
async function loadTeams() {
    const loadingDiv = document.getElementById('teamsLoading');
    const gridDiv = document.getElementById('teamsGrid');
    const emptyDiv = document.getElementById('teamsEmpty');

    // Show loading state
    loadingDiv.style.display = 'block';
    gridDiv.style.display = 'none';
    emptyDiv.style.display = 'none';

    try {
        const response = await fetch('/teams');
        const data = await response.json();

        if (data.success && data.teams && data.teams.length > 0) {
            // Display teams
            displayTeams(data.teams);
            loadingDiv.style.display = 'none';
            gridDiv.style.display = 'block';
        } else {
            // Show empty state
            loadingDiv.style.display = 'none';
            emptyDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading teams:', error);
        loadingDiv.style.display = 'none';
        emptyDiv.style.display = 'block';
    }
}

/**
 * Display teams in grid layout
 */
async function displayTeams(teams) {
    const gridDiv = document.getElementById('teamsGrid');
    gridDiv.className = 'rosters-grid';
    gridDiv.innerHTML = '';

    // Check if current user is admin or GM
    const isAdmin = window.userPermissions?.is_admin || false;
    const isGM = window.userPermissions?.is_gm || false;

    for (const team of teams) {
        // Get member data
        const memberCount = team.member_count || 0;
        const isMember = team.is_member;

        const iconHTML = '<i class="fas fa-shield-alt"></i>';

        // Delete button for admins and GMs
        const deleteButtonHTML = (isAdmin || isGM) ? `
            <button class="game-delete-btn"
                    onclick="confirmDeleteTeam('${team.TeamID}', '${team.teamName.replace(/'/g, "\\'")}')"
                    title="Delete team">
                <i class="fas fa-trash"></i>
            </button>
        ` : '';

        const memberBadge = isMember ? `
            <span class="member-badge">
                <i class="fas fa-check-circle"></i> Joined
            </span>
        ` : '';

        const card = document.createElement('div');
        card.className = 'roster-card';
        card.innerHTML = `
            ${deleteButtonHTML}
            <div class="roster-card-header">
                <div class="roster-icon">
                    ${iconHTML}
                </div>
                <h3 class="roster-card-title">
                    ${team.teamName}
                    ${memberBadge}
                </h3>
            </div>
            <p class="roster-card-description">Team for Game: ${team.GameTitle || 'Unknown Game'}</p>

            <div class="roster-card-meta">
                <div class="roster-stat">
                    <i class="fas fa-users roster-stat-icon"></i>
                    <div class="roster-stat-number">${memberCount}</div>
                    <div class="roster-stat-label">Members</div>
                </div>
                <div class="roster-stat">
                    <i class="fas fa-trophy roster-stat-icon"></i>
                    <div class="roster-stat-number">${team.teamMaxSize}</div>
                    <div class="roster-stat-label">Max Size</div>
                </div>
            </div>

            <div class="roster-card-actions">
                <button class="btn btn-primary" onclick="openTeamDetailsModal('${team.TeamID}')">
                    <i class="fas fa-eye"></i> View Details
                </button>
            </div>
        `;
        gridDiv.appendChild(card);
    }
}

/**
 * Open team details modal
 */
async function openTeamDetailsModal(teamId) {
    currentTeamId = teamId;
    const modal = document.getElementById('teamDetailsModal');
    const loading = document.getElementById('teamDetailsLoading');
    const content = document.getElementById('teamDetailsContent');

    const isAdmin = window.userPermissions?.is_admin || false;
    const isGM = window.userPermissions?.is_gm || false;

    modal.style.display = 'block';
    loading.style.display = 'block';
    content.style.display = 'none';
    document.body.style.overflow = 'hidden';

    try {
        const response = await fetch(`/api/teams/${teamId}/details`);
        const data = await response.json();

        if (data.success) {
            const team = data.team;

            // Update modal title
            document.getElementById('teamDetailsModalTitle').textContent = team.title;
            document.getElementById('teamDetailsTitle').textContent = team.title;
            document.getElementById('teamDetailsMaxSize').textContent = team.team_max_size;
            document.getElementById('teamDetailsMemberCount').textContent = team.member_count;



            // Populate members list
            const membersList = document.getElementById('teamMembersList');
            const noMembers = document.getElementById('teamNoMembers');
            const searchInput = document.getElementById('teamMemberSearch');

            if (team.members.length > 0) {
                membersList.innerHTML = '';
                membersList.style.display = 'block';
                noMembers.style.display = 'none';

                // Show search input
                if (searchInput) {
                    searchInput.style.display = 'block';
                    searchInput.value = '';
                }

                team.members.forEach(member => {
                    const memberItem = document.createElement('div');
                    memberItem.className = 'member-item';
                    memberItem.setAttribute('data-username', member.username.toLowerCase());
                    memberItem.setAttribute('data-name', member.name.toLowerCase());

                    // Profile picture or initials
                    let profilePicHTML;
                    if (member.profile_picture) {
                        profilePicHTML = `<img src="${member.profile_picture}" alt="${member.name}" class="member-avatar">`;
                    } else {
                        const initials = member.name.split(' ').map(n => n[0]).join('');
                        profilePicHTML = `<div class="member-avatar-initials">${initials}</div>`;
                    }

                    // Build role badges (if buildRoleBadges function exists)
                    let badgesHTML = '';
                    if (typeof buildRoleBadges === 'function') {
                        badgesHTML = buildRoleBadges({
                            roles: member.roles || [],
                            isAssignedGM: false,
                            gameIconUrl: null
                        });
                    }

                    const removeButtonHTML = (isAdmin || isGM) ? `
                        <button class="btn-icon-danger" 
                            onclick="confirmRemoveMember('${member.id}', '${member.name.replace(/'/g, "\\'")}')"
                            title="Remove member"
                            style="margin-left: auto;">
                            <i class="fas fa-user-minus"></i>
                        </button>
                     ` : '';

                    memberItem.innerHTML = `
                        ${profilePicHTML}
                        <div class="member-info">
                            <div class="member-name">${member.name}</div>
                            <div class="member-username">@${member.username}</div>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            ${badgesHTML}
                            ${removeButtonHTML}
                        </div>
                    `;
                    membersList.appendChild(memberItem);
                });
            } else {
                membersList.style.display = 'none';
                noMembers.style.display = 'block';
            }

            // Update action buttons
            const joinBtn = document.getElementById('teamDetailsJoinBtn');
            const leaveBtn = document.getElementById('teamDetailsLeaveBtn');

            if (team.is_member) {
                if (joinBtn) joinBtn.style.display = 'none';
                if (leaveBtn) {
                    leaveBtn.style.display = 'inline-flex';
                    leaveBtn.onclick = () => confirmLeaveTeam(teamId, team.title);
                }
            } else {
                if (leaveBtn) leaveBtn.style.display = 'none';
                if (joinBtn) {
                    joinBtn.style.display = 'inline-flex';
                    joinBtn.onclick = () => confirmJoinTeam(teamId, team.title);
                }
            }

            // Show content, hide loading
            loading.style.display = 'none';
            content.style.display = 'block';

            const addMembersBtn = document.getElementById('addTeamMembersBtn');

            if (addMembersBtn && (isAdmin || isGM)) {
                addMembersBtn.style.display = 'inline-flex';
            } else if (addMembersBtn) {
                addMembersBtn.style.display = 'none';
            }

        } else {
            throw new Error(data.message || 'Failed to load team details');
        }
    } catch (error) {
        console.error('Error loading team details:', error);
        loading.innerHTML = `
            <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: #ff5252;"></i>
            <p style="color: var(--text-secondary); margin-top: 1rem;">Failed to load team details</p>
        `;
    }
}

/**
 * Close team details modal
 */
function closeTeamDetailsModal() {
    const modal = document.getElementById('teamDetailsModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentTeamId = null;
}

/**
 * Filter members in the team details modal
 */
function filterTeamMembers() {
    const searchInput = document.getElementById('teamMemberSearch');
    const filter = searchInput.value.toLowerCase();
    const memberItems = document.querySelectorAll('#teamMembersList .member-item');

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


/**
 * Close confirmation modal
 */
function closeConfirmModal() {
    const modal = document.getElementById('confirmJoinModal');
    if (modal) {
        modal.remove();
    }
}


/**
 * Confirm deleting a team
 */
function confirmDeleteTeam(teamId, teamName) {
    if (!confirm(`Are you sure you want to delete "${teamName}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    deleteTeam(teamId, teamName);
}

/**
 * Delete team from database
 */
async function deleteTeam(teamId, teamName) {
    try {
        const response = await fetch('/delete-team', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ team_id: teamId })
        });

        const data = await response.json();

        if (data.success) {
            alert(`"${teamName}" has been deleted successfully!`);
            loadTeams();
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error deleting team:', error);
        alert('An error occurred while deleting the team. Please try again.');
    }
}

/**
 * Open add team members modal
 */
async function openAddTeamMembersModal() {
    if (!currentTeamId) return;

    const modal = document.getElementById('addTeamMembersModal');
    const loading = document.getElementById('availableMembersLoading');
    const list = document.getElementById('availableMembersList');
    const empty = document.getElementById('noAvailableMembers');
    const teamName = document.getElementById('teamDetailsTitle').textContent;

    document.getElementById('addMembersTeamName').textContent = teamName;

    modal.style.display = 'block';
    loading.style.display = 'block';
    list.style.display = 'none';
    empty.style.display = 'none';

    try {
        const response = await fetch(`/api/teams/${currentTeamId}/available-members`);
        const data = await response.json();

        if (data.success && data.members && data.members.length > 0) {
            displayAvailableMembers(data.members);
            loading.style.display = 'none';
            list.style.display = 'block';
        } else {
            loading.style.display = 'none';
            empty.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading available members:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
    }
}

/**
 * Display available members with checkboxes
 */
function displayAvailableMembers(members) {
    const list = document.getElementById('availableMembersList');
    list.innerHTML = '';

    members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-item';
        memberItem.setAttribute('data-username', member.username.toLowerCase());
        memberItem.setAttribute('data-name', member.name.toLowerCase());

        // Profile picture or initials
        let profilePicHTML;
        if (member.profile_picture) {
            profilePicHTML = `<img src="${member.profile_picture}" alt="${member.name}" class="member-avatar">`;
        } else {
            const initials = member.name.split(' ').map(n => n[0]).join('');
            profilePicHTML = `<div class="member-avatar-initials">${initials}</div>`;
        }

        // Build role badges
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
 * Filter available members
 */
function filterAvailableMembers() {
    const searchInput = document.getElementById('addMemberSearch');
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

/**
 * Add selected members to team
 */
async function addSelectedMembersToTeam() {
    const checkboxes = document.querySelectorAll('#availableMembersList input[type="checkbox"]:checked');
    const memberIds = Array.from(checkboxes).map(cb => cb.value);

    if (memberIds.length === 0) {
        alert('Please select at least one member to add');
        return;
    }

    try {
        const response = await fetch(`/api/teams/${currentTeamId}/add-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_ids: memberIds })
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);
            closeAddTeamMembersModal();
            openTeamDetailsModal(currentTeamId); // Refresh the team details
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error adding members:', error);
        alert('Failed to add members. Please try again.');
    }
}

/**
 * Close add team members modal
 */
function closeAddTeamMembersModal() {
    const modal = document.getElementById('addTeamMembersModal');
    modal.style.display = 'none';
}

/**
 * Confirm removing a member from team
 */
function confirmRemoveMember(memberId, memberName) {
    if (!confirm(`Are you sure you want to remove "${memberName}" from this team?`)) {
        return;
    }

    removeMemberFromTeam(memberId, memberName);
}

/**
 * Remove member from team
 */
async function removeMemberFromTeam(memberId, memberName) {
    try {
        const response = await fetch(`/api/teams/${currentTeamId}/remove-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: memberId })
        });

        const data = await response.json();

        if (data.success) {
            alert(`"${memberName}" has been removed from the team`);
            openTeamDetailsModal(currentTeamId); // Refresh the team details
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error removing member:', error);
        alert('Failed to remove member. Please try again.');
    }
}
// ===================================
// EVENT LISTENERS
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    // Load teams when Teams tab is clicked
    const teamsTab = document.querySelector('[data-tab="teams"]');
    if (teamsTab) {
        teamsTab.addEventListener('click', loadTeams);
    }

    // Load teams when dropdown changes to teams
    const tabDropdown = document.getElementById('tabDropdown');
    if (tabDropdown) {
        tabDropdown.addEventListener('change', function(e) {
            if (e.target.value === 'teams') {
                loadTeams();
            }
        });
    }
});