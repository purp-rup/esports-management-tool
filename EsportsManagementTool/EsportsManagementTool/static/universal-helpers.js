// ============================================================================
// Universal Helpers and Utilities
// ============================================================================

/**
 * Universal list filter function.
 * Reads a search input and shows/hides items based on data attribute matches.
 *
 * @param {string} searchInputId   - ID of the <input> element to read from
 * @param {string} itemSelector    - CSS selector for the items to show/hide
 * @param {string[]} dataAttributes - data-* attribute names (without "data-") to match against
 * @param {string} [displayStyle]  - display value when visible (default: 'flex')
 *
 * Used by teams.js
 */
const filterListItems = debounce(function(searchInputId, itemSelector, dataAttributes, displayStyle = 'flex') {
    const searchInput = document.getElementById(searchInputId);
    if (!searchInput) return;

    const filter = searchInput.value.toLowerCase();
    const items = document.querySelectorAll(itemSelector);

    items.forEach(item => {
        const matches = dataAttributes.some(attr => {
            const value = item.getAttribute(`data-${attr}`);
            return value && value.includes(filter);
        });

        item.style.display = matches ? displayStyle : 'none';
    });
}, 300);

/**
 * Universal dropdown enabler (removes all disabled states)
 * Used by teams.js, game.js, leagues.js, & events.js
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
 * Attach a live character counter to a text area.
 * Used by events.js, scheduled-events.js, manage-communities.js, dashboard.js, & tournament-results.js
 */
function attachCharacterCounter(textareaId, maxLength) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;

    textarea.setAttribute('maxlength', maxLength);

    // Remove any existing counter to avoid duplicates on re-open
    const existing = textarea.nextElementSibling;
    if (existing?.classList.contains('char-counter')) {
        existing.remove();
    }

    const counter = document.createElement('div');
    counter.className = 'char-counter';
    counter.textContent = `${textarea.value.length} / ${maxLength}`;

    textarea.parentNode.insertBefore(counter, textarea.nextSibling);

    textarea.addEventListener('input', function() {
        counter.textContent = `${textarea.value.length} / ${maxLength}`;
    });
}

/**
 * Navigates from an event card to the corresponding event on the Event tab.
 * Used by communities.js & team.js
 **/
function navigateToEvent(eventId) {
    const eventsTab = document.querySelector('[data-tab="events"]');
    if (eventsTab) {
        // Same-page: switch to events tab and open the detail panel
        eventsTab.click();
        let opened = false;
        const tryOpen = (attempts = 0) => {
            if (opened) return;
            const container = document.getElementById('eventsContainer');
            if (container && container.style.display !== 'none') {
                opened = true;
                openEventDetailPanel(eventId);
            } else if (attempts < 30) {
                setTimeout(() => tryOpen(attempts + 1), 150);
            }
        };
        setTimeout(() => tryOpen(), 200);
    } else {
        // Cross-page: redirect to dashboard with event param
        window.location.href = `/dashboard?openEvent=${eventId}`;
    }
}

/**
 * Build a clickable member pill to be shared across multiple files
 *
 * Used by communities.js & teams.js
 */
function createMemberPill(member, options = {}) {
    const { size = 'compact', actionsHtml = '', onSelect = null } = options;

    const pill = document.createElement('div');
    pill.className = `member-pill member-pill--${size}`;
    pill.setAttribute('data-username', member.username.toLowerCase());
    pill.setAttribute('data-name', member.name.toLowerCase());

    const avatarHtml = member.profile_picture
        ? `<img src="${member.profile_picture}" alt="${member.username}" class="member-pill-avatar">`
        : `<div class="member-pill-initials">${member.name.split(' ').map(n => n[0]).join('')}</div>`;

    pill.innerHTML = `
        ${avatarHtml}
        <span class="member-pill-username">${member.username}</span>
        ${actionsHtml ? `<div class="member-pill-actions">${actionsHtml}</div>` : ''}
    `;

    pill.addEventListener('click', (e) => {
        if (e.target.closest('.member-pill-actions')) return;
        if (onSelect) {
            onSelect(member, e);
        } else {
            toggleUserProfilePopup(e, member);
        }
    });

    return pill;
}

// ========================================
// UTILITIES
// =======================================

/**
 * Debounce function to limit how often a function is called
 * Used by teams.js and universal-helpers.js
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Body scroll lock system
const _scrollLockOwners = new Set();
let _scrollLockY = 0;

// Locks the body to prevent scrolling
function lockBodyScroll(ownerId) {
    if (_scrollLockOwners.size === 0) {
        _scrollLockY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${_scrollLockY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.overflow = 'hidden';
    }
    _scrollLockOwners.add(ownerId);
}

// Unlocks the body to allow scrolling.
function unlockBodyScroll(ownerId) {
    const hadOwner = _scrollLockOwners.delete(ownerId);
    if (!hadOwner) return; // this owner never held a lock — nothing to release

    if (_scrollLockOwners.size === 0) {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.overflow = '';
        window.scrollTo(0, _scrollLockY);
    }
}

//Global Exports
window.filterListItems = filterListItems;
window.enableDropdown = enableDropdown;
window.attachCharacterCounter = attachCharacterCounter;
window.navigateToEvent = navigateToEvent;
window.createMemberPill = createMemberPill;
window.debounce = debounce;
window.lockBodyScroll = lockBodyScroll;
window.unlockBodyScroll = unlockBodyScroll;