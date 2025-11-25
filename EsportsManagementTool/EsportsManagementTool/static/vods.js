/**
 * VODs JavaScript
 * Handles adding and viewing VODS
 */

let currentTeamIdForVods = null;

function loadTeamVods(teamID) {
    if (!teamID) return;
    currentTeamIdForVods = teamID;

    fetch(`/api/vods/team/${teamID}`)
        .then(response => response.json())
        .then(vods => {
            const vodsList = document.getElementById('vods-list');
            const vodsEmpty = document.getElementById('vods-empty');
            const videoPlayerContainer = document.getElementById('video-player-container');
            vodsList.innerHTML = '';

            if (vods.length === 0) {
                vodsList.style.display = 'none';
                if (vodsEmpty) vodsEmpty.style.display = 'block';
                if (videoPlayerContainer) videoPlayerContainer.style.display = 'none';
                return;
            }

            vodsList.style.display = 'grid';
            if (vodsEmpty) vodsEmpty.style.display = 'none';
            if (videoPlayerContainer) videoPlayerContainer.style.display = 'block';

            // PLay first video by default
            playVideo(vods[0]);

            vods.forEach(vod => {
                const vodItem = document.createElement('div');
                vodItem.className = 'vod-item';

                // Check window perms to see if user can delete.
                const canDelete = window.userPermissions && (window.userPermissions.is_admin || window.userPermissions.is_gm);

                vodItem.innerHTML = `
                    <img src="${vod.thumbnail_url}" alt="${vod.title}">
                    <div class="vod-info">
                    <h4>${vod.title}</h4>
                    <p>${vod.opponent ? 'vs ' + vod.opponent : ' '}</p>
                    <small>Match Date - ${new Date(vod.match_date).toLocaleDateString()}</small>
                </div>
                ${canDelete ? `<button onclick="deleteVod(${vod.id}, event)" class="btn-delete-vod">
                    <i class="fas fa-trash"></i>
                </button>` : ''}
                `;

                // Add click handler to play (not when clicking delete)
                vodItem.onclick = (e) => {
                    if (!e.target.closest('.btn-delete-vod')) {
                        playVideo(vod);
                    }
                };

                vodsList.appendChild(vodItem);
            });
        })
        .catch(error => {
            console.error('Error loading VODs:', error);
            document.getElementById('vods-list').innerHTML = '<p>Error loading VODs.</p>';
        });
}

function playVideo(vod) {
    const player = document.getElementById('video-player');
    player.src = `https://www.youtube.com/embed/${vod.youtube_video_id}`;
    document.getElementById('video-title').textContent = vod.title;
    document.getElementById('video-meta').textContent =
        `${vod.opponent ? 'vs ' + vod.opponent : ' '}`
}

function showAddVodModal() {
    document.getElementById('addVodModal').style.display = 'block';
}

function closeAddVodModal() {
    document.getElementById('addVodModal').style.display = 'none';
    document.getElementById('addVodForm').reset();
    // Clear messages
    const message = document.getElementById('addVodMessage');
    if (message) {
        message.style.display = 'none';
        message.textContent = '';
    }
}

document.getElementById('addVodForm').addEventListener('submit', function(e) {
    e.preventDefault();

    if (!currentTeamIdForVods) {
        alert('No team selected!');
    }

    let videoInput = document.getElementById('youtube_video_input').value;

    // Extracting video ID from URL or use the as-is if ID given.
    let videoId = videoInput.includes('youtube.com') || videoInput.includes('youtu.be')
        ? videoInput.split('v=')[1]?.split('&')[0] || videoInput.split('/').pop()
        : videoInput;

    const data = {
        youtube_video_id: videoId,
        match_date: document.getElementById('match_date').value,
        opponent: document.getElementById('opponent').value
    };

    // Show loading data
    const btnText = document.getElementById('addVodBtnText');
    const btnSpinner = document.getElementById('addVodBtnSpinner');
    if (btnText) btnText.style.display = 'none';
    if (btnSpinner) btnSpinner.style.display = 'inline-block';

    fetch(`/api/vods/team/${currentTeamIdForVods}/add`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                const message = document.getElementById('addVodMessage');
                if (message) {
                    message.textContent = 'VOD added successfully!';
                    message.className = 'form-message success';
                    message.style.display = 'block';
                }

                setTimeout(() => {
                    closeAddVodModal();
                    loadTeamVods(currentTeamIdForVods);
                }, 1500);
            } else {
                // Show error message
                const message = document.getElementById('addVodMessage');
                if (message) {
                    message.textContent = result.error || 'Failed to add VOD';
                    message.className = 'form-message error';
                    message.style.display = 'block';
                }
            }
        })
        .catch(error => {
            console.error('Error adding VOD:', error);
            const message = document.getElementById('addVodMessage');
            if (message) {
                message.textContent = 'Error adding VOD';
                message.className = 'form-message error';
                message.style.display = 'block';
            }
        })
        .finally(() => {
            //Reset button state
            if (btnText) btnText.style.display = 'inline';
            if (btnSpinner) btnSpinner.style.display = 'none';
        });
});

function deleteVod(vodId ,event) {
    if (event) event.stopPropagation();

    if (!confirm('Delete this VOD? This action cannot be undone.')) return;

    fetch(`/api/vods/${vodId}`, {method: 'DELETE'})
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                loadTeamVods(currentTeamIdForVods);
            }
        })
        .catch(error => console.error('Error deleting VOD:', error));
}

window.onclick = function(event) {
    const modal = document.getElementById('addVodModal');
    if (event.target === modal) {
        closeAddVodModal();
    }
}