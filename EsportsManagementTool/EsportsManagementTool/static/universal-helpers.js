// ============================================================================
// Universal Helpers and Utilities
// ============================================================================

/**
 * Universal list filter function.
 * Reads a search input and shows/hides items based on data attribute matches.
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
 * Generic filter-box dropdown toggle. Opens the given panel and closes
 * any other open filter-box panels. On mobile, also opens the shared
 * #filterBackdrop sheet and locks body scroll, if that element exists
 * on the page (safe no-op otherwise).
 *
 * Used by events.js, dashboard.js, & admin-statistics.js,
 */
function toggleFilterBox(panelId) {
    const panel = document.getElementById(panelId);
    const btn = panel?.previousElementSibling;
    const isOpen = panel?.classList.contains('open');

    closeAllFilterPanels();

    const filterBackdrop = document.getElementById('filterBackdrop');

    if (!isOpen) {
        panel?.classList.add('open');
        btn?.classList.add('active');
        if (window.innerWidth <= 768 && filterBackdrop) {
            filterBackdrop.classList.add('open');
            lockBodyScroll('filterBox');
        }
    } else {
        filterBackdrop?.classList.remove('open');
        unlockBodyScroll('filterBox');
    }
}

/**
 * Closes every open .filter-box-panel on the page and releases the
 * mobile backdrop/scroll lock if one was held.
 *
 * Used by events.js, dashboard.js, & admin-statistics.js
 */
function closeAllFilterPanels() {
    document.querySelectorAll('.filter-box-panel.open').forEach(p => {
        p.classList.remove('open');
        p.previousElementSibling?.classList.remove('active');
    });
    document.getElementById('filterBackdrop')?.classList.remove('open');
    unlockBodyScroll('filterBox');
}

// Close any open filter-box panel when clicking outside it
document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-box')) {
        closeAllFilterPanels();
    }
});

/**
 * Position a flyout submenu to the left if it would overflow the
 * right edge of the viewport.
 *
 * Used by events.js & teams-sidebar.js
 */
function positionFlyout(triggerEl) {
    const flyout = triggerEl.querySelector('.filter-box-flyout');
    if (!flyout) return;

    // On mobile the flyout renders inline
    if (window.innerWidth <= 768) return;

    flyout.style.display = 'block';
    flyout.style.position = 'fixed';

    const triggerRect = triggerEl.getBoundingClientRect();
    const flyoutRect = flyout.getBoundingClientRect();

    let left = triggerRect.right + 6;
    let top = triggerRect.top - 6;

    // Flip to the trigger's left side if it would overflow the right edge
    if (left + flyoutRect.width > window.innerWidth) {
        left = triggerRect.left - flyoutRect.width - 6;
    }

    // Clamp vertically so it doesn't run off the bottom of the viewport
    if (top + flyoutRect.height > window.innerHeight) {
        top = Math.max(8, window.innerHeight - flyoutRect.height - 8);
    }

    flyout.style.left = `${left}px`;
    flyout.style.top = `${top}px`;

    flyout.style.display = '';
}

/**
 * Wires up hover-positioning and mobile tap-to-expand behavior for
 * every .filter-box-item--flyout trigger within the given scope.
 *
 * Used by events.js, teams-sidebar.js.
 */
function initFlyoutTriggers(scope = document) {
    scope.querySelectorAll('.filter-box-item--flyout').forEach(trigger => {
        trigger.addEventListener('mouseenter', () => positionFlyout(trigger));

        if (window.innerWidth <= 768) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = trigger.classList.contains('flyout-expanded');
                document.querySelectorAll('.filter-box-item--flyout.flyout-expanded').forEach(t => {
                    t.classList.remove('flyout-expanded');
                });
                if (!isExpanded) {
                    trigger.classList.add('flyout-expanded');
                }
            });
        }
    });
}

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
window.toggleFilterBox = toggleFilterBox;
window.closeAllFilterPanels = closeAllFilterPanels;
window.positionFlyout = positionFlyout;
window.initFlyoutTriggers = initFlyoutTriggers;
window.enableDropdown = enableDropdown;
window.attachCharacterCounter = attachCharacterCounter;
window.navigateToEvent = navigateToEvent;
window.createMemberPill = createMemberPill;
window.debounce = debounce;
window.lockBodyScroll = lockBodyScroll;
window.unlockBodyScroll = unlockBodyScroll;