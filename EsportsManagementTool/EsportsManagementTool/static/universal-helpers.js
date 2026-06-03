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

//Global Exports
window.filterListItems = filterListItems;
window.enableDropdown = enableDropdown;
window.debounce = debounce;