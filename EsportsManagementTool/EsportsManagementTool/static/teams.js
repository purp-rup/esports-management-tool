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

// ============================================
// TEAM LEAGUE TAG SYSTEM
// ============================================

/**
 * State for league selection
 */
let selectedLeaguesForTeam = [];
let leaguesCache = null;

/**
 * Load all available leagues
 */
async function loadAllLeagues() {
    if (leaguesCache) {
        return leaguesCache;
    }

    try {
        const response = await fetch('/api/leagues/all');
        const data = await response.json();

        if (data.success && data.leagues) {
            leaguesCache = data.leagues;
            return leaguesCache;
        } else {
            console.error('Failed to load leagues');
            return [];
        }
    } catch (error) {
        console.error('Error fetching leagues:', error);
        return [];
    }
}

/**
 * Initialize league tag selector for team modal
 * @param {string} context - 'create' or 'edit'
 * @param {Array} preSelectedLeagueIds - Array of league IDs to pre-select
 */
async function initializeTeamLeagueSelector(context = 'create', preSelectedLeagueIds = []) {
    const dropdownId = context === 'create' ? 'teamLeaguesDropdown' : 'editTeamLeaguesDropdown';
    const dropdown = document.getElementById(dropdownId);

    if (!dropdown) {
        console.warn(`${dropdownId} not found`);
        return;
    }

    // Show loading
    dropdown.disabled = true;
    dropdown.innerHTML = '<option value="">Loading leagues...</option>';

    try {
        // Load leagues
        const leagues = await loadAllLeagues();

        // Populate dropdown
        dropdown.innerHTML = '<option value="">+ Add a league</option>';

        if (leagues.length === 0) {
            dropdown.innerHTML += '<option value="" disabled>No leagues available</option>';
        } else {
            leagues.forEach(league => {
                const option = document.createElement('option');
                option.value = league.id;
                option.textContent = league.name;
                dropdown.appendChild(option);
            });
        }

        // Pre-select leagues if provided
        if (preSelectedLeagueIds && preSelectedLeagueIds.length > 0) {
            selectedLeaguesForTeam = preSelectedLeagueIds.map(id => {
                const league = leagues.find(l => l.id === id);
                return league ? { id: league.id, name: league.name, logo: league.logo } : null;
            }).filter(l => l !== null);
        } else {
            selectedLeaguesForTeam = [];
        }

        // Update display
        updateTeamLeagueTags(context);
        updateHiddenLeaguesInput(context);
        updateLeagueDropdownOptions(context);

        // Attach change listener
        attachTeamLeagueDropdownListener(dropdown, context);

    } catch (error) {
        console.error('Error initializing league selector:', error);
        dropdown.innerHTML = '<option value="">Error loading leagues</option>';
    } finally {
        // USE THE PROPER ENABLE FUNCTION
        enableDropdown(dropdown);
    }
}

/**
 * Enable a dropdown element (removes all disabled states)
 * @param {HTMLElement} dropdown - Dropdown to enable
 */
function enableDropdown(dropdown) {
    if (!dropdown) return;

    dropdown.removeAttribute('disabled');
    dropdown.disabled = false;
    dropdown.style.pointerEvents = 'auto';
    dropdown.style.opacity = '1';
    dropdown.style.cursor = 'pointer';
}

/**
 * Attach change listener to league dropdown
 */
function attachTeamLeagueDropdownListener(dropdown, context) {
    // Remove existing listener
    const clone = dropdown.cloneNode(true);
    dropdown.replaceWith(clone);

    // Get fresh reference
    const dropdownId = context === 'create' ? 'teamLeaguesDropdown' : 'editTeamLeaguesDropdown';
    const newDropdown = document.getElementById(dropdownId);

    if (!newDropdown) return;

    newDropdown.addEventListener('change', function() {
        const selectedId = parseInt(this.value);
        if (selectedId && !selectedLeaguesForTeam.find(l => l.id === selectedId)) {
            const league = leaguesCache.find(l => l.id === selectedId);
            if (league) {
                addTeamLeagueTag(league, context);
            }
        }
        this.value = ''; // Reset to placeholder
    });
}

/**
 * Add a league tag
 */
function addTeamLeagueTag(league, context = 'create') {
    if (selectedLeaguesForTeam.find(l => l.id === league.id)) return;

    selectedLeaguesForTeam.push({
        id: league.id,
        name: league.name,
        logo: league.logo
    });

    updateTeamLeagueTags(context);
    updateHiddenLeaguesInput(context);
    updateLeagueDropdownOptions(context);
}

/**
 * Remove a league tag
 */
function removeTeamLeagueTag(leagueId, context = 'create') {
    selectedLeaguesForTeam = selectedLeaguesForTeam.filter(l => l.id !== leagueId);
    updateTeamLeagueTags(context);
    updateHiddenLeaguesInput(context);
    updateLeagueDropdownOptions(context);
}

/**
 * Update visual display of league tags
 */
function updateTeamLeagueTags(context = 'create') {
    const containerId = context === 'create' ? 'selectedLeaguesContainer' : 'editSelectedLeaguesContainer';
    const container = document.getElementById(containerId);

    if (!container) return;

    container.innerHTML = '';

    if (selectedLeaguesForTeam.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.875rem; padding: 0.5rem;">No leagues selected</div>';
        return;
    }

    selectedLeaguesForTeam.forEach(league => {
        const tag = document.createElement('div');
        tag.className = 'game-tag'; // Reuse game tag styling

        const logoHTML = league.logo
            ? `<img src="${league.logo}" alt="${league.name}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">`
            : '<i class="fas fa-trophy game-tag-icon"></i>';

        tag.innerHTML = `
            ${logoHTML}
            <span>${league.name}</span>
            <button type="button"
                    class="game-tag-remove"
                    onclick="removeTeamLeagueTag(${league.id}, '${context}')"
                    title="Remove ${league.name}">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(tag);
    });
}

/**
 * Update dropdown to hide selected leagues
 */
function updateLeagueDropdownOptions(context = 'create') {
    const dropdownId = context === 'create' ? 'teamLeaguesDropdown' : 'editTeamLeaguesDropdown';
    const dropdown = document.getElementById(dropdownId);

    if (!dropdown) return;

    const options = Array.from(dropdown.options);

    options.forEach(option => {
        if (option.value === '') return; // Skip placeholder

        const optionId = parseInt(option.value);
        if (selectedLeaguesForTeam.find(l => l.id === optionId)) {
            option.style.display = 'none';
            option.disabled = true;
        } else {
            option.style.display = '';
            option.disabled = false;
        }
    });
}

/**
 * Update hidden input with selected league IDs
 */
function updateHiddenLeaguesInput(context = 'create') {
    const inputId = context === 'create' ? 'selectedLeaguesInput' : 'editSelectedLeaguesInput';
    const hiddenInput = document.getElementById(inputId);

    if (hiddenInput) {
        const leagueIds = selectedLeaguesForTeam.map(l => l.id);
        hiddenInput.value = JSON.stringify(leagueIds);
    }
}

/**
 * Clear all selected leagues
 */
function clearSelectedLeagues(context = 'create') {
    selectedLeaguesForTeam = [];
    updateTeamLeagueTags(context);
    updateHiddenLeaguesInput(context);
    updateLeagueDropdownOptions(context);
}

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

            window.currentTeamSeasonIsActive = team.season_is_active;
            window.currentTeamSeasonId = team.season_id;

            window.currentTeamCanManage = team.can_manage;

            const isActiveSeason = team.season_is_active === 1;
            const addVodBtn = document.querySelector('.btn[onclick="showAddVodModal()"]');
            if (addVodBtn) {
                // Only show for active seasons
                addVodBtn.style.display = (team.can_manage && isActiveSeason) ? 'inline-flex' : 'none';
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

            // Display team leagues**
            await displayTeamLeaguesInSubheader(teamId);

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

            //Applies a collapsed team details state
            const isCollapsed = getCollapsedTeamDetailsState();
            const subheadersContainer = document.getElementById('teamDetailSubheaders');
            const collapseBtn = document.getElementById('teamDetailCollapseBtn');
            const icon = collapseBtn?.querySelector('i');

            if (subheadersContainer && isCollapsed) {
                subheadersContainer.classList.add('collapsed');
                if (icon) {
                    icon.classList.remove('fa-chevron-up');
                    icon.classList.add('fa-chevron-down');
                }
            } else if (subheadersContainer) {
                subheadersContainer.classList.remove('collapsed');
                if (icon) {
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-up');
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

            const isDeveloper = window.userPermissions?.is_developer || false;
            const isAdmin = window.userPermissions?.is_admin || false;
            const isGM = window.userPermissions?.is_gm || false;
            const canManage = team.can_manage;

            // Add Player button - only show for active seasons
            const addPlayerBtn = document.getElementById('addPlayerBtn');
            if (addPlayerBtn) {
                const showAddPlayer = (isAdmin || isGM) && isActiveSeason;
                addPlayerBtn.style.display = showAddPlayer ? 'inline-flex' : 'none';
                if (showAddPlayer) {
                    addPlayerBtn.onclick = openAddTeamMembersModal;
                }
            }

            // Delete Team button - show for developers always, admins/GMs only for active seasons
            const deleteTeamBtn = document.getElementById('deleteTeamBtn');
            if (deleteTeamBtn) {
                const showDelete = isDeveloper || ((isAdmin || isGM) && isActiveSeason);
                deleteTeamBtn.style.display = showDelete ? 'inline-flex' : 'none';
            }

            // Store season active status globally for other functions
            window.currentTeamCanManage = canManage && isActiveSeason;

            // Schedule button - only for active seasons
            if (typeof initScheduleButton === 'function') {
                if (isActiveSeason) {
                    await initScheduleButton(teamId, team.game_id);
                } else {
                    // Hide schedule button for past seasons
                    const createScheduleBtn = document.getElementById('createScheduleBtn');
                    if (createScheduleBtn) {
                        createScheduleBtn.style.display = 'none';
                    }
                }
            }

            loadRosterTab(team.members || []);
        }
    } catch (error) {
        console.error('Error loading team details:', error);
    }
}

/**
 * Display leagues in team details
 */
async function displayTeamLeaguesInSubheader(teamId) {
    try {
        const response = await fetch(`/api/teams/${teamId}/leagues`);
        const data = await response.json();

        const leaguesElement = document.getElementById('teamDetailLeagues');

        if (!leaguesElement) {
            console.warn('teamDetailLeagues element not found');
            return;
        }

        if (data.success && data.leagues && data.leagues.length > 0) {
            // Build leagues HTML with logos and links
            const leaguesHTML = data.leagues.map(league => {
                const logoHTML = league.logo
                    ? `<img src="${league.logo}" alt="${league.name}" class="team-league-logo">`
                    : '<i class="fas fa-trophy team-league-icon"></i>';

                const content = `${logoHTML}<span class="team-league-name">${league.name}</span>`;

                // If there's a website URL, make it a link
                if (league.website_url) {
                    return `
                        <a href="${league.website_url}"
                           target="_blank"
                           rel="noopener noreferrer"
                           class="team-league-link"
                           title="Visit ${league.name} website">
                            ${content}
                            <i class="fas fa-external-link-alt team-league-external"></i>
                        </a>
                    `;
                } else {
                    return `<span class="team-league-item">${content}</span>`;
                }
            }).join('');

            leaguesElement.innerHTML = `League(s): ${leaguesHTML}`;
            leaguesElement.style.display = 'block';
        } else {
            leaguesElement.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading team leagues:', error);
        const leaguesElement = document.getElementById('teamDetailLeagues');
        if (leaguesElement) {
            leaguesElement.style.display = 'none';
        }
    }
}

/**
 * Storage key for collapsed team details
 */
const COLLAPSED_TEAM_DETAILS_KEY = 'teams_collapsed_details';

/**
 * Get collapsed team details state
 */
function getCollapsedTeamDetailsState() {
    const stored = sessionStorage.getItem(COLLAPSED_TEAM_DETAILS_KEY);
    return stored === 'true';
}

/**
 * Save collapsed team details state
 */
function saveCollapsedTeamDetailsState(isCollapsed) {
    sessionStorage.setItem(COLLAPSED_TEAM_DETAILS_KEY, isCollapsed.toString());
}

/**
 * Toggle team detail collapse
 */
function toggleTeamDetailCollapse() {
    const detailsContainer = document.getElementById('teamDetailSubheaders');
    const toggleBtn = document.getElementById('teamDetailCollapseBtn');
    const icon = toggleBtn?.querySelector('i');

    if (!detailsContainer || !toggleBtn || !icon) return;

    const isCollapsed = detailsContainer.classList.contains('collapsed');

    if (isCollapsed) {
        // Expand
        detailsContainer.classList.remove('collapsed');
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        saveCollapsedTeamDetailsState(false);
    } else {
        // Collapse
        detailsContainer.classList.add('collapsed');
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        saveCollapsedTeamDetailsState(true);
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

    const isDeveloper = window.userPermissions?.is_developer || false;
    const isAdmin = window.userPermissions?.is_admin || false;
    const isGM = window.userPermissions?.is_gm || false;
    const isActiveSeason = window.currentTeamSeasonIsActive === 1;

    // Only allow management if active season AND user has permissions
    const canManage = (isAdmin || isGM) && isActiveSeason;

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
        showDeleteErrorMessage('Please select at least one member');
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
            // Close modal
            closeAddTeamMembersModal();

            // Show success notification
            showDeleteSuccessMessage(data.message);

            // Refresh teams and reload current team
            window.invalidateTeamsCache();
            await window.loadTeams();

            setTimeout(() => {
                selectTeam(window.currentSelectedTeamId);
            }, 350);
        } else {
            showDeleteErrorMessage(data.message);
        }
    } catch (error) {
        console.error('Error:', error);
        showDeleteErrorMessage('Failed to add members');
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
 * Confirm and remove member from team using universal delete modal
 */
function confirmRemoveMemberNew(memberId, memberName) {
    // Open universal delete modal
    openDeleteConfirmModal({
        title: 'Remove Team Member?',
        itemName: memberName,
        message: `Are you sure you want to remove ${memberName} from this team?`,
        additionalInfo: `
            <div style="margin-top: 1rem; padding: 1rem; background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px;">
                <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
                    <i class="fas fa-info-circle" style="color: #ffc107;"></i>
                    This will remove ${memberName} from the team roster.
                </p>
            </div>
        `,
        buttonText: 'Remove Member',
        onConfirm: () => removeMemberNew(memberId, memberName),
        itemId: memberId
    });
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
            // Close the delete confirmation modal first
            closeDeleteConfirmModal();

            // Show success notification
            showDeleteSuccessMessage(`"${memberName}" removed successfully`);

            // Refresh teams and reload current team
            window.invalidateTeamsCache();
            await window.loadTeams();

            setTimeout(() => {
                selectTeam(window.currentSelectedTeamId);
            }, 350);
        } else {
            // Close modal and show error
            closeDeleteConfirmModal();
            showDeleteErrorMessage(data.message);
        }
    } catch (error) {
        console.error('Error removing member:', error);
        closeDeleteConfirmModal();
        showDeleteErrorMessage('Failed to remove member');
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

    const form = document.getElementById('editTeamForm');
    const submitBtn = form?.querySelector('button[type="submit"]');
    const submitBtnText = document.getElementById('updateTeamBtnText');
    const submitBtnSpinner = document.getElementById('updateTeamBtnSpinner');

    if (submitBtn) submitBtn.disabled = false;
    if (submitBtnText) submitBtnText.style.display = 'inline';
    if (submitBtnSpinner) submitBtnSpinner.style.display = 'none';

    formMessage.style.display = 'none';

    modalTitle.textContent = teamName;
    teamIdField.value = teamId;
    teamTitleInput.value = teamName;

    try {
        // Fetch current team leagues
        const leaguesResponse = await fetch(`/api/teams/${teamId}/leagues`);
        const leaguesData = await leaguesResponse.json();

        const currentLeagueIds = leaguesData.success && leaguesData.leagues ?
            leaguesData.leagues.map(l => l.id) : [];

        console.log('Current team leagues:', currentLeagueIds);

        // Fetch game details for available sizes
        const response = await fetch(`/api/teams/${teamId}/details`);
        const data = await response.json();

        if (data.success) {
            const team = data.team;
            const gameResponse = await fetch(`/api/game/${team.game_id}/details`);
            const gameData = await gameResponse.json();

            if (gameData.success) {
                populateTeamSizes(
                    gameData.game.team_sizes || availableSizes.split(',').map(s => s.trim()),
                    currentMaxSize,
                    sizeContainer
                );
            }
        }

        // Initialize league selector with pre-selected leagues**
        if (typeof initializeTeamLeagueSelector === 'function') {
            await initializeTeamLeagueSelector('edit', currentLeagueIds);

            // EXPLICITLY ENABLE DROPDOWN AFTER INITIALIZATION
            setTimeout(() => {
                const dropdown = document.getElementById('editTeamLeaguesDropdown');
                if (dropdown) {
                    enableDropdown(dropdown);
                }
            }, 50);
        }

    } catch (error) {
        console.error('Error loading team details for edit:', error);
        alert('Failed to load team information. Please try again.');
        return;
    }

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Close edit team modal
 */
function closeEditTeamModal() {
    const modal = document.getElementById('editTeamModal');
    const form = document.getElementById('editTeamForm');
    const submitBtn = form?.querySelector('button[type="submit"]');
    const submitBtnText = document.getElementById('updateTeamBtnText');
    const submitBtnSpinner = document.getElementById('updateTeamBtnSpinner');
    const formMessage = document.getElementById('editTeamFormMessage');

    // RESET BUTTON STATE
    if (submitBtn) {
        submitBtn.disabled = false;
    }
    if (submitBtnText) {
        submitBtnText.style.display = 'inline';
    }
    if (submitBtnSpinner) {
        submitBtnSpinner.style.display = 'none';
    }
    if (formMessage) {
        formMessage.style.display = 'none';
    }

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
            // Update team basic info (name and size)
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
                // Update team leagues
                const leaguesInput = document.getElementById('editSelectedLeaguesInput');
                if (leaguesInput) {
                    const leagueIds = JSON.parse(leaguesInput.value || '[]');

                    console.log('Updating team leagues:', leagueIds);

                    const leaguesResponse = await fetch(`/api/teams/${teamId}/leagues`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ league_ids: leagueIds })
                    });

                    const leaguesData = await leaguesResponse.json();

                    if (!leaguesResponse.ok || !leaguesData.success) {
                        console.warn('Team updated but league assignment had issues:', leaguesData.message);
                    }
                }

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
                }, 350);
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
 * Confirm and delete selected team with permission and time checks
 */
async function confirmDeleteSelectedTeam() {
    if (!window.currentSelectedTeamId) {
        alert('No team selected');
        return;
    }

    const teamId = window.currentSelectedTeamId;

    try {
        // Get deletion permission info
        const response = await fetch(`/api/teams/${teamId}/deletion-info`);
        const data = await response.json();

        if (!data.success) {
            alert(data.message || 'Failed to check deletion permissions');
            return;
        }

        // Check if user can delete
        if (!data.can_delete) {
            let message = '';

            if (data.restriction_level === 'expired') {
                message = `Cannot delete "${data.team_name}". This team was created ${data.days_since_creation} days ago. Only developers can delete teams older than 30 days.`;
            } else if (data.restriction_level === 'no_permission') {
                message = `You don't have permission to delete "${data.team_name}".`;
            } else {
                message = 'You cannot delete this team.';
            }

            alert(message);
            return;
        }

        const isDeveloper = window.userPermissions?.is_developer || false;

        // Build modal configuration
        let additionalInfo = '';

        if (!isDeveloper && data.restriction_level === 'time_limited') {
            // Show time remaining warning
            const timeRemaining = formatTimeRemaining(data.days_remaining, data.hours_remaining);
            additionalInfo = `
                <div style="margin-top: 1rem; padding: 1rem; background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <i class="fas fa-clock" style="color: #ffc107;"></i>
                        <strong style="color: #ffc107;">Time-Limited Deletion</strong>
                    </div>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
                        ${timeRemaining} remaining to delete this team.<br>
                        After that, only developers can delete it.
                    </p>
                </div>
            `;
        }

        additionalInfo += `
            <div style="margin-top: 1rem; padding: 1rem; background: rgba(255, 82, 82, 0.1); border: 1px solid rgba(255, 82, 82, 0.3); border-radius: 8px;">
                <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
                    <i class="fas fa-exclamation-triangle" style="color: #ff5252;"></i>
                    This will permanently delete:
                </p>
                <ul style="margin: 0.5rem 0 0 1.5rem; color: var(--text-secondary); font-size: 0.875rem;">
                    <li>All team member assignments</li>
                    <li>Team-specific scheduled events</li>
                    <li>League assignments</li>
                    <li>All team data</li>
                </ul>
                <p style="margin: 0.5rem 0 0 0; color: #ff5252; font-size: 0.875rem; font-weight: 600;">
                    This action cannot be undone.
                </p>
            </div>
        `;

        // Open universal delete modal
        openDeleteConfirmModal({
            title: 'Delete Team?',
            itemName: data.team_name,
            message: `Are you sure you want to delete ${data.team_name}?`,
            additionalInfo: additionalInfo,
            buttonText: 'Delete Team',
            onConfirm: executeTeamDeletion,
            itemId: teamId
        });

    } catch (error) {
        console.error('Error checking deletion permissions:', error);
        alert('Failed to check deletion permissions. Please try again.');
    }
}

/**
 * Execute the actual team deletion
 * Called by the universal delete modal
 */
async function executeTeamDeletion(teamId) {
    try {
        const response = await fetch('/delete-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_id: teamId })
        });

        const data = await response.json();

        if (data.success) {
            // Close the modal first
            closeDeleteConfirmModal();

            // Show success notification using universal system
            showDeleteSuccessMessage(data.message);

            // Invalidate cache and refresh
            invalidateTeamsCache();
            window.currentSelectedTeamId = null;

            document.getElementById('teamsWelcomeState').style.display = 'flex';
            document.getElementById('teamsDetailContent').style.display = 'none';

            // Reload after notification is visible
            setTimeout(() => {
                window.loadTeams();
            }, 1500);
        } else {
            // Close modal and show error
            closeDeleteConfirmModal();
            showDeleteErrorMessage(data.message || 'Failed to delete team');
        }
    } catch (error) {
        console.error('Error deleting team:', error);
        closeDeleteConfirmModal();
        showDeleteErrorMessage('An error occurred while deleting the team');
    }
}

/**
 * Format time remaining for display
 */
function formatTimeRemaining(days, hours) {
    if (days > 0) {
        if (days === 1) {
            return `${days} day, ${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        return `${days} days, ${hours} hour${hours !== 1 ? 's' : ''}`;
    } else {
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
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
window.toggleTeamDetailCollapse = toggleTeamDetailCollapse;

//Team League Exports
window.initializeTeamLeagueSelector = initializeTeamLeagueSelector;
window.addTeamLeagueTag = addTeamLeagueTag;
window.removeTeamLeagueTag = removeTeamLeagueTag;
window.clearSelectedLeagues = clearSelectedLeagues;
window.enableDropdown = enableDropdown;