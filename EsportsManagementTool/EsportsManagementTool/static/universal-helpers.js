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

        // Triggers cards to open in mobile view
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

/* Shared platform metadata for social media link behavior
 *
 * Used by social-links.js
 */
const SOCIAL_PLATFORM_META = {
    discord:   { icon: 'fa-brands fa-discord',   slug: 'discord' },
    instagram: { icon: 'fa-brands fa-instagram', slug: 'instagram' },
    youtube:   { icon: 'fa-brands fa-youtube',   slug: 'youtube' },
    twitch:    { icon: 'fa-brands fa-twitch',    slug: 'twitch' },
    twitter:   { icon: 'fa-brands fa-twitter',   slug: 'twitter' },
    tiktok:    { icon: 'fa-brands fa-tiktok',    slug: 'tiktok' }
};

function getSocialPlatformMeta(linkName) {
    const key = linkName.trim().toLowerCase();
    return SOCIAL_PLATFORM_META[key] || { icon: 'fa-solid fa-link', slug: 'custom' };
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
 * Used by events.js, scheduled-events.js, manage-communities.js, dashboard.js, & playoffs-results.js
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

// ============================================
// INFO ICON
// ============================================

/**
 * Position an info tooltip using fixed viewport coordinates so it
 * can't be clipped by overflow:hidden ancestors or panel scroll.
 * Resets when the wrapper loses hover (see initInfoIcon).
 * @param {HTMLElement} wrapperEl .info-icon-wrapper element
 */
function positionInfoTooltip(wrapperEl) {
    if (window.innerWidth <= 768) return;

    const tooltip = wrapperEl.querySelector('.info-tooltip');
    if (!tooltip) return;

    tooltip.style.top = '';

    const wrapperRect  = wrapperEl.getBoundingClientRect();
    const tooltipWidth = 260; // matches the fixed CSS width
    const gap          = 12;
    const margin       = 8;

    // Open left if there's not enough room to the right but enough to the left
    const spaceRight = window.innerWidth - wrapperRect.right - gap;
    const spaceLeft  = wrapperRect.left - gap;
    const opensLeft  = spaceRight < tooltipWidth && spaceLeft >= tooltipWidth;

    tooltip.classList.toggle('info-tooltip--left', opensLeft);

    // Vertical clamp
    tooltip.style.visibility = 'hidden';
    tooltip.style.display    = 'block';
    const h = tooltip.offsetHeight;
    tooltip.style.display    = '';
    tooltip.style.visibility = '';

    const defaultViewportTop = wrapperRect.top + wrapperRect.height / 2 - h / 2;

    if (defaultViewportTop < margin) {
        tooltip.style.top = `${margin - wrapperRect.top + h / 2}px`;
    } else if (defaultViewportTop + h > window.innerHeight - margin) {
        tooltip.style.top = `${window.innerHeight - margin - wrapperRect.top - h / 2}px`;
    }
}

/**
 * Open the universal info bottom sheet.
 * @param {string}      title     Heading shown at the top of the sheet
 * @param {HTMLElement} tooltipEl The .info-tooltip whose innerHTML to clone
 */
function openInfoSheet(title, tooltipEl) {
    const sheet    = document.getElementById('infoSheet');
    const titleEl  = document.getElementById('infoSheetTitle');
    const content  = document.getElementById('infoSheetContent');
    const backdrop = document.getElementById('infoSheetBackdrop');
    if (!sheet || !titleEl || !content) return;

    titleEl.textContent  = title;
    content.innerHTML    = tooltipEl ? tooltipEl.innerHTML : '';
    sheet.classList.add('sheet-open');
    backdrop?.classList.add('open');
    lockBodyScroll('infoSheet');
}

/**
 * Close the universal info bottom sheet.
 */
function closeInfoSheet() {
    document.getElementById('infoSheet')?.classList.remove('sheet-open');
    document.getElementById('infoSheetBackdrop')?.classList.remove('open');
    unlockBodyScroll('infoSheet');
}

/**
 * Initialize a single info icon wrapper for both desktop and mobile.
 *
 * @param {HTMLElement}        wrapperEl .info-icon-wrapper element
 * @param {string|function}    titleOrFn Sheet heading, or a function
 *                                       that returns it (for dynamic titles)
 */
function initInfoIcon(wrapperEl, titleOrFn) {
    if (!wrapperEl) return;

    const icon = wrapperEl.querySelector('.info-icon');

    // Mobile click
    icon?.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            e.stopPropagation();
            const tooltip = wrapperEl.querySelector('.info-tooltip');
            const title   = typeof titleOrFn === 'function' ? titleOrFn() : (titleOrFn || '');
            openInfoSheet(title, tooltip);
        }
    });

    // Desktop hover
    wrapperEl.addEventListener('mouseenter', () => {
        const t = wrapperEl.querySelector('.info-tooltip');
        if (!t) return;
        clearTimeout(t._flipTimer);
        // Sets --left if needed force reflow so browser sees the
        // correct starting transform before --visible triggers the transition
        positionInfoTooltip(wrapperEl);
        void t.offsetHeight;
        t.classList.add('info-tooltip--visible');
    });
    wrapperEl.addEventListener('mouseleave', () => {
        const t = wrapperEl.querySelector('.info-tooltip');
        if (!t) return;
        t.style.top = '';
        t.classList.remove('info-tooltip--visible'); // fade + slide out
        clearTimeout(t._flipTimer);
        // Remove direction class only after the exit transition finishes
        t._flipTimer = setTimeout(() => {
            t.classList.remove('info-tooltip--left');
        }, 150);
    });
}

// Auto-init any info icon that declares a static title via data attribute.
// The Teams tab wires its own icon manually (dynamic title).
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.info-icon-wrapper[data-info-title]').forEach(wrapper => {
        initInfoIcon(wrapper, wrapper.dataset.infoTitle);
    });
});

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
window.getSocialPlatformMeta = getSocialPlatformMeta;
window.attachCharacterCounter = attachCharacterCounter;
window.navigateToEvent = navigateToEvent;
window.createMemberPill = createMemberPill;
window.debounce = debounce;
window.lockBodyScroll = lockBodyScroll;
window.unlockBodyScroll = unlockBodyScroll;
window.positionInfoTooltip = positionInfoTooltip;
window.openInfoSheet = openInfoSheet;
window.closeInfoSheet = closeInfoSheet;
window.initInfoIcon = initInfoIcon;