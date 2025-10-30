/* ========================================
   DISCORD INTEGRATION JAVASCRIPT
   File: static/discord.js
   Description: Frontend logic for Discord OAuth integration
   ======================================== */

// Global variable to store Discord connection info
let discordInfo = null;

// Load Discord connection status when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Only load Discord info if we're on the dashboard page
    if (document.getElementById('discordLoading')) {
        loadDiscordInfo();
    }
});

/**
 * Load Discord connection information from the API
 * Displays loading state, then either connected or not connected state
 */
async function loadDiscordInfo() {
    const loadingDiv = document.getElementById('discordLoading');
    const notConnectedDiv = document.getElementById('discordNotConnected');
    const connectedDiv = document.getElementById('discordConnected');

    // Safety check - make sure elements exist
    if (!loadingDiv || !notConnectedDiv || !connectedDiv) {
        console.error('Discord UI elements not found');
        return;
    }

    // Show loading state
    loadingDiv.style.display = 'block';
    notConnectedDiv.style.display = 'none';
    connectedDiv.style.display = 'none';

    try {
        // Fetch Discord connection info from backend API
        const response = await fetch('/api/discord/info');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();

        // Hide loading state
        loadingDiv.style.display = 'none';

        if (data.success && data.connected) {
            // User has Discord connected - show their profile
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
        
        // Optionally show error message to user
        if (notConnectedDiv) {
            const errorMsg = document.createElement('p');
            errorMsg.style.color = '#ff5252';
            errorMsg.style.fontSize = '0.875rem';
            errorMsg.textContent = 'Failed to load Discord connection status';
            notConnectedDiv.querySelector('.empty-state').appendChild(errorMsg);
        }
    }
}

/**
 * Display Discord profile information in the UI
 * @param {Object} data - Discord profile data from API
 */
function displayDiscordProfile(data) {
    // Set avatar image or default icon
    const avatarContainer = document.getElementById('discordAvatarContainer');
    if (avatarContainer) {
        if (data.avatar_url) {
            avatarContainer.innerHTML = `<img src="${data.avatar_url}" alt="Discord Avatar" loading="lazy">`;
        } else {
            // Use default Discord icon if no avatar
            avatarContainer.innerHTML = `<i class="fab fa-discord"></i>`;
        }
    }

    // Set username with Discord icon
    const usernameEl = document.getElementById('discordUsername');
    if (usernameEl) {
        if (data.discriminator && data.discriminator !== '0') {
            // Old Discord username format (username#1234)
            usernameEl.innerHTML = `<i class="fab fa-discord"></i> ${escapeHtml(data.username)}#${escapeHtml(data.discriminator)}`;
        } else {
            // New Discord username format (@username)
            usernameEl.innerHTML = `<i class="fab fa-discord"></i> @${escapeHtml(data.username)}`;
        }
    }

    // Set Discord ID
    const idEl = document.getElementById('discordId');
    if (idEl) {
        idEl.textContent = `Discord ID: ${data.discord_id}`;
    }

    // Set connected date
    const dateTextEl = document.getElementById('connectedDateText');
    if (dateTextEl) {
        dateTextEl.textContent = data.connected_at;
    }
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Redirect user to Discord OAuth2 authorization page
 * User will be prompted to authorize the application on Discord
 */
function connectDiscord() {
    // Simple redirect to backend OAuth route
    window.location.href = '/discord/connect';
}

/**
 * Disconnect Discord account from user profile
 * Shows confirmation dialog before proceeding
 */
async function disconnectDiscord() {
    // Confirm user wants to disconnect
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
        
        // Show error message
        if (messageDiv) {
            messageDiv.textContent = error.message || 'Failed to disconnect Discord account. Please try again.';
            messageDiv.className = 'form-message error';
            messageDiv.style.display = 'block';
        }
    }
}
async function syncDiscordAvatar() {
    const messageDiv = document.getElementById('discordActionMessage');
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }

    try {
        const response = await fetch('/discord/sync-avatar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            if (messageDiv) {
                messageDiv.textContent = data.message || 'Avatar synced successfully!';
                messageDiv.className = 'form-message success';
                messageDiv.style.display = 'block';
            }

            // Reload to profile tab after 1.5 seconds
            setTimeout(() => {
                window.location.href = window.location.pathname + '#profile';
                window.location.reload();
            }, 1500);
        } else {
            throw new Error(data.message || 'Failed to sync avatar');
        }
    } catch (error) {
        console.error('Error syncing Discord avatar:', error);
        
        if (messageDiv) {
            messageDiv.textContent = error.message || 'Failed to sync profile picture. Make sure you have Discord connected.';
            messageDiv.className = 'form-message error';
            messageDiv.style.display = 'block';
        }
    }
}

/**
 * Utility function to show a temporary message
 * @param {string} message - Message to display
 * @param {string} type - Message type ('success' or 'error')
 * @param {number} duration - How long to show message (ms)
 */
function showDiscordMessage(message, type = 'success', duration = 3000) {
    const messageDiv = document.getElementById('discordActionMessage');
    if (!messageDiv) return;

    messageDiv.textContent = message;
    messageDiv.className = `form-message ${type}`;
    messageDiv.style.display = 'block';

    // Auto-hide after duration
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, duration);
}

// Export functions for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadDiscordInfo,
        displayDiscordProfile,
        connectDiscord,
        disconnectDiscord,
        syncDiscordAvatar,
        escapeHtml
    };
}