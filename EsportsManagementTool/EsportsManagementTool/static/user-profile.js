/**
 * User Profile Card System
 * Shows Discord-style profile card when clicking on users
 */

let currentProfileCard = null;

async function showUserProfileCard(userId, triggerElement) {
    const card = document.getElementById('userProfileCard');

    //Hide if clicking on the same user
    if (currentProfileCard === uderId && card.style.display === 'block') {
        hideUserProfileCard();
        return;
    }

    currentProfileCard = userId;

    try {
        const response = await fetch(`/api/users/${userId}/profile`);
        const data = await response.json();

        if (data.success) {
            populateProfileCard(data.user);
            positionProfileCard(card, triggerElement);
            card.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

function populateProfileCard(user) {
    const avatar = document.getElementById('profileAvatar');
    avatar.src = user.profile_picture
        ? `/static/uploads/avatars/${user.profile_picture}`
        : 'static/default-avatar.png';

    //Name and username
    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profileUsername').textContent = `@${user.username}`;

    //Badges
    const badgesContainer = document.getElementById('profileBadges');
    badgesContainer.innerHTML = user.badges.map(badge => `<span class="role-badge ${badge.toLowerCase()}">${badge}</span>`).join('');

    //Communities (games)
    const communitiesContainer = document.getElementById('profileCommunities');
    communitiesContainer.innerHTML = user.communities.map(game => `
        <div class="profile-community-icon" title="${game.title}">
            ${game.icon_url ? `<img src='${game.icon_url}" alt="${game.title}">` : `<i class="fas fa-gamepad"></i>`}
        </div>`).join('');

    //Teams
    const teamsContainer = document.getElementById('profileTeams');
    teamsContainer.innerHTML = user.teams.map(team => `
        <div class="profile-team-badge">
            <div class="profile-team-icon">
                ${team.game_icon ? `<img src="${team.game_icon}" alt="${team.game_title}">` : `<i class="fas fa-shield-alt"></i>`}
            </div>
            <div class="profile-team-info">
                <p class="profile-team-name">${team.name}</p>
                <p class="profile-team-game">${team.game_title}</p>
            </div>
        </div>`).join('');
}

function positionProfileCard(card, triggerElement) {
    const rect = triggerElement.getBoundingClientRect();
    const cardWidth = 340;
    const cardHeight = 500;

    let left = rect.right + 10;
    let top = rect.top;

    if(left + cardWidth > window.innerWidth) {
        left = rect.left - cardWidth - 10;
    }

    if (top + cardHeight > window.innerHeight) {
        top = window.innerHeight - cardHeight - 10;
    }

    top = Math.max(10, top);
    left = Math.max(10, left);

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
}

function hideUserProfileCard() {
    const card = document.getElementById('userProfileCard');
    card.style.display = 'none';
    currentProfileCard = null;
}

document.addEventListener('click', function(e) {
    const card = document.getElementById('userProfileCard');
    const isClickInsideCard = card.contains(e.target);
    const isClickOnTrigger = e.target.closest('[data-user-id]');

    if (!isClickInsideCard && !isClickOnTrigger && card.style.display === 'block') {
        hideUserProfileCard();
    }
});

window.showUserProfileCard = showUserProfileCard;
window.hideUserProfileCard = hideUserProfileCard;