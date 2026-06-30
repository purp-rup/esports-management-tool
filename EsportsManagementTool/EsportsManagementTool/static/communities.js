/**
 * ============================================================================
 * Handles community-specific functionality including:
 * - Community membership (join/leave)
 * - GM assignment and management
 * - Community pages
 * - User's communities display (profile tab)
 * ============================================================================
 */

// Currently selected game ID for GM assignment operations
let currentGameIdForGM = null;

// Initialize photo carousel elements
let carouselPhotos  = [];
let carouselIndex   = 0;
let carouselTimer   = null;
const CAROUSEL_INTERVAL = 5000;

// Initialize member popup
let memberListOpen = false;

/**
 * Initialize communities module
 * Sets up event listeners for profile tab
 */
function initializeCommunitiesModule() {
    console.log('Communities module initialized');

    // Load communities in profile tab
    const profileTab = document.querySelector('[data-tab="profile"]');
    if (profileTab) {
        profileTab.addEventListener('click', loadMyCommunities);
    }

    // Handle mobile dropdown tab selection for profile
    const tabDropdown = document.getElementById('tabDropdown');
    if (tabDropdown) {
        tabDropdown.addEventListener('change', function(e) {
            if (e.target.value === 'profile') {
                loadMyCommunities();
            }
        });
    }
}

// ============================================
// COMMUNITY MEMBERSHIP - JOIN/LEAVE
// ============================================

// Confirm joining a game community with confirmation modal
function confirmJoinGame(gameId, gameTitle) {
    const modal = createConfirmModal(
        'Join Community',
        gameTitle,
        [
            'You can be assigned to a team',
            'You can view this game\'s schedule',
            'You can view exclusive events'
        ],
        'You can always leave later if you change your mind.',
        'success',
        () => updateGameMembership(gameId, 'join')
    );
    document.body.appendChild(modal);
}

// Confirm leaving a game community
function confirmLeaveGame(gameId, gameTitle) {
    const modal = createConfirmModal(
        'Leave Community',
        gameTitle,
        [
            'You\'ll no longer be able to join a team',
            'You won\'t see this game\'s schedule',
            'You won\'t see this game\'s exclusive events'
        ],
        'You can always rejoin if you change your mind',
        'warning',
        () => updateGameMembership(gameId, 'leave')
    );
    document.body.appendChild(modal);
}

// Create a membership confirmation modal (joining or leaving)
function createConfirmModal(title, gameTitle, benefits, note, type, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.id = 'confirmJoinModal';

    const icon = type === 'success' ? 'fa-user-plus' : 'fa-sign-out-alt';
    const headerColor = type === 'success' ? '' : 'style="background-color: #ff9800;"';
    const btnClass = type === 'success' ? 'join-btn' : 'leave-btn';
    const btnIcon = type === 'success' ? 'fa-check' : 'fa-sign-out-alt';
    const btnText = type === 'success' ? 'Join' : 'Leave';

    // Build benefits list
    const benefitsList = benefits.map(b => `<li>${b}</li>`).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header" ${headerColor}>
                <h2><i class="fas ${icon}"></i> ${title}</h2>
            </div>
            <div class="modal-body">
                <p>Would you like to ${type === 'success' ? 'join' : 'leave'} the <strong>${gameTitle}</strong> community?</p>
                <ul style="margin: 1rem 0; padding-left: 1.5rem; color: var(--text-primary); line-height: 1.6;">
                    ${benefitsList}
                </ul>
                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 1rem;">
                    ${note}
                </p>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="closeConfirmModal()">Cancel</button>
                <button class="btn ${btnClass}" onclick="confirmMembershipModalAction()">
                    <i class="fas ${btnIcon}"></i> ${btnText}
                </button>
            </div>
        </div>
    `;

    // Store callback on modal element
    modal._confirmCallback = onConfirm;

    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeConfirmModal();
    });

    return modal;
}

// Execute the confirm action stored in the modal
function confirmMembershipModalAction() {
    const modal = document.getElementById('confirmJoinModal');
    if (modal && modal._confirmCallback) {
        modal._confirmCallback();
    }
}

// Close membership confirmation modal
function closeConfirmModal() {
    const modal = document.getElementById('confirmJoinModal');
    if (modal) {
        modal.remove();
    }
}

// Accepts joining and leaving community to change user membership
async function updateGameMembership(gameId, action) {
    closeConfirmModal();
    try {
        const res  = await fetch(`/api/game/${gameId}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            if (typeof closeCommunityModal === 'function') closeCommunityModal();
            if (typeof loadGames === 'function') loadGames();
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error(`Error ${action}ing community:`, error);
        alert(`Failed to ${action} community. Please try again.`);
    }
}

/**
 * Update join/leave action buttons based on membership status
 * If a user is currently in community, show leave action. If not a member, show join action.
 */
function updateActionButtons(game, gameId) {
    const joinBtn = document.getElementById('gameDetailsJoinBtn');
    const leaveBtn = document.getElementById('gameDetailsLeaveBtn');

    if (game.is_member) {
        // User is a member, show leave button
        if (joinBtn) joinBtn.style.display = 'none';
        if (leaveBtn) {
            leaveBtn.style.display = 'inline-flex';
            leaveBtn.onclick = () => confirmLeaveGame(gameId, game.title);
        }
    } else {
        // User is not a member, show join button
        if (leaveBtn) leaveBtn.style.display = 'none';
        if (joinBtn) {
            joinBtn.style.display = 'inline-flex';
            joinBtn.onclick = () => confirmJoinGame(gameId, game.title);
        }
    }
}

// ============================================
// COMMUNITY DIVISION FOLDER SYSTEM
// ============================================
const COLLAPSED_DIVISIONS_KEY = 'communities_collapsed_divisions';

// Get set of collapsed division names from sessionStorage
function getCollapsedDivisions() {
    const stored = sessionStorage.getItem(COLLAPSED_DIVISIONS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
}

// Toggle collapse state for a division
function toggleDivisionCollapse(division) {
    const collapsedDivisions = getCollapsedDivisions();

    if (collapsedDivisions.has(division)) {
        collapsedDivisions.delete(division);
    } else {
        collapsedDivisions.add(division);
    }

    saveCollapsedDivisions(collapsedDivisions);

    // Re-render communities with updated collapse state
    const currentGames = window.currentGamesData || [];
    if (currentGames.length > 0) {
        displayGamesWithDivisions(currentGames);
    }
}

// Save collapsed divisions to sessionStorage
function saveCollapsedDivisions(collapsedDivisions) {
    sessionStorage.setItem(COLLAPSED_DIVISIONS_KEY, JSON.stringify([...collapsedDivisions]));
}

/**
 * Display games grouped by division with collapsible folders
 */
function displayGamesWithDivisions(games) {
    const gridDiv = document.getElementById('rostersGrid');
    gridDiv.className = 'rosters-grid-divisions';
    gridDiv.innerHTML = '';

    // Store games data globally for re-rendering
    window.currentGamesData = games;

    // Check if current user is admin or developer for delete permissions
    const isAdmin = window.userPermissions?.is_admin || window.userPermissions.is_developer || false;

    // Group games by division
    const divisionGroups = {};
    games.forEach(game => {
        const division = game.Division || 'Other';

        if (!divisionGroups[division]) {
            divisionGroups[division] = [];
        }
        divisionGroups[division].push(game);
    });

    // Define division order
    const divisionOrder = ['Strategy', 'Shooter', 'Sports', 'Other'];

    // Sort divisions by defined order
    const sortedDivisions = Object.keys(divisionGroups).sort((a, b) => {
        const indexA = divisionOrder.indexOf(a);
        const indexB = divisionOrder.indexOf(b);

        // If both are in the order array, sort by index
        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }
        // If only one is in the order array, it comes first
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        // If neither is in the order array, sort alphabetically
        return a.localeCompare(b);
    });

    // Get collapsed state
    const collapsedDivisions = getCollapsedDivisions();

    // Render each division group
    sortedDivisions.forEach(division => {
        const gamesInDivision = divisionGroups[division];
        const isCollapsed = collapsedDivisions.has(division);

        if (isCollapsed) {
            // Render collapsed folder
            renderCollapsedDivision(division, gamesInDivision.length, gridDiv);
        } else {
            // Render expanded division with games
            renderExpandedDivision(division, gamesInDivision, isAdmin, gridDiv);
        }
    });
}

// Render a collapsed division folder
function renderCollapsedDivision(division, gameCount, container) {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'division-folder-collapsed';
    folderDiv.setAttribute('data-division', division);

    const gameWord = gameCount === 1 ? 'game' : 'games';

    // Get division icon
    const divisionIcon = getDivisionIcon(division);

    folderDiv.innerHTML = `
        <div class="division-folder-header">
            <button class="division-collapse-btn"
                    onclick="toggleDivisionCollapse('${division}')"
                    title="Expand ${division}">
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="division-folder-info">
                <div class="division-icon">${divisionIcon}</div>
                <div class="division-details">
                    <h3 class="division-name">${division}</h3>
                    <p class="division-count">${gameCount} ${gameWord}</p>
                </div>
            </div>
        </div>
    `;

    container.appendChild(folderDiv);
}

// Render an expanded division with all game cards separate
function renderExpandedDivision(division, games, isAdmin, container) {
    const divisionBox = document.createElement('div');
    divisionBox.className = 'division-box-expanded';
    divisionBox.setAttribute('data-division', division);

    // Get division icon
    const divisionIcon = getDivisionIcon(division);

    // Build division header
    const headerHTML = `
        <div class="division-box-header">
            <button class="division-collapse-btn"
                    onclick="toggleDivisionCollapse('${division}')"
                    title="Collapse ${division}">
                <i class="fas fa-chevron-up"></i>
            </button>
            <div class="division-icon">${divisionIcon}</div>
            <h3 class="division-name">${division}</h3>
        </div>
    `;

    // Build games grid
    const gamesGrid = document.createElement('div');
    gamesGrid.className = 'division-games-grid';

    games.forEach(game => {
        const card = createGameCard(game, isAdmin);
        gamesGrid.appendChild(card);
    });

    // Assemble division box
    divisionBox.innerHTML = headerHTML;
    divisionBox.appendChild(gamesGrid);

    container.appendChild(divisionBox);
}

// Get division icon
function getDivisionIcon(division) {
    const icons = {
        'Strategy': '<i class="fas fa-chess"></i>',
        'Shooter': '<i class="fas fa-crosshairs"></i>',
        'Sports': '<i class="fas fa-football-ball"></i>',
        'Other': '<i class="fas fa-star"></i>'
    };

    return icons[division] || '<i class="fas fa-gamepad"></i>';
}

// ============================================
// COMMUNITY PAGE
// ============================================

// Builds stats and leagues for a community
async function initCommunityStats(gameId) {
    const leaguesBox   = document.getElementById('communityLeaguesBox');
    const leaguesBadges = document.getElementById('communityLeaguesBadges');
    if (!leaguesBox || !leaguesBadges) return;

    try {
        const res  = await fetch(`/api/game/${gameId}/current-leagues`);
        const data = await res.json();

        if (!data.success || !data.leagues?.length) return;

        leaguesBadges.innerHTML = data.leagues.map(league => {
            const logoHtml = league.logo
                ? `<img src="${league.logo}" alt="${league.name}" class="game-league-badge-logo">`
                : '<i class="fas fa-trophy game-league-badge-icon"></i>';

            return league.website_url
                ? `<a href="${league.website_url}" target="_blank" rel="noopener noreferrer"
                      class="game-league-badge" title="Visit ${league.name} website">
                       ${logoHtml}
                       <span class="game-league-badge-name">${league.name}</span>
                       <i class="fas fa-external-link-alt game-league-badge-external"></i>
                   </a>`
                : `<span class="game-league-badge">
                       ${logoHtml}
                       <span class="game-league-badge-name">${league.name}</span>
                   </span>`;
        }).join('');

        leaguesBox.style.display = 'block';
        leaguesBox.closest('.community-card-stat-row')?.classList.add('has-leagues');
    } catch (e) {
        console.error('Error loading community leagues:', e);
    }
}

// Fetch photos for this community and boot the carousel
async function initCarousel() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;

    const gameId = document.getElementById('communityGameId')?.value;
    if (!gameId) return;

    try {
        const res  = await fetch(`/api/game/${gameId}/photos`);
        const data = await res.json();
        if (!data.success) return;
        carouselPhotos = data.photos;
        renderCarousel();
    } catch (e) {
        console.error('Failed to load carousel photos:', e);
    }
}

// Rebuild the carousel display from carouselPhotos
function renderCarousel() {
    const track   = document.getElementById('carouselTrack');
    const counter = document.getElementById('carouselCounter');
    const empty   = document.getElementById('carouselEmpty');
    const arrows  = document.getElementById('carouselArrows');
    const delBtn  = document.getElementById('carouselDeleteBtn');

    if (!track) return;

    stopCarouselTimer();

    if (carouselPhotos.length === 0) {
        track.innerHTML = '';
        if (empty)   empty.style.display   = 'flex';
        if (arrows)  arrows.style.display  = 'none';
        if (counter) counter.style.display = 'none';
        if (delBtn)  delBtn.style.display  = 'none';
        return;
    }

    if (empty)  empty.style.display  = 'none';
    if (arrows) arrows.style.display = 'flex';

    carouselIndex = Math.min(carouselIndex, carouselPhotos.length - 1);

    track.innerHTML = carouselPhotos.map((p, i) => `
        <div class="carousel-slide ${i === carouselIndex ? 'active' : ''}" data-index="${i}">
            <img src="${p.photo_url}" alt="Community photo ${i + 1}">
        </div>
    `).join('');

    if (counter) {
        counter.style.display = 'block';
        counter.textContent   = `${carouselIndex + 1} / ${carouselPhotos.length}`;
    }

    if (delBtn) delBtn.style.display = 'flex';

    if (carouselPhotos.length > 1) startCarouselTimer();
}

// Change photo carousel slides, either on a timer or via clicking the arrows
function goToSlide(index) {
    const slides = document.querySelectorAll('.carousel-slide');
    if (!slides.length) return;

    slides[carouselIndex]?.classList.remove('active');
    carouselIndex = (index + carouselPhotos.length) % carouselPhotos.length;
    slides[carouselIndex]?.classList.add('active');

    const counter = document.getElementById('carouselCounter');
    if (counter) counter.textContent = `${carouselIndex + 1} / ${carouselPhotos.length}`;
}

function carouselNext() { resetCarouselTimer(); goToSlide(carouselIndex + 1); }
function carouselPrev() { resetCarouselTimer(); goToSlide(carouselIndex - 1); }

function startCarouselTimer() {
    carouselTimer = setInterval(() => goToSlide(carouselIndex + 1), CAROUSEL_INTERVAL);
}
function stopCarouselTimer() {
    if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null; }
}
function resetCarouselTimer() {
    stopCarouselTimer();
    if (carouselPhotos.length > 1) startCarouselTimer();
}

/**
 * Open the photo manager popup anchored to the carousel wrapper.
 * Shows all photos in a horizontal strip, each with an × delete button.
 */
function openPhotoManager() {
    closePhotoManager(); // Remove any existing instance

    if (carouselPhotos.length === 0) return;

    const wrapper = document.querySelector('.carousel-wrapper');
    if (!wrapper) return;

    const popup = document.createElement('div');
    popup.id = 'photoManagerPopup';
    popup.className = 'photo-manager-popup';

    popup.innerHTML = `
        <div class="photo-manager-header">
            <span>Manage Photos</span>
            <button class="photo-manager-close" onclick="closePhotoManager()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="photo-manager-strip">
            ${carouselPhotos.map(p => `
                <div class="photo-manager-thumb" data-photo-id="${p.photo_id}">
                    <img src="${p.photo_url}" alt="Photo">
                    <button class="photo-manager-delete-btn"
                            onclick="confirmDeletePhoto(${p.photo_id})"
                            title="Delete this photo">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('')}
        </div>
    `;

    // Anchor popup to bottom of carousel wrapper, capped to its width
    wrapper.appendChild(popup);

    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', outsidePhotoManagerClick);
    }, 0);
}

function closePhotoManager() {
    document.getElementById('photoManagerPopup')?.remove();
    document.removeEventListener('click', outsidePhotoManagerClick);
}

function outsidePhotoManagerClick(e) {
    const popup       = document.getElementById('photoManagerPopup');
    const delBtn      = document.getElementById('carouselDeleteBtn');
    const deleteModal = document.getElementById('deleteConfirmModal');
    if (
        popup &&
        !popup.contains(e.target) &&
        e.target !== delBtn &&
        !delBtn?.contains(e.target) &&
        !deleteModal?.contains(e.target)
    ) {
        closePhotoManager();
    }
}

// Show confirmation then delete the photo.
function confirmDeletePhoto(photoId) {
    const photo = carouselPhotos.find(p => p.photo_id === photoId);
    if (!photo) return;

    openDeleteConfirmModal({
        title: 'Delete Photo?',
        message: 'Are you sure you want to permanently delete this photo? This cannot be undone.',
        buttonText: 'Delete Photo',
        itemId: photoId,
        onConfirm: async (id) => {
            await executePhotoDelete(id);
        }
    });
}

async function executePhotoDelete(photoId) {
    const gameId = document.getElementById('communityGameId')?.value;

    try {
        const res  = await fetch(`/api/game/${gameId}/photos/${photoId}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
            const idx = carouselPhotos.findIndex(p => p.photo_id === photoId);
            if (idx !== -1) carouselPhotos.splice(idx, 1);
            if (carouselIndex >= carouselPhotos.length) {
                carouselIndex = Math.max(0, carouselPhotos.length - 1);
            }
            closeDeleteConfirmModal();
            renderCarousel();
            showDeleteSuccessMessage('Photo deleted successfully.');
        } else {
            closeDeleteConfirmModal();
            showDeleteErrorMessage('Delete failed: ' + data.message);
        }
    } catch (e) {
        closeDeleteConfirmModal();
        showDeleteErrorMessage('Delete failed. Please try again.');
    }
}

// ============================================
// COMMUNITY PAGE — MEMBER LIST POPUP
// ===========================================
async function toggleMemberListPopup() {
    const popup = document.getElementById('memberListPopup');
    if (!popup) return;

    if (memberListOpen) {
        closeMemberListPopup();
        return;
    }

    memberListOpen = true;
    popup.style.display = 'block';

    const btn  = document.getElementById('memberListBtn');
    const card = btn.closest('.community-description-card');
    const btnRect  = btn.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    popup.style.top  = (btnRect.bottom - cardRect.top + 8) + 'px';
    popup.style.left = (btnRect.left  - cardRect.left) + 'px';

    const gameId = document.getElementById('communityGameId')?.value;
    const grid   = document.getElementById('memberListGrid');
    const empty  = document.getElementById('memberListEmpty');
    const search = document.getElementById('memberListSearch');

    grid.innerHTML  = '<div class="member-list-loading"><i class="fas fa-spinner fa-spin"></i></div>';
    empty.style.display = 'none';
    if (search) { search.value = ''; search.style.display = 'block'; }

    try {
        const res  = await fetch(`/api/game/${gameId}/details`);
        const data = await res.json();

        grid.innerHTML = '';

        if (data.success && data.game.members?.length) {
            const currentUsername = document.getElementById('currentUsername')?.value;
            data.game.members.forEach(member => {
                const item = createMemberPopupItem(member, data.game.assigned_gm_id, currentUsername);
                grid.appendChild(item);
            });
        } else {
            empty.style.display = 'block';
            if (search) search.style.display = 'none';
        }
    } catch (e) {
        grid.innerHTML = '<div class="member-list-loading">Failed to load members.</div>';
        console.error('Error loading member list:', e);
    }

    setTimeout(() => document.addEventListener('click', outsideMemberListClick), 0);
}

function closeMemberListPopup() {
    const popup = document.getElementById('memberListPopup');
    if (popup) popup.style.display = 'none';
    memberListOpen = false;
    document.removeEventListener('click', outsideMemberListClick);
}

function outsideMemberListClick(e) {
    const popup = document.getElementById('memberListPopup');
    const btn   = document.getElementById('memberListBtn');
    if (popup && !popup.contains(e.target) && !btn?.contains(e.target)) {
        closeMemberListPopup();
    }
}

// Builds a single user profile element in the member list popup
function createMemberPopupItem(member, gmId, currentUsername) {
    const item = document.createElement('div');
    item.className = 'member-popup-item';
    item.setAttribute('data-username', member.username.toLowerCase());
    item.setAttribute('data-name', member.name.toLowerCase());

    if (member.id === gmId)                                    item.classList.add('member-popup-item--gm');
    if (member.username.toLowerCase() === currentUsername?.toLowerCase()) item.classList.add('member-popup-item--self');

    const avatarHtml = member.profile_picture
        ? `<img src="${member.profile_picture}" alt="${member.username}" class="member-avatar">`
        : `<div class="member-avatar-initials">${member.name.split(' ').map(n => n[0]).join('')}</div>`;

    item.innerHTML = `
        ${avatarHtml}
        <span class="member-popup-username">@${member.username}</span>
    `;
    return item;
}

// Filter members in popup
const filterMemberListPopup = () =>
    filterListItems('memberListSearch', '#memberListGrid .member-popup-item', ['username', 'name'], 'flex');

/**
 * Load next scheduled event for game community
 * Grabs the closest future event that is visible to communities and has the game's label
 */
async function loadNextCommunityEvent(gameId) {
    const container = document.getElementById('gameNextScheduledEventContainer');

    if (!container) {
        console.error('gameNextScheduledEventContainer not found');
        return;
    }

    // Show loading state
    container.innerHTML = `
        <div style="text-align: center; padding: 1rem; color: var(--text-secondary);">
            <i class="fas fa-spinner fa-spin"></i> Loading...
        </div>
    `;

    try {
        const response = await fetch(`/api/games/${gameId}/next-scheduled-event`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success && data.event) {
            const event = data.event;

            // Add a badge to show if it's from a schedule or a regular event
            const sourceBadge = event.source === 'scheduled'
                ? '<span class="event-source-badge scheduled">Recurring</span>'
                : '<span class="event-source-badge regular">One-time</span>';

            // Format event card
            container.innerHTML = `
                <div class="game-next-event-card" onclick="openEventModal(${event.id})">
                    <div class="game-next-event-header">
                        <i class="fas fa-calendar-plus"></i>
                        <h4>Next Community Event</h4>
                        ${sourceBadge}
                    </div>
                    <div class="game-next-event-content">
                        <div class="game-next-event-title">${event.name}</div>
                        <div class="game-next-event-date">
                            <i class="fas fa-calendar-day"></i> ${event.date}
                        </div>
                        <div class="game-next-event-time">
                            ${event.is_all_day || !event.start_time
                                ? '<i class="fas fa-calendar"></i> All Day'
                                : `<i class="fas fa-clock"></i> ${event.start_time}`
                            }
                        </div>
                        <span class="game-next-event-type ${event.event_type.toLowerCase()}">
                            ${event.event_type}
                        </span>
                    </div>
                </div>
            `;
        } else {
            // No scheduled events
            container.innerHTML = `
                <div class="game-next-event-empty">
                    <i class="fas fa-calendar-times"></i>
                    <p>No upcoming community events</p>
                </div>
            `;
        }
    } catch (error) {
        // Handle errors
        console.error('Error loading game next scheduled event:', error);
        container.innerHTML = `
            <div class="game-next-event-empty">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load scheduled events</p>
            </div>
        `;
    }
}

// ============================================
// USER'S COMMUNITIES (PROFILE TAB)
// ============================================

// Load and displays all communities a user has joined in profile tab
async function loadMyCommunities() {
    const loading = document.getElementById('myCommunitiesLoading');
    const grid = document.getElementById('myCommunitiesGrid');
    const empty = document.getElementById('myCommunitiesEmpty');

    // Show loading state
    loading.style.display = 'block';
    grid.style.display = 'none';
    empty.style.display = 'none';

    try {
        // Fetch user's communities from API
        const response = await fetch('/api/user/communities');
        const data = await response.json();

        if (data.success && data.communities.length > 0) {
            // Display communities in grid
            grid.innerHTML = '';

            data.communities.forEach(community => {
                const card = createCommunityCard(community);
                grid.appendChild(card);
            });

            loading.style.display = 'none';
            grid.style.display = 'grid';
        } else {
            // No communities, show empty state
            loading.style.display = 'none';
            empty.style.display = 'block';
        }
    } catch (error) {
        // Handle errors
        console.error('Error loading communities:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
    }
}

// Build a community card for the user's profile tab
function createCommunityCard(community) {
    const card = document.createElement('div');
    card.className = 'community-card';
    card.onclick = () => {
        // Navigate to community page or open modal
        window.location.href = `/community/${community.id}`;
    };

    // Community icon
    if (community.image_url) {
        card.innerHTML = `
            <div class="community-card-icon">
                <img src="${community.image_url}" alt="${community.title}">
            </div>
        `;
    } else {
        card.innerHTML = `
            <div class="community-card-icon" style="background: var(--stockton-blue); display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-gamepad" style="font-size: 2rem; color: white;"></i>
            </div>
        `;
    }

    return card;
}

// ==================================
// HELPERS
// ==================================
function initFileInputCropper(inputId, cropperContext) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('change', function () {
        if (this.files && this.files[0]) {
            openImageCropper(this.files[0], cropperContext);
            this.value = '';
        }
    });
}

// ===========================================
// CONTENT LOADING
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
    const gameId = document.getElementById('communityGameId')?.value;

    // Dashboard communities tab
    initializeCommunitiesModule();

    // Community page
    initCarousel();
    initFileInputCropper('bannerFileInput', 'banner');
    initFileInputCropper('photoFileInput', 'carousel');

    if (gameId) {
        loadNextCommunityEvent(gameId);
        initCommunityStats(gameId);
    }
});

// ============================================
// EXPORT FUNCTIONS
// ============================================

// Folder system
window.displayGamesWithDivisions = displayGamesWithDivisions;

// Photo Carousel
window.carouselNext        = carouselNext;
window.carouselPrev        = carouselPrev;
window.openPhotoManager    = openPhotoManager;
window.closePhotoManager   = closePhotoManager;

// Member list popup
window.toggleMemberListPopup = toggleMemberListPopup;
window.filterMemberListPopup = filterMemberListPopup;