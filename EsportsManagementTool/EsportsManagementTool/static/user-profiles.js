/* =========================================
   USER PROFILE POPUP LOGIC
   - functionality for Community page profile popups
   - functionality for Teams tab Roster section panel
   - conditional logic for showing different profile sections
   ========================================= */

// ============================================
// COMMUNITY PAGE — USER PROFILE POPUP
// ===========================================

// Initialization
let userProfileOpen = false;

// Opens or closes the user profile popup
function toggleUserProfilePopup(e, member) {
    e.stopPropagation();
    const popup = document.getElementById('userProfilePopup');
    if (!popup) return;

    if (userProfileOpen && popup.dataset.username === member.username) {
        closeUserProfilePopup();
        return;
    }

    userProfileOpen = true;
    popup.dataset.username = member.username;
    popup.style.display = 'block';

    positionUserProfilePopup(e.currentTarget);

    // Foundation only — profile content is built out in a later step
    popup.innerHTML = buildUserProfileHeader(member);

    setTimeout(() => document.addEventListener('click', outsideUserProfileClick), 0);
}

// Constructs the header for the user profile.
function buildUserProfileHeader(member, options = {}) {
    const { showCaptainControl = false, teamId = null } = options;
    const firstName = member.name.split(' ')[0];

    const avatarHtml = member.profile_picture
        ? `<img src="${member.profile_picture}" alt="${member.username}" class="profile-avatar-img">`
        : `<div class="profile-avatar-initials-lg">${member.name.split(' ').map(n => n[0]).join('')}</div>`;

    const discordHtml = member.discord_username
        ? `<div class="profile-discord-section">
               <div class="profile-discord-icon-box"><i class="fab fa-discord"></i></div>
               <span class="profile-discord-handle">${member.discord_username}</span>
           </div>`
        : '';

    const communitiesHtml = buildCommunitiesSection(member, firstName);
    const rolesHtml = buildRolesSection(member);
    const teamsHtml = buildTeamsSection(member, firstName);
    const captainHtml = showCaptainControl ? buildCaptainControl(member, teamId) : '';

    return `
        <div class="profile-header">
            <div class="profile-banner"></div>
            ${captainHtml}
            <div class="profile-avatar-wrap">
                ${avatarHtml}
            </div>
            <span class="profile-first-name">${firstName}</span>
            <span class="profile-username">@${member.username}</span>
        </div>
        <div class="profile-body">
            ${discordHtml}
            ${communitiesHtml}
            ${rolesHtml}
            ${teamsHtml}
        </div>
    `;
}

// Constructs the assign captain button based on permissions
function buildCaptainControl(member, teamId) {
    const isCaptain = !!member.is_captain;
    const promptText = isCaptain
        ? `Click again to remove ${member.name.split(' ')[0]} as team captain.`
        : `Click again to make ${member.name.split(' ')[0]} the team captain.`;

    return `
        <button class="profile-captain-btn ${isCaptain ? 'profile-captain-btn--active' : ''}"
                id="captainBtn-${member.id}"
                title="${isCaptain ? 'Team Captain' : 'Assign as Captain'}"
                onclick="handleCaptainButtonClick(event, ${member.id}, '${teamId}', ${isCaptain})">
            <i class="fas fa-star"></i>
        </button>
        <div class="captain-confirm-popup" id="captainConfirmPopup-${member.id}" style="display:none;">
            <p style="margin:0;">${promptText}</p>
        </div>
    `;
}

// Constructs the user profile community section with logic surrounding which communities are shown
function buildCommunitiesSection(member, firstName) {
    const communities = member.communities || [];
    if (communities.length === 0) return '';

    const badges = communities.map(c => {
        const inner = c.image_url
            ? `<img src="${c.image_url}" alt="${c.title}">`
            : `<i class="fas fa-image"></i>`;
        return `<a href="/community/${c.id}" class="profile-community-badge" title="${c.title}">${inner}</a>`;
    }).join('');

    const moreHtml = member.communities_remaining > 0
        ? `<div class="profile-community-more">+${member.communities_remaining}</div>`
        : '';

    return `
        <div class="profile-communities-section">
            <div class="profile-communities-label">${firstName}'s Communities</div>
            <div class="profile-communities-badges">${badges}${moreHtml}</div>
        </div>
    `;
}

// Constructs the roles section on the community page profile popup
function buildRolesSection(member) {
    const roles = member.roles || [];
    const isMemberOnly = roles.length === 0 || (roles.length === 1 && roles[0] === 'Member');
    if (isMemberOnly) return '';

    const contextGameId = Number(document.getElementById('communityGameId')?.value);

    const badgesHtml = window.buildUniversalRoleBadges({
        userId: member.id,
        roles: roles,
        contextGameId: contextGameId || null
    });

    return `
        <div class="profile-roles-section">
            <div class="profile-roles-badges">${badgesHtml}</div>
        </div>
    `;
}

// Constructs the teams section of the user profile
function buildTeamsSection(member, firstName) {
    const teams = member.teams || [];
    if (teams.length === 0) return '';

    const badges = teams.map(t => {
        const icon = t.game_icon_url
            ? `<img src="${t.game_icon_url}" alt="${t.name}">`
            : `<div class="profile-team-icon-fallback"><i class="fas fa-image"></i></div>`;
        return `
            <div class="profile-team-badge" title="${t.name}">
                ${icon}
                <span class="profile-team-name">${t.name}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="profile-teams-section">
            <div class="profile-teams-label">${firstName} plays for</div>
            <div class="profile-team-badges">${badges}</div>
        </div>
    `;
}

//Sets the position of the user profile popup based on the position of the member list popup.
function positionUserProfilePopup(pillEl) {
    const popup      = document.getElementById('userProfilePopup');
    const memberList = document.getElementById('memberListPopup');
    const card       = pillEl.closest('.community-description-card');
    if (!popup || !memberList || !card) return;

    const pillRect = pillEl.getBoundingClientRect();
    const listRect = memberList.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    const gap = 8;
    const popupWidth = popup.offsetWidth || 260;

    popup.style.top = (pillRect.top - cardRect.top) + 'px';

    let left = listRect.right - cardRect.left + gap;
    const wouldOverflow = (cardRect.left + left + popupWidth) > window.innerWidth;

    if (wouldOverflow) {
        left = listRect.left - cardRect.left - popupWidth - gap;
    }

    popup.style.left = left + 'px';
}

// Action of closing the user profile popup
function closeUserProfilePopup() {
    const popup = document.getElementById('userProfilePopup');
    if (popup) {
        popup.style.display = 'none';
        delete popup.dataset.username;
    }
    userProfileOpen = false;
    document.removeEventListener('click', outsideUserProfileClick);
}

// Ensures the user profile popup closes when clicking outside the box.
function outsideUserProfileClick(e) {
    const popup = document.getElementById('userProfilePopup');
    if (popup && !popup.contains(e.target) && !e.target.closest('.member-popup-item')) {
        closeUserProfilePopup();
    }
}

/* =================================
   GLOBAL EXPORTS
   ================================= */
window.toggleUserProfilePopup = toggleUserProfilePopup;