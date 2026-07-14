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

// Forum state
let forumMessages        = [];
let forumHasMoreOlder    = false;
let forumIsLoadingOlder  = false;
const FORUM_GROUP_GAP_MS = 5 * 60 * 1000; // messages within 5 min of the same user group together

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

    initCommunityInfoTooltip();
}

// ============================================
// COMMUNITY INFO TOOLTIP (header "i" icon)
// Hover on desktop; tap-to-toggle on touch/mobile.
// ============================================
function initCommunityInfoTooltip() {
    const wrapper = document.getElementById('communityInfoIconWrapper');
    if (!wrapper) return;

    // Tap toggles the tooltip open/closed. Harmless on desktop too —
    // hover still works there via CSS, this just adds a click fallback.
    wrapper.addEventListener('click', function(e) {
        e.stopPropagation();
        wrapper.classList.toggle('tooltip-open');
    });

    // Tapping/clicking anywhere else closes it
    document.addEventListener('click', function(e) {
        if (wrapper.classList.contains('tooltip-open') && !wrapper.contains(e.target)) {
            wrapper.classList.remove('tooltip-open');
        }
    });

    // Also close on scroll/resize so it doesn't get stranded on mobile
    window.addEventListener('scroll', function() {
        wrapper.classList.remove('tooltip-open');
    }, { passive: true });
}

// ============================================
// COMMUNITY MEMBERSHIP - JOIN/LEAVE
// ============================================

// Join a game community directly (no confirmation modal — see the
// info icon next to "Game Communities" for what joining/leaving means)
function confirmJoinGame(gameId, gameTitle) {
    updateGameMembership(gameId, 'join');
}

// Leave a game community directly (no confirmation modal)
function confirmLeaveGame(gameId, gameTitle) {
    updateGameMembership(gameId, 'leave');
}

// Accepts joining and leaving community to change user membership
async function updateGameMembership(gameId, action) {
    try {
        const res  = await fetch(`/api/game/${gameId}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showDeleteSuccessMessage === 'function') {
                showDeleteSuccessMessage(data.message);
            } else {
                alert(data.message);
            }
            if (typeof closeCommunityModal === 'function') closeCommunityModal();
            if (typeof loadGames === 'function') loadGames();
        } else {
            if (typeof showDeleteErrorMessage === 'function') {
                showDeleteErrorMessage(data.message || `Failed to ${action} community`);
            } else {
                alert(`Error: ${data.message}`);
            }
        }
    } catch (error) {
        console.error(`Error ${action}ing community:`, error);
        if (typeof showDeleteErrorMessage === 'function') {
            showDeleteErrorMessage(`Failed to ${action} community. Please try again.`);
        } else {
            alert(`Failed to ${action} community. Please try again.`);
        }
    }
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

// ============================================
// COMMUNITY FORUM
// ============================================

// Awaits message send and allows multiline messages
async function initForum() {
    const gameId = document.getElementById('communityGameId')?.value;
    const body   = document.getElementById('forumBody');
    if (!gameId || !body) return;

    await loadForumMessages(gameId);

    body.addEventListener('scroll', () => {
        if (body.scrollTop === 0 && forumHasMoreOlder && !forumIsLoadingOlder) {
            loadOlderForumMessages(gameId);
        }
    });

    const input = document.getElementById('forumMessageInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendForumMessage();
            }
        });

        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });
    }
}

// Initial messages upon page load
async function loadForumMessages(gameId) {
    const loading = document.getElementById('forumLoading');
    const empty = document.getElementById('forumEmpty');
    if (loading) loading.style.display = 'flex';

    try {
        const res = await fetch(`/api/game/${gameId}/messages`);
        const data = await res.json();
        if (loading) loading.style.display = 'none';
        if (!data.success) return;

        forumMessages = data.messages;
        forumHasMoreOlder = data.has_more;

        renderForumMessages();
        if (forumMessages.length === 0 && empty) empty.style.display = 'flex';
        scrollForumToBottom();
    } catch (e) {
        if (loading) loading.style.display = 'none';
        console.error('Failed to load forum messages:', e);
    }
}

// Messages if user scrolls up
async function loadOlderForumMessages(gameId) {
    if (!forumMessages.length) return;
    forumIsLoadingOlder = true;

    const loadOlder = document.getElementById('forumLoadOlder');
    const body = document.getElementById('forumBody');
    if (loadOlder) loadOlder.style.display = 'flex';

    const prevScrollHeight = body.scrollHeight;

    try {
        const oldestId = forumMessages[0].message_id;
        const res = await fetch(`/api/game/${gameId}/messages?before=${oldestId}`);
        const data = await res.json();

        if (data.success && data.messages.length) {
            forumMessages = [...data.messages, ...forumMessages];
            forumHasMoreOlder = data.has_more;
            renderForumMessages();

            body.scrollTop = body.scrollHeight - prevScrollHeight;
        } else {
            forumHasMoreOlder = false;
        }
    } catch (e) {
        console.error('Failed to load older forum messages:', e);
    } finally {
        if (loadOlder) loadOlder.style.display = 'none';
        forumIsLoadingOlder = false;
    }
}

function renderForumMessages() {
    const container = document.getElementById('forumMessagesList');
    if (!container) return;

    const currentUsername = document.getElementById('currentUsername')?.value?.toLowerCase();
    const canModerate = document.getElementById('canModerateForum')?.value === 'true';

    container.innerHTML = forumMessages.map((msg, i) => {
        const prev = forumMessages[i - 1];
        const isNewBlock = !prev
            || prev.user_id !== msg.user_id
            || (new Date(msg.created_at) - new Date(prev.created_at)) > FORUM_GROUP_GAP_MS;

        const isOwnMessage = msg.username?.toLowerCase() === currentUsername;
        const canDelete = isOwnMessage || canModerate;

        return buildForumMessageHtml(msg, isNewBlock, canDelete);
    }).join('');
}

function buildForumMessageHtml(msg, isNewBlock, canDelete) {
    const time = formatForumTimestamp(msg.created_at);
    const deleteBtn = canDelete
        ? `<button class="forum-message-delete" onclick="confirmDeleteForumMessage(${msg.message_id})" title="Delete message">
               <i class="fas fa-trash"></i>
           </button>`
        : '';

    if (isNewBlock) {
        const avatarHtml = msg.profile_picture
            ? `<img src="${msg.profile_picture}" alt="${escapeHtml(msg.username)}" class="forum-message-avatar">`
            : `<div class="forum-message-avatar-initials">${escapeHtml(forumInitials(msg.full_name))}</div>`;

        return `
            <div class="forum-message-block" data-message-id="${msg.message_id}">
                ${avatarHtml}
                <div class="forum-message-block-content">
                    <div class="forum-message-block-header">
                        <span class="forum-message-username">${escapeHtml(msg.username)}</span>
                        <span class="forum-message-timestamp">${time}</span>
                    </div>
                    <div class="forum-message-text-row">
                        <p class="forum-message-text">${escapeHtml(msg.content)}</p>
                        ${deleteBtn}
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="forum-message-continuation" data-message-id="${msg.message_id}">
            <span class="forum-message-continuation-time">${time}</span>
            <div class="forum-message-text-row">
                <p class="forum-message-text">${escapeHtml(msg.content)}</p>
                ${deleteBtn}
            </div>
        </div>
    `;
}

function forumInitials(fullName) {
    return (fullName || '').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase();
}

function formatForumTimestamp(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (date.toDateString() === now.toDateString()) return `Today at ${timeStr}`;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${timeStr}`;

    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
}

function scrollForumToBottom() {
    const body = document.getElementById('forumBody');
    if (body) body.scrollTop = body.scrollHeight;
}

async function sendForumMessage() {
    const gameId = document.getElementById('communityGameId')?.value;
    const input = document.getElementById('forumMessageInput');
    const sendBtn = document.getElementById('forumSendBtn');
    if (!gameId || !input) return;

    const content = input.value.trim();
    if (!content) return;

    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    try {
        const res  = await fetch(`/api/game/${gameId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        const data = await res.json();

        if (data.success) {
            forumMessages.push(data.message);
            renderForumMessages();
            scrollForumToBottom();

            input.value = '';
            input.style.height = 'auto';

            const empty = document.getElementById('forumEmpty');
            if (empty) empty.style.display = 'none';
        } else {
            alert(data.message || 'Failed to send message');
        }
    } catch (e) {
        console.error('Failed to send forum message:', e);
        alert('Failed to send message. Please try again.');
    } finally {
        input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
    }
}

function confirmDeleteForumMessage(messageId) {
    openDeleteConfirmModal({
        title: 'Delete Message?',
        message: 'Are you sure you want to delete this message? This cannot be undone.',
        buttonText: 'Delete Message',
        itemId: messageId,
        onConfirm: async (id) => {
            await executeForumMessageDelete(id);
        }
    });
}

async function executeForumMessageDelete(messageId) {
    const gameId = document.getElementById('communityGameId')?.value;

    try {
        const res = await fetch(`/api/game/${gameId}/messages/${messageId}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
            forumMessages = forumMessages.filter(m => m.message_id !== messageId);
            renderForumMessages();
            closeDeleteConfirmModal();
            showDeleteSuccessMessage('Message deleted.');
        } else {
            closeDeleteConfirmModal();
            showDeleteErrorMessage('Delete failed: ' + data.message);
        }
    } catch (e) {
        closeDeleteConfirmModal();
        showDeleteErrorMessage('Delete failed. Please try again.');
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
            const gmId = data.game.assigned_gm_id;
            data.game.members.forEach(member => {
                const pill = createMemberPill(member, { size: 'compact' });
                if (member.id === gmId) pill.classList.add('member-pill--gm');
                if (member.username.toLowerCase() === currentUsername?.toLowerCase()) pill.classList.add('member-pill--self');
                grid.appendChild(pill);
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
    if (userProfileOpen) return;
    const popup = document.getElementById('memberListPopup');
    const btn   = document.getElementById('memberListBtn');
    if (popup && !popup.contains(e.target) && !btn?.contains(e.target)) {
        closeMemberListPopup();
    }
}

// Filter members in popup
const filterMemberListPopup = () =>
    filterListItems('memberListSearch', '#memberListGrid .member-pill', ['username', 'name'], 'flex');

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
                <div class="game-next-event-card" onclick="navigateToEvent(${event.id})">
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
            grid.style.display = 'flex';
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
            <div class="community-card-no-icon">
                <i class="fas fa-gamepad"></i>
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
    initForum();

    if (gameId) {
        loadNextCommunityEvent(gameId);
        initCommunityStats(gameId);
    }
});

// ============================================
// EXPORT FUNCTIONS
// ============================================
// Community Forum
window.sendForumMessage          = sendForumMessage;
window.confirmDeleteForumMessage = confirmDeleteForumMessage;

// Photo Carousel
window.carouselNext        = carouselNext;
window.carouselPrev        = carouselPrev;
window.openPhotoManager    = openPhotoManager;
window.closePhotoManager   = closePhotoManager;

// Member list popup
window.toggleMemberListPopup = toggleMemberListPopup;
window.filterMemberListPopup = filterMemberListPopup;