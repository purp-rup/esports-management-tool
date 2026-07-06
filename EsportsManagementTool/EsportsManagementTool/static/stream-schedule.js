/**
 * ============================================================================
 *   - Stream schedule sidebar on the landing page
 *   - Stream management modal in the admin panel
 * ============================================================================
 */

// ============================================
// UTILITY
// ============================================

/**
 * XSS-safe text escape
 * @param {string} text
 * @returns {string}
 */
function _escStream(text) {
    const node = document.createElement('div');
    node.appendChild(document.createTextNode(String(text)));
    return node.innerHTML;
}

/**
 * Format a "HH:MM:SS" or "HH:MM" time string (e.g. "7:00 PM")
 * @param {string} timeStr
 * @returns {string}
 */
function _formatStreamTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Format a "YYYY-MM-DD" date string (e.g. Jun 5)
 * Parses at midnight local time to avoid timezone-shift date errors
 * @param {string} dateStr
 * @returns {string}
 */
function _formatStreamDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================
// INDEX PAGE
// ============================================

/**
 * Fetch upcoming streams and render the sidebar.
 * If no streams are scheduled the sidebar stays hidden and
 * the calendar fills the full width automatically.
 */
async function loadStreamSidebar() {
    const sidebar  = document.getElementById('streamScheduleSidebar');
    if (!sidebar) return;

    try {
        const response = await fetch('/api/streams/upcoming');
        const data = await response.json();

        if (!data.success || !data.streams || data.streams.length === 0) {
            // Sidebar stays display: none
            return;
        }

        const list = document.getElementById('streamList');
        list.innerHTML = '';
        data.streams.forEach(s => list.appendChild(_createStreamRow(s)));

        sidebar.style.display = 'flex';

    } catch (err) {
        console.error('Error loading stream sidebar:', err);
    }
}

/**
 * Build a single compact sidebar row
 * @param {Object} stream
 * @returns {HTMLElement}
 */
function _createStreamRow(stream) {
    const row = document.createElement('div');
    row.className = 'stream-row';
    const isTwitch = stream.platform === 'twitch';

    row.innerHTML = `
        <div class="stream-row-left">
            <i class="fab ${isTwitch ? 'fa-twitch twitch-icon' : 'fa-youtube youtube-icon'}"></i>
        </div>
        <div class="stream-row-right">
            <span class="stream-name">${_escStream(stream.stream_name)}</span>
            <div class="stream-row-right-date-time">
                ${_formatStreamDate(stream.stream_date)} &bull; ${_formatStreamTime(stream.stream_time)}
            </div>
        </div>
    `;

    return row;
}

// ============================================
// ADMIN PANEL
// ============================================

// Tracks which stream is being edited; null means the form is in Add mode
let _currentEditStreamId = null;

/**
 * Open the stream management modal and load current entries
 */
async function openManageStreamsModal() {
    const modal = document.getElementById('manageStreamsModal');
    if (!modal) return;
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    await _loadAdminStreams();
}

/**
 * Close the stream management modal and reset the form
 */
function closeManageStreamsModal() {
    const modal = document.getElementById('manageStreamsModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';

    const form = document.getElementById('addStreamForm');
    if (form) form.reset();
    const msg = document.getElementById('streamFormMessage');
    if (msg) msg.style.display = 'none';
}

/**
 * Fetch and render upcoming streams inside the admin modal list
 */
async function _loadAdminStreams() {
    const listDiv = document.getElementById('adminStreamList');
    const loadingDiv = document.getElementById('adminStreamLoading');
    if (!listDiv || !loadingDiv) return;

    loadingDiv.style.display = 'block';
    listDiv.style.display    = 'none';

    try {
        const response = await fetch('/api/streams/upcoming');
        const data = await response.json();

        loadingDiv.style.display = 'none';
        listDiv.style.display = 'flex';

        if (!data.success || !data.streams || data.streams.length === 0) {
            listDiv.innerHTML = '<p class="streams-empty-text">No streams scheduled yet.</p>';
            return;
        }

        listDiv.innerHTML = '';
        data.streams.forEach(s => listDiv.appendChild(_createAdminStreamRow(s)));

    } catch (err) {
        console.error('Error loading admin streams:', err);
        loadingDiv.style.display = 'none';
        listDiv.innerHTML = '<p class="streams-empty-text">Failed to load streams.</p>';
        listDiv.style.display = 'flex';
    }
}

/**
 * Build an admin list row for a single stream entry
 * @param {Object} stream
 * @returns {HTMLElement}
 */
function _createAdminStreamRow(stream) {
    const row = document.createElement('div');
    row.className = 'admin-stream-row';
    const isTwitch = stream.platform === 'twitch';

    row.innerHTML = `
        <div class="admin-stream-info">
            <i class="fab ${isTwitch ? 'fa-twitch twitch-icon' : 'fa-youtube youtube-icon'}"></i>
            <div class="admin-stream-details">
                <span class="admin-stream-name">${_escStream(stream.stream_name)}</span>
                <span class="admin-stream-datetime">
                    ${_formatStreamDate(stream.stream_date)} &bull; ${_formatStreamTime(stream.stream_time)}
                </span>
            </div>
        </div>
        <div class="admin-stream-actions">
            <button class="btn-stream-edit" title="Edit stream">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn-stream-delete" title="Remove stream">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    row.querySelector('.btn-stream-edit').addEventListener('click', () => editStream(stream));
    row.querySelector('.btn-stream-delete').addEventListener('click', () => deleteStream(stream.stream_id));

    return row;
}

/**
 * Handle add-stream form submission
 * @param {Event} e
 */
async function _submitAddStream(e) {
    e.preventDefault();

    const msgDiv = document.getElementById('streamFormMessage');
    const submitBtn = document.getElementById('addStreamSubmitBtn');
    const btnText = document.getElementById('addStreamBtnText');
    const spinner = document.getElementById('addStreamSpinner');

    submitBtn.disabled = true;
    btnText.style.display = 'none';
    spinner.style.display = 'inline-block';
    msgDiv.style.display = 'none';

    const payload = {
        stream_name: document.getElementById('streamName').value.trim(),
        stream_date: document.getElementById('streamDate').value,
        stream_time: document.getElementById('streamTime').value,
        platform:    document.getElementById('streamPlatform').value
    };

    const isEditing = _currentEditStreamId !== null;
    const url = isEditing ? `/api/streams/${_currentEditStreamId}` : '/api/streams';
    const method = isEditing ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.success) {
            cancelEditStream();
            await _loadAdminStreams();
        } else {
            msgDiv.textContent = data.message || 'Failed to save stream.';
            msgDiv.className = 'form-message error';
            msgDiv.style.display = 'block';
        }
    } catch (err) {
        console.error('Error saving stream:', err);
        msgDiv.textContent = 'An error occurred. Please try again.';
        msgDiv.className = 'form-message error';
        msgDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        spinner.style.display = 'none';
    }
}

/**
 * Populate the form with an existing stream's data and switch to edit mode
 * @param {Object} stream - The full stream data object
 */
function editStream(stream) {
    _currentEditStreamId = stream.stream_id;

    document.getElementById('streamName').value     = stream.stream_name;
    document.getElementById('streamDate').value     = stream.stream_date;
    document.getElementById('streamTime').value     = stream.stream_time;
    document.getElementById('streamPlatform').value = stream.platform;

    document.getElementById('addStreamPanelTitle').textContent = 'Edit Stream';
    document.getElementById('addStreamBtnText').textContent    = 'Save Changes';
    document.getElementById('cancelEditBtn').style.display     = 'inline-flex';

    document.getElementById('addStreamForm')
        .scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Reset the form back to Add mode, clearing any edit state
 */
function cancelEditStream() {
    _currentEditStreamId = null;

    document.getElementById('addStreamForm').reset();
    document.getElementById('addStreamPanelTitle').textContent = 'Add Stream';
    document.getElementById('addStreamBtnText').textContent    = 'Add Stream';
    document.getElementById('cancelEditBtn').style.display     = 'none';

    const msg = document.getElementById('streamFormMessage');
    if (msg) msg.style.display = 'none';
}

/**
 * Delete a stream entry by ID, then refresh the admin list
 * @param {number} streamId
 */
async function deleteStream(streamId) {
    try {
        const response = await fetch(`/api/streams/${streamId}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            await _loadAdminStreams();
        } else {
            alert(data.message || 'Failed to remove stream.');
        }
    } catch (err) {
        console.error('Error deleting stream:', err);
        alert('An error occurred. Please try again.');
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('streamScheduleSidebar')) {
        loadStreamSidebar();
    }

    const form = document.getElementById('addStreamForm');
    if (form) form.addEventListener('submit', _submitAddStream);
});

// ============================================
// EXPORTS
// ============================================
window.loadStreamSidebar = loadStreamSidebar;
window.openManageStreamsModal = openManageStreamsModal;
window.closeManageStreamsModal = closeManageStreamsModal;
window.deleteStream = deleteStream;
window.editStream = editStream;
window.cancelEditStream = cancelEditStream;