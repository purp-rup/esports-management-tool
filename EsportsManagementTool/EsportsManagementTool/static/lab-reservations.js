/**
 * lab_reservations.js
 * ============================================================================
 * Logic specific to lab reservations. Currently: the capacity bar + status
 * message shown in the create reservation modal, which updates whenever the
 * user changes the lab, priority, or time window.
 * ============================================================================
 */

// Maps a lab_status display string to how much of the bar it fills
const LAB_CAPACITY_FRACTIONS = {
    '5 Computers or Less': 0.25,
    'Half Lab': 0.5,
    'Whole Lab': 1
};

let labAvailabilityDebounceTimer = null;

/**
 * Wire up listeners on the fields that affect lab capacity so the
 * indicator updates whenever the user changes date or time.
 * Lab/priority selection is handled separately via SingleSelectConfig's
 * onSelect hook, since those aren't native inputs.
 * Called once when the create lab reservation modal opens.
 */
function initializeLabCapacityChecks() {
    ['labReservationDate', 'labStartTime', 'labEndTime'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', onLabReservationFieldChanged);
    });
}

/** Debounce so rapid changes don't spam the endpoint */
function scheduleLabAvailabilityCheck() {
    clearTimeout(labAvailabilityDebounceTimer);
    labAvailabilityDebounceTimer = setTimeout(checkLabAvailability, 200);
}

/** Clears a lingering blocked/error message in the form once the user starts changing fields again */
function clearLabReservationBlockMessage() {
    const formMessage = document.getElementById('labReservationFormMessage');
    if (formMessage && formMessage.classList.contains('error')) {
        formMessage.textContent = '';
        formMessage.style.display = 'none';
        formMessage.className = 'form-message';
    }
}

/** Called on any field change: clears a stale block message immediately, then re-runs the capacity check */
function onLabReservationFieldChanged() {
    clearLabReservationBlockMessage();
    scheduleLabAvailabilityCheck();
}

/** Reset the capacity indicator to its default instructional state (bar empty, info message) */
function resetLabCapacityIndicator() {
    const fill = document.getElementById('labCapacityBarFill');
    const selectedFill = document.getElementById('labCapacitySelectedFill');
    const message = document.getElementById('labCapacityMessage');

    if (fill) {
        fill.style.width = '0%';
        fill.className = 'lab-capacity-bar-fill';
    }
    if (selectedFill) {
        selectedFill.style.width = '0%';
    }
    if (message) {
        message.textContent = 'Please fill out a reservation form to see if the lab is reserved for your time. The bar above will help indicate whether the lab is in use or not.';
        message.className = 'lab-capacity-message lab-capacity-message--info';
    }
}

/**
 * Fetch overlapping reservations for the currently selected lab/date/time
 * and update the capacity bar + message accordingly.
 */
async function checkLabAvailability() {
    const labChoice = document.getElementById('labChoice')?.value;
    const date = document.getElementById('labReservationDate')?.value;
    const startTime = document.getElementById('labStartTime')?.value;
    const endTime = document.getElementById('labEndTime')?.value;

    // Required fields: lab + date + start + end
    if (!labChoice || !date || !startTime || !endTime) {
        resetLabCapacityIndicator();
        return;
    }

    try {
        const params = new URLSearchParams({
            lab_choice: labChoice,
            reservation_date: date,
            start_time: startTime,
            end_time: endTime
        });

        if (typeof editingLabReservationId !== 'undefined' && editingLabReservationId) {
            params.set('exclude_id', editingLabReservationId);
        }

        const response = await fetch(`/api/lab-reservations/availability?${params.toString()}`);
        const data = await response.json();

        renderLabCapacityIndicator(data.overlaps || []);
    } catch (error) {
        console.error('Error checking lab availability:', error);
        const message = document.getElementById('labCapacityMessage');
        const fill = document.getElementById('labCapacityBarFill');
        if (fill) fill.style.width = '0%';
        if (message) {
            message.textContent = 'Could not check lab availability right now.';
            message.className = 'lab-capacity-message lab-capacity-message--blocked';
        }
    }
}

/**
 * Render the bar fill + message based on any overlapping reservations
 * found for the selected lab/date/time.
 *
 * V1 rule (to be refined with priority-based override logic): any overlap
 * blocks the reservation; the bar reflects the largest-capacity
 * overlapping reservation found.
 */
function renderLabCapacityIndicator(overlaps) {
    const fill = document.getElementById('labCapacityBarFill');
    const selectedFill = document.getElementById('labCapacitySelectedFill');
    const message = document.getElementById('labCapacityMessage');
    if (!fill || !selectedFill || !message) return;

    // How much of the bar the reservation currently being filled out would occupy
    const selectedStatus = document.getElementById('labStatus')?.value;
    const selectedFraction = LAB_CAPACITY_FRACTIONS[selectedStatus] || 0;
    selectedFill.style.width = `${selectedFraction * 100}%`;

    if (overlaps.length === 0) {
        fill.style.width = '0%';
        fill.className = 'lab-capacity-bar-fill';
        message.textContent = 'This time slot is open for the selected lab.';
        message.className = 'lab-capacity-message lab-capacity-message--open';
        return;
    }

    // Sum every overlapping reservation's capacity footprint, capped at a full bar
    const totalFraction = Math.min(
        1,
        overlaps.reduce((sum, res) => sum + (LAB_CAPACITY_FRACTIONS[res.lab_status] || 0), 0)
    );

    fill.style.width = `${totalFraction * 100}%`;
    fill.className = `lab-capacity-bar-fill lab-capacity-bar-fill--${getCapacityColorKey(totalFraction)}`;

    // How much room is left, and the largest option that still fits in it
    const remainingFraction = Math.max(0, 1 - totalFraction);
    const maxAvailableStatus = getMaxAvailableLabStatus(remainingFraction);

    // Compare against whatever lab status the user currently has selected (if any yet)
    const exceedsCapacity = selectedStatus && selectedFraction > remainingFraction;

    // One line per conflicting reservation: time range, who booked it, and its lab status
    const conflictLines = overlaps.map(res => {
        const timeRange = `${res.start_time} - ${res.end_time}`;
        const bookedBy = res.first_name
            ? `${escapeHtml(res.first_name)}${res.username ? ` (${escapeHtml(res.username)})` : ''}`
            : 'someone';
        return `<div class="lab-capacity-conflict-line">${timeRange} (${escapeHtml(res.lab_status)}) — booked by ${bookedBy}</div>`;
    }).join('');

    const availabilityLine = maxAvailableStatus
        ? `<div class="lab-capacity-availability-line">You can still reserve up to: ${maxAvailableStatus}</div>`
        : `<div class="lab-capacity-availability-line">This lab is fully booked for this time.</div>`;

    message.innerHTML = `
        <div>This lab already has ${overlaps.length > 1 ? 'reservations' : 'a reservation'} during this time:</div>
        ${conflictLines}
        ${availabilityLine}
    `;
    message.className = `lab-capacity-message lab-capacity-message--${exceedsCapacity ? 'blocked' : 'partial'}`;
}

/** Returns the largest lab_status option that still fits within the remaining fraction, or null if nothing fits */
function getMaxAvailableLabStatus(remainingFraction) {
    const tiersDescending = Object.entries(LAB_CAPACITY_FRACTIONS).sort((a, b) => b[1] - a[1]);

    for (const [status, frac] of tiersDescending) {
        if (frac <= remainingFraction) return status;
    }
    return null;
}

/** Maps a lab_status display string to a short CSS-friendly key (used for per-conflict lines) */
function getLabStatusKey(labStatus) {
    const map = {
        '5 Computers or Less': 'quarter',
        'Half Lab': 'half',
        'Whole Lab': 'full'
    };
    return map[labStatus] || 'full';
}

/** Maps an aggregate capacity fraction (0-1) to a bar color tier */
function getCapacityColorKey(totalFraction) {
    if (totalFraction <= 0.5) return 'green';
    if (totalFraction <= 0.75) return 'yellow';
    return 'red';
}

/** Minimal HTML escaping for text interpolated into innerHTML (first names, lab status) */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Renders a persistent lab reservation impact notice. Visually matches the
 * blue info toast from notifications.js and stacks through the same
 * NotificationQueue, but does not auto-dismiss - it stays until the user
 * clicks the X, which deletes it server-side so it never reappears.
 */
function renderLabReservationNotice(notice) {
    const card = document.createElement('div');
    card.dataset.noticeId = notice.notice_id;

    card.innerHTML = `
        <i class="fas fa-info-circle"></i>
        <p style="margin: 0; flex: 1; line-height: 1.4;">${escapeHtml(notice.message)}</p>
        <button type="button" class="lab-notice-dismiss" aria-label="Dismiss">
            <i class="fas fa-times"></i>
        </button>
    `;

    card.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        font-size: 0.9375rem;
        font-weight: 500;
        max-width: 400px;
        background: #3b82f6;
        border: 1px solid #2563eb;
        color: white;
        transform: translateX(400px);
        opacity: 0;
        transition: all 0.3s ease-out;
    `;

    document.body.appendChild(card);
    window.NotificationQueue.add(card);

    requestAnimationFrame(() => {
        setTimeout(() => {
            card.style.transform = 'translateX(0)';
            card.style.opacity = '1';
        }, 50);
    });

    card.querySelector('.lab-notice-dismiss').addEventListener('click', () => {
        dismissLabReservationNotice(notice.notice_id, card);
    });
}

/** Permanently dismiss a notice: tell the server, then remove it from view */
async function dismissLabReservationNotice(noticeId, cardEl) {
    cardEl.style.opacity = '0';
    cardEl.style.transform = 'translateX(400px)';

    try {
        await fetch(`/api/lab-reservations/notices/${noticeId}`, { method: 'DELETE' });
    } catch (error) {
        console.error('Failed to dismiss lab reservation notice:', error);
    }

    setTimeout(() => {
        window.NotificationQueue.remove(cardEl);
        cardEl.remove();
    }, 300);
}

/** On page load, fetch and display any pending lab reservation impact notices */
async function loadLabReservationNotices() {
    try {
        const response = await fetch('/api/lab-reservations/notices');
        const data = await response.json();
        (data.notices || []).forEach(notice => renderLabReservationNotice(notice));
    } catch (error) {
        console.error('Failed to load lab reservation notices:', error);
    }
}

document.addEventListener('DOMContentLoaded', loadLabReservationNotices);

// Cache of the current user's own reservations, keyed by id, so edit/delete
// don't need a network round-trip just to know what they're acting on
let myLabReservationsCache = {};

/** Fetch and render the current user's upcoming reservations */
async function loadMyLabReservations() {
    try {
        const response = await fetch('/api/lab-reservations/mine');
        const data = await response.json();
        const reservations = data.reservations || [];

        myLabReservationsCache = {};
        reservations.forEach(res => { myLabReservationsCache[res.id] = res; });

        renderMyReservationsList(reservations);
    } catch (error) {
        console.error('Error loading my lab reservations:', error);
        renderMyReservationsList([]);
    }
}

// Limits the amount of visible reservations in the My Reservations section before a scrollbar appears
const MY_RESERVATIONS_VISIBLE_COUNT = 3;

function renderMyReservationsList(reservations) {
    const container = document.getElementById('myReservationsList');
    if (!container) return;

    container.style.maxHeight = '';

    if (reservations.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">No upcoming reservations</p>';
        return;
    }

    container.innerHTML = reservations.map(res => {
        const labKey = getLabChoiceKey(res.lab_choice);
        const priorityKey = (res.priority || '').toLowerCase();
        const title = res.game_name ? `${res.lab_choice} · ${res.game_name}` : res.lab_choice;

        return `
            <div class="my-reservation-pill" data-lab-choice="${labKey}" data-priority="${priorityKey}">
                <div class="my-reservation-pill-info">
                    <div class="my-reservation-pill-title">${escapeHtml(title)}</div>
                    <div class="my-reservation-pill-meta">${escapeHtml(res.date_display)} · ${escapeHtml(res.time_display)}</div>
                </div>
                <div class="my-reservation-pill-actions">
                    <button type="button" class="events-detail-banner-btn" title="Edit" onclick="editMyLabReservation(${res.id})">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button type="button" class="events-detail-banner-btn delete" title="Delete" onclick="confirmDeleteMyLabReservation(${res.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    capMyReservationsListHeight(container, reservations.length);
}

/**
 * Caps the list's height to exactly fit MY_RESERVATIONS_VISIBLE_COUNT pills
 * (measured from the actual rendered elements, not a guessed pixel value),
 * so a 4th+ entry scrolls instead of partially showing or leaving a gap.
 */
function capMyReservationsListHeight(container, itemCount) {
    if (itemCount <= MY_RESERVATIONS_VISIBLE_COUNT) return;

    const pills = container.querySelectorAll('.my-reservation-pill');
    const gap = parseFloat(getComputedStyle(container).rowGap) || 0;

    let totalHeight = 0;
    for (let i = 0; i < MY_RESERVATIONS_VISIBLE_COUNT && i < pills.length; i++) {
        totalHeight += pills[i].offsetHeight;
        if (i > 0) totalHeight += gap;
    }

    container.style.maxHeight = `${totalHeight}px`;
}

/** Open the create/edit modal pre-filled with an existing reservation's data */
function editMyLabReservation(reservationId) {
    const reservation = myLabReservationsCache[reservationId];
    if (!reservation) return;
    openCreateLabReservationModal(reservation);
}

/** Confirm + delete, reusing the universal delete-confirm modal from modals.js */
function confirmDeleteMyLabReservation(reservationId) {
    const reservation = myLabReservationsCache[reservationId];
    if (!reservation) return;

    openDeleteConfirmModal({
        title: 'Delete Reservation?',
        itemName: reservation.lab_choice,
        message: `Are you sure you want to delete this ${reservation.lab_choice} reservation?`,
        buttonText: 'Delete Reservation',
        itemId: reservationId,
        onConfirm: async (id) => {
            try {
                const response = await fetch(`/api/lab-reservations/${id}`, { method: 'DELETE' });
                const data = await response.json();

                if (response.ok && data.success) {
                    closeDeleteConfirmModal();
                    showDeleteSuccessMessage(data.message || 'Lab reservation deleted.');
                    loadMyLabReservations();
                    if (typeof currentCalendarView !== 'undefined' && currentCalendarView === 'labs') {
                        loadCalendarLabReservations();
                    }
                } else {
                    throw new Error(data.message || 'Failed to delete reservation');
                }
            } catch (error) {
                console.error('Error deleting lab reservation:', error);
                showDeleteErrorMessage(error.message || 'Failed to delete reservation.');
                closeDeleteConfirmModal();
            }
        }
    });
}

/**
 * Builds the "Let X know..." message text for the impact notification.
 * Actually displaying it reuses showInfoMessage() from notifications.js,
 * which already gives the right blue card + queue stacking.
 */
function buildLabImpactMessage(names) {
    const namesText = names.length > 1
        ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
        : names[0];

    return `Let ${namesText} know their reservation${names.length > 1 ? 's were' : ' was'} impacted.`;
}