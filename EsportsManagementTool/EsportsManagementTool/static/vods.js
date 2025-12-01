/**
 * vods.js
 * ============================================================================
 * Handles all VOD (Video On Demand) functionality including:
 * - Loading and displaying team VODs from YouTube
 * - Video player controls and playback
 * - Adding new VODs with metadata
 * - Deleting VODs (admin/GM only)
 * - YouTube video ID extraction from URLs
 * ============================================================================
 */
// ============================================
// YOUTUBE IFRAME API INITIALIZATION
// ============================================

// Load YouTube IFrame API
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

var player;

function onYouTubeIframeAPIReady() {}


// ============================================
// GLOBAL STATE
// ============================================

/**
 * Currently selected team ID for VOD operations
 * Used to associate VODs with the correct team
 * @type {number|null}
 */
let currentTeamIdForVods = null;
let currentCommentTimestamp = null;

// ============================================
// VOD LOADING & DISPLAY
// ============================================

/**
 * Load and display all VODs for a specific team
 * Fetches VODs from API and renders them in the UI
 * Automatically plays the first video if available
 * @param {number} teamID - The team ID to load VODs for
 */
function loadTeamVods(teamID) {
    // Validate team ID is provided
    if (!teamID) return;

    // Store team ID for use in other functions
    currentTeamIdForVods = teamID;

    // Fetch VODs from API
    fetch(`/api/vods/team/${teamID}`)
        .then(response => response.json())
        .then(vods => {
            // Get DOM elements
            const vodsList = document.getElementById('vods-list');
            const vodsEmpty = document.getElementById('vods-empty');
            const videoPlayerContainer = document.getElementById('video-player-container');

            // Clear existing VOD list
            vodsList.innerHTML = '';

            // Handle empty state - no VODs available
            if (vods.length === 0) {
                vodsList.style.display = 'none';
                if (vodsEmpty) vodsEmpty.style.display = 'block';
                if (videoPlayerContainer) videoPlayerContainer.style.display = 'none';
                return;
            }

            // Show VODs list and hide empty state
            vodsList.style.display = 'grid';
            if (vodsEmpty) vodsEmpty.style.display = 'none';
            if (videoPlayerContainer) videoPlayerContainer.style.display = 'block';

            // Render each VOD as a clickable card
            vods.forEach(vod => {
                const vodItem = createVodElement(vod);
                vodsList.appendChild(vodItem);
            });
        })
        .catch(error => {
            // Handle errors and show error message
            console.error('Error loading VODs:', error);
            document.getElementById('vods-list').innerHTML =
                '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Error loading VODs.</p>';
        });
}

/**
 * Create a VOD card element with thumbnail, info, and delete button
 * @param {Object} vod - VOD object from API
 * @param {number} vod.id - VOD database ID
 * @param {string} vod.title - VOD title
 * @param {string} vod.thumbnail_url - YouTube thumbnail URL
 * @param {string} vod.opponent - Opponent name (optional)
 * @param {string} vod.match_date - Date of the match
 * @param {string} vod.youtube_video_id - YouTube video ID
 * @returns {HTMLElement} The created VOD card element
 */
function createVodElement(vod) {
    const vodItem = document.createElement('div');
    vodItem.className = 'vod-item';

    // Check if user has permission to delete VODs (admin or GM)
    const canDelete = window.userPermissions &&
                     (window.userPermissions.is_admin || window.userPermissions.is_gm);

    // Build VOD card HTML with conditional delete button
    vodItem.innerHTML = `
        <img src="${vod.thumbnail_url}" alt="${vod.title}">
        <div class="vod-info">
            <h4>${vod.title}</h4>
            <p>${vod.opponent ? 'vs ' + vod.opponent : ' '}</p>
            <small>Match Date - ${new Date(vod.match_date).toLocaleDateString()}</small>
        </div>
        ${canDelete ? `
            <button onclick="deleteVod(${vod.id}, event)" class="btn-delete-vod">
                <i class="fas fa-trash"></i>
            </button>
        ` : ''}
    `;

    // Add click handler to play video (except when clicking delete button)
    vodItem.onclick = (e) => {
        if (!e.target.closest('.btn-delete-vod')) {
            playVideo(vod);
        }
    };

    return vodItem;
}

// ============================================
// VIDEO PLAYER CONTROLS
// ============================================

/**
 * Load and play a VOD in the video player
 * Updates the YouTube embed iframe with the video ID
 * Updates the video title and metadata display
 * @param {Object} vod - VOD object to play
 * @param {string} vod.youtube_video_id - YouTube video ID
 * @param {string} vod.title - Video title
 * @param {string} vod.opponent - Opponent name (optional)
 */
function playVideo(vod) {
    // Update iframe source with YouTube embed URL
    const modal = document.getElementById('vodPlayerModal');
    const title = document.getElementById('vodPlayerTitle');
    const meta = document.getElementById('vodPlayerMeta');
    const playerContainer = document.getElementById('vodPlayerFrame');

    window.currentVod = vod;

    title.textContent = vod.title;
    meta.textContent = `${vod.opponent ? 'vs ' + vod.opponent : ''} * ${new Date(vod.match_date || vod.published_at).toLocaleDateString()}`;

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    const commentForm = document.getElementById('vodCommentForm');
    if (commentForm && (window.userPermissions?.is_admin || window.userPermissions?.is_gm)) {
        commentForm.style.display = 'block';
    } else if (commentForm) {
        commentForm.style.display = 'none';
    }

    if (player) {
        player.destroy();
        player = null;
    }

    playerContainer.innerHTML = '';

    player = new YT.Player('vodPlayerFrame', {
        videoId: vod.youtube_video_id,
        playerVars: {
            autplay: 1
        }
    });

    loadVodComments(vod.id);
}

function closeVodPlayerModal() {
    const modal = document.getElementById('vodPlayerModal');
    const player = document.getElementById('vodPlayerFrame');

    modal.style.display = 'none';
    document.body.style.overflow = 'auto';

    player.src ='';
}

// ============================================
// ADD VOD MODAL
// ============================================

/**
 * Open the Add VOD modal
 * Displays modal and prevents body scrolling
 */
function showAddVodModal() {
    document.getElementById('addVodModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

/**
 * Close the Add VOD modal and reset form
 * Hides modal, clears form fields, and restores scrolling
 */
function closeAddVodModal() {
    const modal = document.getElementById('addVodModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';

    // Reset form to clear all inputs
    document.getElementById('addVodForm').reset();

    // Clear any status messages
    const message = document.getElementById('addVodMessage');
    if (message) {
        message.style.display = 'none';
        message.textContent = '';
        message.className = 'form-message';
    }
}

// ============================================
// ADD VOD FUNCTIONALITY
// ============================================

/**
 * Handle Add VOD form submission
 * Validates input, extracts YouTube video ID, and submits to API
 * Shows loading state and success/error messages
 */
document.getElementById('addVodForm').addEventListener('submit', function(e) {
    e.preventDefault();

    // Validate that a team is selected
    if (!currentTeamIdForVods) {
        alert('No team selected! Please select a team first.');
        return;
    }

    // Get YouTube video input value
    let videoInput = document.getElementById('youtube_video_input').value.trim();

    // Extract video ID from various YouTube URL formats
    let videoId = extractYouTubeVideoId(videoInput);

    // Validate video ID was extracted
    if (!videoId) {
        showFormMessage('Invalid YouTube URL or video ID', 'error');
        return;
    }

    // Build request data
    const data = {
        youtube_video_id: videoId,
        match_date: document.getElementById('match_date').value,
        opponent: document.getElementById('opponent').value
    };

    // Show loading state
    setSubmitButtonLoading(true);

    // Submit VOD to API
    fetch(`/api/vods/team/${currentTeamIdForVods}/add`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                // Show success message
                showFormMessage('VOD added successfully!', 'success');

                // Close modal and reload VODs after brief delay
                setTimeout(() => {
                    closeAddVodModal();
                    loadTeamVods(currentTeamIdForVods);
                }, 1500);
            } else {
                // Show error message from server
                showFormMessage(result.error || 'Failed to add VOD', 'error');
            }
        })
        .catch(error => {
            // Handle network or other errors
            console.error('Error adding VOD:', error);
            showFormMessage('Error adding VOD. Please try again.', 'error');
        })
        .finally(() => {
            // Reset button to normal state
            setSubmitButtonLoading(false);
        });
});

/**
 * Extract YouTube video ID from various URL formats or use raw ID
 * Supports:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - Raw video ID (11 characters)
 * @param {string} input - YouTube URL or video ID
 * @returns {string|null} Extracted video ID or null if invalid
 */
function extractYouTubeVideoId(input) {
    // Handle empty input
    if (!input) return null;

    // Check if it's a URL (contains youtube.com or youtu.be)
    if (input.includes('youtube.com') || input.includes('youtu.be')) {
        // Extract from youtube.com/watch?v=VIDEO_ID format
        if (input.includes('v=')) {
            const videoId = input.split('v=')[1]?.split('&')[0];
            return videoId || null;
        }

        // Extract from youtu.be/VIDEO_ID format
        if (input.includes('youtu.be/')) {
            const videoId = input.split('youtu.be/')[1]?.split('?')[0];
            return videoId || null;
        }
    }

    // Assume it's already a video ID (11 characters for YouTube IDs)
    return input.length === 11 ? input : null;
}

/**
 * Show form message with appropriate styling
 * @param {string} message - Message text to display
 * @param {string} type - Message type: 'success' or 'error'
 */
function showFormMessage(message, type) {
    const messageElement = document.getElementById('addVodMessage');
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.className = `form-message ${type}`;
        messageElement.style.display = 'block';
    }
}

/**
 * Toggle submit button loading state
 * Shows spinner and disables button during submission
 * @param {boolean} isLoading - Whether to show loading state
 */
function setSubmitButtonLoading(isLoading) {
    const btnText = document.getElementById('addVodBtnText');
    const btnSpinner = document.getElementById('addVodBtnSpinner');
    const submitBtn = document.querySelector('#addVodForm button[type="submit"]');

    if (btnText && btnSpinner && submitBtn) {
        if (isLoading) {
            btnText.style.display = 'none';
            btnSpinner.style.display = 'inline-block';
            submitBtn.disabled = true;
        } else {
            btnText.style.display = 'inline';
            btnSpinner.style.display = 'none';
            submitBtn.disabled = false;
        }
    }
}

// ============================================
// DELETE VOD FUNCTIONALITY
// ============================================

/**
 * Delete a VOD after user confirmation
 * Shows confirmation dialog and makes delete API request
 * @param {number} vodId - VOD ID to delete
 * @param {Event} event - Click event (to stop propagation)
 */
function deleteVod(vodId, event) {
    // Prevent click from bubbling to parent VOD card
    if (event) event.stopPropagation();

    // Confirm deletion with user
    if (!confirm('Delete this VOD? This action cannot be undone.')) {
        return;
    }

    // Make delete API request
    fetch(`/api/vods/${vodId}`, {method: 'DELETE'})
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                // Reload VODs list to show updated data
                loadTeamVods(currentTeamIdForVods);
            } else {
                // Show error if deletion failed
                alert(result.error || 'Failed to delete VOD');
            }
        })
        .catch(error => {
            // Handle network or other errors
            console.error('Error deleting VOD:', error);
            alert('Error deleting VOD. Please try again.');
        });
}

// ============================================
// ADD TIMESTAMP TO COMMENTS
// ===========================================
function addTimestampToComment() {
    if (player && player.getCurrentTime) {
        const seconds = Math.floor(player.getCurrentTime());
        currentCommentTimestamp = seconds;

        // Format timestamp
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const formatted = `${minutes}:${secs.toString().padStart(2, '0')}`;

        document.getElementById('currentTimestamp').style.display = 'block';
        document.getElementById('timestampDisplay').textContent = formatted;
    }
}

// ============================================
// SUBMIT VOD COMMENTS WITH TIMESTAMP
// ============================================
function submitVodComment() {
    const commentText = document.getElementById('commentText').value.trim();

    if (!commentText) {
        alert('Please enter a comment!');
        return;
    }

    const data = {
        comment_text: commentText,
        timestamp_seconds: currentCommentTimestamp
    };

    fetch(`/api/vods/${window.currentVod.id}/comments`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                document.getElementById('commentText').value = '';
                currentCommentTimestamp = null;
                document.getElementById('currentTimestamp').style.display = 'none';

                loadVodComments(window.currentVod.id);
            } else {
                alert(result.error || 'Failed to post comment!');
            }
        })
        .catch(error => {
            console.error('Error posting comment:', error);
            alert('Error posting comment!')
        });
}

// ============================================
// LOAD AND DISPLAY COMMENTS
// ============================================
function loadVodComments(vodId) {
    fetch(`/api/vods/${vodId}/comments`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayVodComments(data.comments);
            }
        });
}

function displayVodComments(comments) {
    const commentsList = document.getElementById('vodCommentsList');

    if (comments.length === 0) {
        commentsList.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No feedback yet.</p>';
        return;
    }

    commentsList.innerHTML = '';

    comments.forEach(comment => {
        const commentDiv = document.createElement('div');
        commentDiv.className = 'vod-comment';

        let timestampHTML = '';
        if (comment.timestamp_seconds !== null) {
            const minutes = Math.floor(comment.timestamp_seconds / 60);
            const secs = comment.timestamp_seconds % 60;
            const formatted = `${minutes}:${secs.toString().padStart(2, '0')}`;

            timestampHTML = `
                <button class="comment-timestamp" onclick="seekToTimestamp(${comment.timestamp_seconds})">
                    <i class="fas fa-play-circle"></i> ${formatted}
                </button>
            `;
        }

        const profilePic = comment.profile_picture
            ? `<img src="/static/uploads/avatars/${comment.profile_picture}" alt="${comment.firstname}">`
            : `<div class="comment-avatar-initials">${comment.firstname[0]}${comment.lastname[0]}</div>`;

        commentDiv.innerHTML = `
            <div class="comment-header">
                ${profilePic}
                <div>
                    <strong>${comment.firstname} ${comment.lastname}</strong>
                    <small>${new Date(comment.created_at).toLocaleDateString()}</small>
                </div>
            </div>
            ${timestampHTML}
            <p>${comment.comment_text}</p>
        `;

        commentsList.appendChild(commentDiv);
    });
}

function seekToTimestamp(seconds) {
    if (player && player.seekTo) {
        player.seekTo(seconds, true);
    }
}


// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

/**
 * Make all functions globally accessible for:
 * - onclick handlers in HTML
 * - Other modules that need to call these functions
 * - Event handlers attached dynamically
 */
window.loadTeamVods = loadTeamVods;
window.playVideo = playVideo;
window.showAddVodModal = showAddVodModal;
window.closeAddVodModal = closeAddVodModal;
window.deleteVod = deleteVod;