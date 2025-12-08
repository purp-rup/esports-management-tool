/**
 * badges.js
 * ============================================================================
 * UNIVERSAL BADGE SYSTEM
 * ORGANIZED BY CLAUDEAI
 * ============================================================================
 * Centralized badge generation system that handles:
 * - Role badge rendering (Admin, Game Manager, Player, Member)
 * - GM-to-game associations with game icons
 * - Context-aware badge highlighting
 * - Dynamic badge refresh after role changes
 *
 * This system ensures consistent badge display across all modules and pages.
 * ============================================================================
 */

// ============================================
// GLOBAL STATE - GM GAME MAPPINGS CACHE
// ============================================

/**
 * Cache for GM-game mappings to avoid repeated API calls
 * Structure: { user_id: [{ game_id, game_title, game_icon_url }, ...] }
 * @type {Object.<number, Array>}
 */
let gmGameMappings = {};

/**
 * Flag to track if GM mappings have been loaded
 * Prevents duplicate loading attempts
 * @type {boolean}
 */
let gmMappingsLoaded = false;

// ============================================
// GM-GAME MAPPINGS LOADER
// ============================================

/**
 * Load all GM-game assignments from backend API
 * Should be called once on page load (automatically via DOMContentLoaded)
 * Can be called manually if mappings need to be refreshed
 *
 * Stores mappings in memory for quick badge generation
 * @returns {Promise<void>}
 */
async function loadGMGameMappings() {
    // Early return if mappings already loaded to avoid duplicate requests
    if (gmMappingsLoaded) return;

    try {
        // Fetch GM-game assignments from API
        const response = await fetch('/api/gm-game-mappings');
        const data = await response.json();

        if (data.success) {
            // Store mappings in global cache
            // Format: { user_id: [{ game_id, game_title, game_icon_url }, ...] }
            gmGameMappings = data.mappings || {};
            gmMappingsLoaded = true;
            console.log('GM-Game mappings loaded:', gmGameMappings);
        } else {
            console.warn('GM-game mappings request returned unsuccessful status');
        }
    } catch (error) {
        console.error('Error loading GM-game mappings:', error);
        // Keep gmMappingsLoaded as false so we can retry later if needed
    }
}

// ============================================
// UNIVERSAL BADGE BUILDER
// ============================================

/**
 * Build role badges for a user - UNIVERSAL VERSION
 * This is the central badge generation function used across all modules
 *
 * @param {Object} options - Badge configuration options
 * @param {number} options.userId - User ID to generate badges for
 * @param {Array<string>} options.roles - Array of role strings ['Admin', 'Game Manager', 'Developer', 'Player']
 * @param {number|null} options.contextGameId - Optional: Game ID for context-aware highlighting
 *                                               When provided, highlights GM badge if user is assigned to this game
 * @param {Array<string>} options.excludeRoles - Optional: Array of role names to exclude from display
 *                                                Useful for hiding specific roles in certain contexts
 * @returns {string} HTML string containing all role badges for the user
 *
 */
function buildUniversalRoleBadges(options) {
    // Destructure options with defaults
    const { userId, roles = [], contextGameId = null, excludeRoles = [] } = options;
    let badgesHTML = '';

    try {
        // Check which roles the user has
        const hasGMRole = roles.includes('Game Manager');
        const hasAdminRole = roles.includes('Admin');
        const hasDeveloperRole = roles.includes('Developer');
        const hasPlayerRole = roles.includes('Player');

        // ============================================
        // DEVELOPER BADGE (HIGHEST PRIORITY)
        // ============================================
        if (hasDeveloperRole && !excludeRoles.includes('Developer')) {
            badgesHTML += '<span class="role-badge dev" title="Developer">DEV</span>';
        }

        // ============================================
        // ADMIN BADGE
        // ============================================
        if (hasAdminRole && !excludeRoles.includes('Admin')) {
            badgesHTML += '<span class="role-badge admin">Admin</span>';
        }

        // ============================================
        // GAME MANAGER BADGES (WITH GAME ICONS)
        // ============================================
        if (hasGMRole && !excludeRoles.includes('Game Manager')) {
            // Get games this user is GM for from cached mappings
            const userGames = gmGameMappings[userId] || [];

            if (userGames.length > 0) {
                // User is GM of specific games - create a badge for each game
                userGames.forEach(game => {
                    // Check if this game matches the context (for highlighting)
                    const isContextGame = (contextGameId && game.game_id === contextGameId);

                    // Apply 'assigned' class if this is the context game
                    const gmBadgeClass = isContextGame ? 'role-badge gm assigned' : 'role-badge gm';

                    if (game.game_icon_url) {
                        // GM badge with game icon
                        badgesHTML += `
                            <span class="${gmBadgeClass}"
                                  title="Game Manager: ${game.game_title}">
                                <img src="${game.game_icon_url}"
                                     alt="${game.game_title}"
                                     onerror="this.style.display='none'">
                                GM
                            </span>`;
                    } else {
                        // GM badge without icon (fallback if no icon URL provided)
                        badgesHTML += `<span class="${gmBadgeClass}" title="Game Manager: ${game.game_title}">GM</span>`;
                    }
                });
            } else {
                // User has GM role but isn't assigned to any specific games yet
                // Show generic GM badge
                badgesHTML += '<span class="role-badge gm" title="Game Manager">GM</span>';
            }
        }

        // ============================================
        // PLAYER BADGE
        // ============================================
        if (hasPlayerRole && !excludeRoles.includes('Player')) {
            badgesHTML += '<span class="role-badge player">Player</span>';
        }

        // ============================================
        // FALLBACK: MEMBER BADGE
        // ============================================
        // If user has no roles at all (or all roles are excluded), show Member badge
        if (badgesHTML === '' && !hasAdminRole && !hasGMRole && !hasPlayerRole) {
            badgesHTML += '<span class="role-badge member">Member</span>';
        }

    } catch (error) {
        // Fallback to Member badge if any error occurs during badge generation
        console.error('Error building badges:', error);
        badgesHTML = '<span class="role-badge member">Member</span>';
    }

    return badgesHTML;
}

// ============================================
// MAPPING REFRESH
// ============================================

/**
 * Force refresh of GM-game mappings from the server
 * Call this after GM assignments are modified (added/removed)
 *
 * Clears the cache and reloads fresh data from API
 * @returns {Promise<void>}
 *
 * @example
 * // After assigning a user as GM of a game
 * await assignUserAsGM(userId, gameId);
 * await refreshGMGameMappings(); // Refresh cache
 */
async function refreshGMGameMappings() {
    // Clear the loaded flag to force reload
    gmMappingsLoaded = false;

    // Reload mappings from server
    await loadGMGameMappings();
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Auto-initialize on page load
 * Loads GM-game mappings so they're ready when badge functions are called
 */
document.addEventListener('DOMContentLoaded', function() {
    loadGMGameMappings();
});

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

/**
 * Export functions to window object for access by other modules
 * These functions are used throughout the application by:
 * - admin-panel.js (user management badges)
 * - communities.js (roster badges)
 * - events.js (event participant badges)
 * - Any other module that needs to display user roles
 */
window.loadGMGameMappings = loadGMGameMappings;
window.buildUniversalRoleBadges = buildUniversalRoleBadges;
window.refreshGMGameMappings = refreshGMGameMappings;