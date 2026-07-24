/**
 * ========================
 * SOCIALS LINKS
 * ========================
 *
 * - Socials management modal on admin panel
 * - Socials card strip on landing page
 * - Socials cards with links on landing page
 */

function openManageSocialsModal() {
    const modal = document.getElementById('manageSocialsModal');
    if (!modal) return;
    modal.style.display = 'flex';
    lockBodyScroll('manageSocialsModal');
    loadSocialLinksAdmin();
}

function closeManageSocialsModal() {
    const modal = document.getElementById('manageSocialsModal');
    if (!modal) return;
    modal.style.display = 'none';
    unlockBodyScroll('manageSocialsModal');
    cancelAddCustomSocialLink();
}

// Fetches and renders the current social links in the admin modal
async function loadSocialLinksAdmin() {
    const loading = document.getElementById('socialLinksLoading');
    const list = document.getElementById('socialLinksList');
    if (!loading || !list) return;

    loading.style.display = 'block';
    list.style.display = 'none';

    try {
        const res = await fetch('/social-links/all');
        const data = await res.json();

        if (res.ok) {
            renderSocialLinksAdmin(data.links);
        } else {
            showSocialLinksMessage(data.error || 'Failed to load social links', true);
        }
    } catch (e) {
        console.error('Error loading social links:', e);
        showSocialLinksMessage('Failed to load social links. Please try again.', true);
    } finally {
        loading.style.display = 'none';
    }
}

function renderSocialLinksAdmin(links) {
    const list = document.getElementById('socialLinksList');
    if (!list) return;

    list.style.display = 'flex';
    list.innerHTML = links.map(renderSocialLinkRow).join('');
}

function renderSocialLinkRow(link) {
    const meta = getSocialPlatformMeta(link.link_name);
    const hasUrl = !!link.url;

    const inputGroup = hasUrl
        ? `<input type="text" class="partnership-manage-input" value="${link.url}" readonly>
           <button class="partnership-manage-btn delete" onclick="removeSocialLink(${link.link_id})" title="Remove link">
               <i class="fas fa-times"></i>
           </button>`
        : `<input type="text" class="partnership-manage-input" id="socialLinkInput${link.link_id}" placeholder="Add Link Here">
           <button class="partnership-manage-btn confirm" onclick="submitSocialLink(${link.link_id})" title="Add link">
               <i class="fas fa-check"></i>
           </button>`;

    const deleteCustomBtn = !link.is_default
        ? `<button class="partnership-manage-btn delete" onclick="deleteCustomSocialLink(${link.link_id})" title="Delete this custom link">
               <i class="fas fa-trash"></i>
           </button>`
        : '';

    return `
        <div class="social-link-row" data-platform="${meta.slug}">
            <div class="social-link-icon"><i class="${meta.icon}"></i></div>
            <div class="social-link-name">${link.link_name}</div>
            <div class="social-link-input-group">
                ${inputGroup}
                ${deleteCustomBtn}
            </div>
        </div>
    `;
}

// Adds a link to a default platform row
async function submitSocialLink(linkId) {
    const input = document.getElementById(`socialLinkInput${linkId}`);
    const url = input?.value.trim();
    if (!url) return;

    try {
        const res = await fetch(`/social-links/${linkId}/link`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();

        if (res.ok) {
            loadSocialLinksAdmin();
        } else {
            showSocialLinksMessage(data.error || 'Failed to add link', true);
        }
    } catch {
        showSocialLinksMessage('Failed to add link', true);
    }
}

// Clears the link on a default platform row (row itself stays)
async function removeSocialLink(linkId) {
    try {
        const res = await fetch(`/social-links/${linkId}/link`, { method: 'DELETE' });
        const data = await res.json();

        if (res.ok) {
            loadSocialLinksAdmin();
        } else {
            showSocialLinksMessage(data.error || 'Failed to remove link', true);
        }
    } catch {
        showSocialLinksMessage('Failed to remove link', true);
    }
}

function openAddCustomSocialForm() {
    document.getElementById('socialLinkCustomForm').style.display = 'flex';
    document.getElementById('socialLinkAddCustomBtn').style.display = 'none';
}

function cancelAddCustomSocialLink() {
    const form = document.getElementById('socialLinkCustomForm');
    const btn = document.getElementById('socialLinkAddCustomBtn');
    if (!form || !btn) return;
    form.style.display = 'none';
    btn.style.display = 'block';
    document.getElementById('socialLinkCustomName').value = '';
    document.getElementById('socialLinkCustomUrl').value = '';
}

// Creates a brand-new custom link row
async function submitCustomSocialLink() {
    const link_name = document.getElementById('socialLinkCustomName')?.value.trim();
    const url = document.getElementById('socialLinkCustomUrl')?.value.trim();

    if (!link_name || !url) {
        showSocialLinksMessage('A name and URL are required', true);
        return;
    }

    try {
        const res = await fetch('/social-links/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ link_name, url })
        });
        const data = await res.json();

        if (res.ok) {
            cancelAddCustomSocialLink();
            loadSocialLinksAdmin();
        } else {
            showSocialLinksMessage(data.error || 'Failed to create link', true);
        }
    } catch {
        showSocialLinksMessage('Failed to create link', true);
    }
}

// Fully removes a custom link row
async function deleteCustomSocialLink(linkId) {
    try {
        const res = await fetch(`/social-links/${linkId}`, { method: 'DELETE' });
        const data = await res.json();

        if (res.ok) {
            loadSocialLinksAdmin();
        } else {
            showSocialLinksMessage(data.error || 'Failed to delete link', true);
        }
    } catch {
        showSocialLinksMessage('Failed to delete link', true);
    }
}

function showSocialLinksMessage(message, isError) {
    const el = document.getElementById('socialLinksMessage');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    el.className = isError ? 'form-message form-message--error' : 'form-message form-message--success';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

/**
 * ========================================
 * Public landing page social links strip
 * ========================================
 */
const SOCIAL_CTA_PHRASES = {
    discord: 'Join our Discord!',
    youtube: 'Visit our channel!',
    instagram: 'Follow us!',
    twitch: 'Follow us!',
    twitter: 'Follow us!',
    tiktok: 'Follow us!'
};

function getSocialCtaPhrase(linkName) {
    const key = linkName.trim().toLowerCase();
    return SOCIAL_CTA_PHRASES[key] || 'Check this out!';
}

document.addEventListener('DOMContentLoaded', initLandingSocialsStrip);

// Constructs the landing page strip containing all socials cards
async function initLandingSocialsStrip() {
    const strip = document.getElementById('socialLinksStrip');
    const track = document.getElementById('socialLinksTrack');
    if (!strip || !track) return;

    try {
        const res = await fetch('/social-links/all');
        const data = await res.json();

        if (!res.ok) {
            strip.style.display = 'none';
            return;
        }

        // Only render links an admin has actually filled in
        const activeLinks = (data.links || []).filter(link => !!link.url);

        if (!activeLinks.length) {
            strip.style.display = 'none';
            return;
        }

        /*
         * Render the set once for desktop's static row, then a second, hidden-on-desktop
         * copy so mobile can loop the marquee seamlessly.
         */
        const cardsHtml = activeLinks.map(link => renderSocialCard(link, false)).join('');
        const duplicateCardsHtml = activeLinks.map(link => renderSocialCard(link, true)).join('');
        track.innerHTML = cardsHtml + duplicateCardsHtml;

        // Only matters on mobile (desktop has no animation applied), but harmless either way
        track.style.animationDuration = `${activeLinks.length * 4}s`;
    } catch (e) {
        console.error('Error loading social links strip:', e);
        strip.style.display = 'none';
    }
}

// Builds a single social link card. isDuplicate marks the second, mobile-marquee-only copy.
function renderSocialCard(link, isDuplicate) {
    const meta = getSocialPlatformMeta(link.link_name);
    const cta = getSocialCtaPhrase(link.link_name);
    const duplicateClass = isDuplicate ? ' social-card--duplicate' : '';
    const ariaHidden = isDuplicate ? ' aria-hidden="true" tabindex="-1"' : '';

    return `
        <a class="social-card${duplicateClass}" data-platform="${meta.slug}" href="${link.url}" target="_blank" rel="noopener noreferrer"${ariaHidden}>
            <div class="social-card-icon"><i class="${meta.icon}"></i></div>
            <div class="social-card-text">
                <span class="social-card-name">${link.link_name}</span>
                <span class="social-card-cta">${cta}</span>
            </div>
        </a>
    `;
}

// ============================================
// EXPORT FUNCTIONS
// ============================================
window.openManageSocialsModal = openManageSocialsModal;
window.closeManageSocialsModal = closeManageSocialsModal;