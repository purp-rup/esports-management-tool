/**
 * UNIVERSAL BADGE SYSTEM
 * Centralized badge generation with GM-game associations
 */

// Cache for GM-game mappings
let gmGameMappings = {};
let gmMappingsLoaded = false;

/**
 * Load all GM-game assignments from backend
 * This should be called once on page load
 */
async function loadGMGameMappings() {
    if (gmMappingsLoaded) return;

    try {
        const response = await fetch('/api/gm-game-mappings');
        const data = await response.json();

        if (data.success) {
            // Store mappings: { user_id: [{ game_id, game_title, game_icon_url }, ...] }
            gmGameMappings = data.mappings || {};
            gmMappingsLoaded = true;
            console.log('GM-Game mappings loaded:', gmGameMappings);
        }
    } catch (error) {
        console.error('Error loading GM-game mappings:', error);
    }
}

/**
 * Build role badges for a user - UNIVERSAL VERSION
 * @param {Object} options - Badge options
 * @param {number} options.userId - User ID
 * @param {Array} options.roles - Array of role strings ['Admin', 'Game Manager', 'Player']
 * @param {number} options.contextGameId - Optional: Game ID for context (highlights assigned GM)
 * @returns {string} HTML string of badges
 */
function buildUniversalRoleBadges(options) {
    const { userId, roles = [], contextGameId = null } = options;
    let badgesHTML = '';

    try {
        const hasGMRole = roles.includes('Game Manager');
        const hasAdminRole = roles.includes('Admin');
        const hasPlayerRole = roles.includes('Player');

        // Build Admin badge
        if (hasAdminRole) {
            badgesHTML += '<span class="role-badge admin">Admin</span>';
        }

        // Build GM badges with game icons
        if (hasGMRole) {
            const userGames = gmGameMappings[userId] || [];

            if (userGames.length > 0) {
                // User is GM of specific games - show badge for each
                userGames.forEach(game => {
                    const isContextGame = (contextGameId && game.game_id === contextGameId);
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
                        // GM badge without icon
                        badgesHTML += `<span class="${gmBadgeClass}" title="Game Manager: ${game.game_title}">GM</span>`;
                    }
                });
            } else {
                // Has GM role but not assigned to any games yet
                badgesHTML += '<span class="role-badge gm" title="Game Manager">GM</span>';
            }
        }

        // Build Player badge
        if (hasPlayerRole) {
            badgesHTML += '<span class="role-badge player">Player</span>';
        }

        // If no roles at all, show Member
        if (!hasAdminRole && !hasGMRole && !hasPlayerRole) {
            badgesHTML += '<span class="role-badge member">Member</span>';
        }

    } catch (error) {
        console.error('Error building badges:', error);
        badgesHTML = '<span class="role-badge member">Member</span>';
    }

    return badgesHTML;
}

/**
 * Refresh GM mappings (call after GM assignment changes)
 */
async function refreshGMGameMappings() {
    gmMappingsLoaded = false;
    await loadGMGameMappings();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadGMGameMappings();
});

// Export functions
window.loadGMGameMappings = loadGMGameMappings;
window.buildUniversalRoleBadges = buildUniversalRoleBadges;
window.buildRoleBadges = buildRoleBadges;
window.refreshGMGameMappings = refreshGMGameMappings;