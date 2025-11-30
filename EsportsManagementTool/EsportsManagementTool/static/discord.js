/**
 * discord.js
 * ============================================================================
 * DISCORD OAUTH INTEGRATION
 * ORGANIZED BY CLAUDEAI
 * ============================================================================
 * Handles all Discord-related functionality:
 * - OAuth2 authentication and authorization
 * - Discord profile display (avatar, username, ID)
 * - Account connection and disconnection
 * - Avatar synchronization between Discord and platform
 * - Connection status loading and display
 *
 * This module manages the complete lifecycle of Discord integration,
 * from initial OAuth flow to ongoing profile management.
 * ============================================================================
 */

// ============================================
// GLOBAL STATE
// ============================================

/**
 * Cached Discord connection information
 * Stores user's Discord profile data after successful load
 * @type {Object|null}
 */
let discordInfo = null;

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize Discord integration on page load
 * Only loads Discord info if Discord UI elements are present
 */
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on a page with Discord integration
    // (avoids unnecessary API calls on pages without Discord features)
    if (document.getElementById('discordLoading')) {
        loadDiscordInfo();
    }
});

// ============================================
// DISCORD CONNECTION STATUS
// ============================================

/**
 * Load Discord connection information from the API
 * Handles three states: loading, connected, and not connected
 *
 * Flow:
 * 1. Show loading state
 * 2. Fetch connection info from API
 * 3. Display appropriate UI based on connection status
 *
 * @returns {Promise<void>}
 */
async function loadDiscordInfo() {
    // Get UI elements
    const loadingDiv = document.getElementById('discordLoading');
    const notConnectedDiv = document.getElementById('discordNotConnected');
    const connectedDiv = document.getElementById('discordConnected');

    // Safety check - ensure all required elements exist
    if (!loadingDiv || !notConnectedDiv || !connectedDiv) {
        console.error('Discord UI elements not found - integration may not be available on this page');
        return;
    }

    // Show loading state, hide others
    loadingDiv.style.display = 'block';
    notConnectedDiv.style.display = 'none';
    connectedDiv.style.display = 'none';

    try {
        // Fetch Discord connection info from backend API
        const response = await fetch('/api/discord/info');

        // Handle HTTP errors
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Hide loading state
        loadingDiv.style.display = 'none';

        if (data.success && data.connected) {
            // User has Discord connected - cache data and display profile
            discordInfo = data;
            displayDiscordProfile(data);
            connectedDiv.style.display = 'block';
        } else {
            // User hasn't connected Discord yet - show connect prompt
            notConnectedDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading Discord info:', error);

        // Hide loading, show not connected state on error
        loadingDiv.style.display = 'none';
        notConnectedDiv.style.display = 'block';

        // Display error message to user
        if (notConnectedDiv) {
            const emptyState = notConnectedDiv.querySelector('.empty-state');
            if (emptyState) {
                const errorMsg = document.createElement('p');
                errorMsg.style.color = '#ff5252';
                errorMsg.style.fontSize = '0.875rem';
                errorMsg.style.marginTop = '0.5rem';
                errorMsg.textContent = 'Failed to load Discord connection status. Please refresh the page.';
                emptyState.appendChild(errorMsg);
            }
        }
    }
}

// ============================================
// DISCORD PROFILE DISPLAY
// ============================================

/**
 * Display Discord profile information in the UI
 * Updates avatar, username, Discord ID, and connection date
 *
 * Handles both old (username#discriminator) and new (@username) Discord formats
 *
 * @param {Object} data - Discord profile data from API
 * @param {string} data.avatar_url - URL to user's Discord avatar
 * @param {string} data.username - Discord username
 * @param {string} data.discriminator - Discord discriminator (legacy format)
 * @param {string} data.discord_id - Discord user ID
 * @param {string} data.connected_at - Date when Discord was connected
 */
function displayDiscordProfile(data) {
    // ========================================
    // AVATAR DISPLAY
    // ========================================
    const avatarContainer = document.getElementById('discordAvatarContainer');
    if (avatarContainer) {
        if (data.avatar_url) {
            // Display user's Discord avatar
            avatarContainer.innerHTML = `<img src="${data.avatar_url}" alt="Discord Avatar" loading="lazy">`;
        } else {
            // Fallback to Discord icon if no avatar available
            avatarContainer.innerHTML = `<i class="fab fa-discord"></i>`;
        }
    }

    // ========================================
    // USERNAME DISPLAY
    // ========================================
    const usernameEl = document.getElementById('discordUsername');
    if (usernameEl) {
        // Discord changed username format in 2023
        // Old format: username#1234
        // New format: @username

        if (data.discriminator && data.discriminator !== '0') {
            // Old Discord username format (with discriminator)
            usernameEl.innerHTML = `<i class="fab fa-discord"></i> ${escapeHtml(data.username)}#${escapeHtml(data.discriminator)}`;
        } else {
            // New Discord username format (no discriminator)
            usernameEl.innerHTML = `<i class="fab fa-discord"></i> @${escapeHtml(data.username)}`;
        }
    }

    // ========================================
    // DISCORD ID DISPLAY
    // ========================================
    const idEl = document.getElementById('discordId');
    if (idEl) {
        idEl.textContent = `Discord ID: ${data.discord_id}`;
    }

    // ========================================
    // CONNECTION DATE DISPLAY
    // ========================================
    const dateTextEl = document.getElementById('connectedDateText');
    if (dateTextEl) {
        dateTextEl.textContent = data.connected_at;
    }
}

// ============================================
// DISCORD OAUTH CONNECTION
// ============================================

/**
 * Redirect user to Discord OAuth2 authorization page
 * User will be prompted to authorize the application on Discord
 *
 * Flow:
 * 1. User clicks "Connect Discord" button
 * 2. Redirected to Discord OAuth page
 * 3. User authorizes application
 * 4. Discord redirects back to callback URL
 * 5. Backend handles OAuth callback and stores tokens
 */
function connectDiscord() {
    // Redirect to backend OAuth initialization route
    // Backend will generate proper OAuth URL with state parameter
    window.location.href = '/discord/connect';
}

// ============================================
// DISCORD DISCONNECTION
// ============================================

/**
 * Disconnect Discord account from user profile
 * Removes Discord tokens and profile data from database
 * Shows confirmation dialog before proceeding
 *
 * @returns {Promise<void>}
 */
async function disconnectDiscord() {
    // Confirm user wants to disconnect (prevents accidental disconnection)
    if (!confirm('Are you sure you want to disconnect your Discord account?')) {
        return;
    }

    const messageDiv = document.getElementById('discordActionMessage');

    // Hide any previous messages
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }

    try {
        // Send disconnect request to backend
        const response = await fetch('/discord/disconnect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Handle HTTP errors
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            // Show success message
            if (messageDiv) {
                messageDiv.textContent = 'Discord account disconnected successfully!';
                messageDiv.className = 'form-message success';
                messageDiv.style.display = 'block';
            }

            // Reload page after short delay to show updated state
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            throw new Error(data.message || 'Failed to disconnect');
        }
    } catch (error) {
        console.error('Error disconnecting Discord:', error);

        // Show error message to user
        if (messageDiv) {
            messageDiv.textContent = error.message || 'Failed to disconnect Discord account. Please try again.';
            messageDiv.className = 'form-message error';
            messageDiv.style.display = 'block';
        }
    }
}

// ============================================
// AVATAR SYNCHRONIZATION
// ============================================

/**
 * Sync Discord avatar to user's platform profile picture
 * Fetches current Discord avatar and sets it as the platform avatar
 * Useful for keeping profile pictures up-to-date across platforms
 *
 * @returns {Promise<void>}
 */
async function syncDiscordAvatar() {
    const messageDiv = document.getElementById('discordActionMessage');

    // Hide any previous messages
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }

    try {
        // Request avatar sync from backend
        const response = await fetch('/discord/sync-avatar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            // Show success message
            if (messageDiv) {
                messageDiv.textContent = data.message || 'Avatar synced successfully!';
                messageDiv.className = 'form-message success';
                messageDiv.style.display = 'block';
            }

            // Reload to profile tab after 1.5 seconds to show updated avatar
            // Hash navigation ensures user returns to the profile tab
            setTimeout(() => {
                window.location.href = window.location.pathname + '#profile';
                window.location.reload();
            }, 1500);
        } else {
            throw new Error(data.message || 'Failed to sync avatar');
        }
    } catch (error) {
        console.error('Error syncing Discord avatar:', error);

        // Show error message to user
        if (messageDiv) {
            messageDiv.textContent = error.message || 'Failed to sync profile picture. Make sure you have Discord connected.';
            messageDiv.className = 'form-message error';
            messageDiv.style.display = 'block';
        }
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Escape HTML to prevent XSS attacks
 * Essential for safely displaying user-provided data (usernames, etc.)
 *
 * @param {string} text - Text to escape
 * @returns {string} HTML-safe escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show a temporary message to the user
 * Utility function for displaying feedback messages
 *
 * @param {string} message - Message to display
 * @param {string} type - Message type ('success' or 'error')
 * @param {number} duration - How long to show message in milliseconds
 */
function showDiscordMessage(message, type = 'success', duration = 3000) {
    const messageDiv = document.getElementById('discordActionMessage');
    if (!messageDiv) return;

    // Display message with appropriate styling
    messageDiv.textContent = message;
    messageDiv.className = `form-message ${type}`;
    messageDiv.style.display = 'block';

    // Auto-hide message after duration
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, duration);
}

// ============================================
// MODULE EXPORTS (FOR TESTING)
// ============================================

/**
 * Export functions for unit testing or Node.js environments
 * Only exports when module system is available
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadDiscordInfo,
        displayDiscordProfile,
        connectDiscord,
        disconnectDiscord,
        syncDiscordAvatar,
        escapeHtml,
        showDiscordMessage
    };
}