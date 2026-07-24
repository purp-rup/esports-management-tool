/* ===================================================
 * Photo Upload logic
 * - Universal image cropping
 * - Upload to landing page photo gallery
 * ===================================================
 */

// ============================================
// GLOBAL STATE
// ============================================
let cropper = null;

/**
 * Current image field context
 * Determines which feature is using the cropper
 */
let currentImageField = null;

// Array of landing gallery photos loaded as empty initially
let landingGalleryPhotos = [];

/**
 * Cropped image blob storage
 * Different contexts use different variable names
 */
let croppedImageBlob = null;           // Used by leagues
let bannerCroppedImageBlob = null;     // Used by community banner
let communityCroppedImageBlob = null;  // Used as community icon
let avatarCroppedImageBlob = null;     // Used by profile avatar
let galleryCroppedImageBlob = null;    // Used by community photo carousel AND landing page gallery

// ============================================
// CROPPER MODAL - OPEN/CLOSE
// ============================================
function openImageCropper(file, context = null) {
    const modal = document.getElementById('imageCropperModal');
    if (!modal) {
        console.error('Image cropper modal not found');
        return;
    }

    // Store context if provided
    if (context) {
        currentImageField = context;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageElement = document.getElementById('imageToCrop');
        imageElement.src = e.target.result;

        modal.style.display = 'flex';
        lockBodyScroll('imageCropperModal');

        // Initialize Cropper.js after a short delay to ensure image is loaded
        setTimeout(() => {
            if (cropper) {
                cropper.destroy();
            }

            cropper = new Cropper(imageElement, {
                aspectRatio: currentImageField === 'banner'   ? 16 / 5  :
                             currentImageField === 'gallery' ? 16 / 9  : 1,
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 0.8,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
            });
        }, 100);
    };
    reader.readAsDataURL(file);
}

// Close the image cropper modal
function closeImageCropper() {
    const modal = document.getElementById('imageCropperModal');
    if (!modal) return;

    modal.style.display = 'none';
    unlockBodyScroll('imageCropperModal');

    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
}

// ============================================
// CROPPER CONTROLS
// ============================================

// Zoom in on image
function cropZoomIn() {
    if (cropper) cropper.zoom(0.1);
}

// Zoom out on image
function cropZoomOut() {
    if (cropper) cropper.zoom(-0.1);
}

// Rotate image left (counter-clockwise)
function cropRotateLeft() {
    if (cropper) cropper.rotate(-90);
}

// Rotate image right (clockwise)
function cropRotateRight() {
    if (cropper) cropper.rotate(90);
}

// Reset crop to original state
function cropReset() {
    if (cropper) cropper.reset();
}

// ================================
// APPLY CROP
// ================================

// Apply crop and route to correct handler based on context
function applyCrop() {
    if (!cropper) return;

    // Default crop settings
    const cropSettings = {
        width: 400,
        height: 400,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    };

    // Route to correct handler based on context
    switch(currentImageField) {
        case 'league':
            handleLeagueCrop(cropSettings);
            break;
        case 'community':
            handleCommunityCrop(cropSettings);
            break;
        case 'avatar':
            handleAvatarCrop(cropSettings);
            break;
        case 'banner':
            handleBannerCrop(cropSettings);
            break;
        case 'gallery':
            handleGalleryCrop(cropSettings);
            break;
        default:
            console.warn('Unknown image field type:', currentImageField);
            // Fallback to league behavior for backwards compatibility
            handleLeagueCrop(cropSettings);
    }
}

// Handle crop for league logo
function handleLeagueCrop(settings) {
    cropper.getCroppedCanvas(settings).toBlob((blob) => {
        croppedImageBlob = blob;

        const preview = document.getElementById('leagueLogoPreview');
        if (preview) {
            const url = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${url}" alt="Cropped logo">`;
        }

        closeImageCropper();
    }, 'image/png');
}

/**
 * Handle crop for community icon
 * @param {Object} settings - Crop canvas settings
 */
function handleCommunityCrop(settings) {
    cropper.getCroppedCanvas(settings).toBlob((blob) => {
        communityCroppedImageBlob = blob;

        const preview = document.getElementById('communityImagePreview');
        if (preview) {
            const url = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${url}" alt="Cropped icon">`;
        }

        closeImageCropper();
    }, 'image/png');
}

/**
 * Handle crop for profile avatar
 * @param {Object} settings - Crop canvas settings
 */
function handleAvatarCrop(settings) {
    cropper.getCroppedCanvas(settings).toBlob((blob) => {
        avatarCroppedImageBlob = blob;
        window.avatarCroppedImageBlob = blob;

        const preview = document.getElementById('avatarPreview');
        if (preview) {
            const url = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${url}" alt="Cropped avatar">`;
        }

        closeImageCropper();
    }, 'image/png');
}

/**
 * Handle crop for community banner.
 * Output: 1280×400px PNG (16:5 aspect ratio)
 */
function handleBannerCrop(settings) {
    const bannerSettings = {
        width: 1280,
        height: 400,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    };

    cropper.getCroppedCanvas(bannerSettings).toBlob((blob) => {
        bannerCroppedImageBlob = blob;
        closeImageCropper();

        const gameIdEl = document.getElementById('communityGameId');
        if (!gameIdEl) return;

        const formData = new FormData();
        formData.append('banner', blob, 'banner.png');

        fetch(`/api/game/${gameIdEl.value}/banner`, { method: 'POST', body: formData })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    const img   = document.getElementById('bannerImg');
                    const empty = document.getElementById('bannerEmpty');
                    img.src = data.banner_url;
                    img.style.display = 'block';
                    if (empty) empty.style.display = 'none';

                    const btn = document.querySelector('.banner-upload-btn');
                    if (btn) btn.innerHTML = '<i class="fas fa-camera"></i> Change Banner';
                } else {
                    alert('Banner upload failed: ' + data.message);
                }
            })
            .catch(() => alert('Banner upload failed. Please try again.'));
    }, 'image/png');
}

/**
 * Handle crop for a 16:9 photo gallery — used by both the community photo
 * carousel and the landing page gallery. The destination is determined by
 * whether a #communityGameId element is present on the page
 * Output: 1280×720px PNG (16:9 aspect ratio)
 */
function handleGalleryCrop(settings) {
    const gallerySettings = {
        width: 1280,
        height: 720,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    };

    cropper.getCroppedCanvas(gallerySettings).toBlob((blob) => {
        galleryCroppedImageBlob = blob;
        closeImageCropper();

        const gameIdEl = document.getElementById('communityGameId');
        const uploadUrl = gameIdEl
            ? `/api/game/${gameIdEl.value}/photos`
            : '/api/admin/landing-photos';

        const formData = new FormData();
        formData.append('photo', blob, 'photo.png');

        fetch(uploadUrl, { method: 'POST', body: formData })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    if (gameIdEl) {
                        carouselPhotos.push(data.photo);
                        carouselIndex = carouselPhotos.length - 1;
                        renderCarousel();
                    } else {
                        onLandingPhotoUploaded(data.photo);
                    }
                } else if (data.limit_reached) {
                    alert(data.message);
                } else {
                    alert('Photo upload failed: ' + data.message);
                }
            })
            .catch(() => alert('Photo upload failed. Please try again.'));
    }, 'image/png');
}

// ============================================
// ADMIN — LANDING PAGE GALLERY MANAGEMENT
// ============================================

/* Toggles whether a community photo is hidden from the landing page gallery.
 * The photo remains visible on the community's own page either way.
 */
async function toggleCommunityPhotoHidden(gameId, photoId) {
    try {
        const res  = await fetch(`/api/game/${gameId}/photos/${photoId}/hide`, { method: 'PATCH' });
        const data = await res.json();

        if (data.success) {
            const community = landingGalleryCommunities.find(c => c.game_id === gameId);
            if (community) {
                const photo = community.photos.find(p => p.photo_id === photoId);
                if (photo) photo.is_hidden = data.is_hidden;
            }
            renderLandingGalleryCommunities();
        } else {
            alert('Failed to update photo visibility: ' + data.message);
        }
    } catch (e) {
        alert('Failed to update photo visibility. Please try again.');
    }
}

// Confirms a photo will be removed
function confirmDeleteLandingPhoto(photoId) {
    openDeleteConfirmModal({
        title: 'Delete Photo?',
        message: 'Are you sure you want to permanently delete this photo from the landing gallery? This cannot be undone.',
        buttonText: 'Delete Photo',
        itemId: photoId,
        onConfirm: async (id) => {
            await executeLandingPhotoDelete(id);
        }
    });
}

// Removes a desired photo from the gallery
async function executeLandingPhotoDelete(photoId) {
    try {
        const res  = await fetch(`/api/admin/landing-photos/${photoId}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
            landingGalleryPhotos = landingGalleryPhotos.filter(p => p.photo_id !== photoId);
            closeDeleteConfirmModal();
            renderLandingGalleryAdminGrid();
            showDeleteSuccessMessage('Photo deleted successfully.');
        } else {
            closeDeleteConfirmModal();
            showDeleteErrorMessage('Delete failed: ' + data.message);
        }
    } catch (e) {
        closeDeleteConfirmModal();
        showDeleteErrorMessage('Delete failed. Please try again.');
    }
}

// Confirms a community photo will be removed (Communities tab of the landing gallery modal)
function confirmDeleteCommunityPhoto(gameId, photoId) {
    openDeleteConfirmModal({
        title: 'Delete Photo?',
        message: 'Are you sure you want to permanently delete this photo from the community? This cannot be undone.',
        buttonText: 'Delete Photo',
        itemId: photoId,
        onConfirm: async (id) => {
            await executeCommunityPhotoDelete(gameId, id);
        }
    });
}

// Removes a photo from a specific community, reusing the existing per-game delete route
async function executeCommunityPhotoDelete(gameId, photoId) {
    try {
        const res  = await fetch(`/api/game/${gameId}/photos/${photoId}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
            const community = landingGalleryCommunities.find(c => c.game_id === gameId);
            if (community) {
                community.photos = community.photos.filter(p => p.photo_id !== photoId);
            }
            closeDeleteConfirmModal();
            renderLandingGalleryCommunities();
            showDeleteSuccessMessage('Photo deleted successfully.');
        } else {
            closeDeleteConfirmModal();
            showDeleteErrorMessage('Delete failed: ' + data.message);
        }
    } catch (e) {
        closeDeleteConfirmModal();
        showDeleteErrorMessage('Delete failed. Please try again.');
    }
}

// Displays an error if not rendered properly
function showLandingGalleryError(message) {
    const el = document.getElementById('landingGalleryMessage');
    if (!el) return;
    el.textContent = message;
    el.className = 'form-message error';
    el.style.display = 'block';
}

// Called directly from handleGalleryCrop() above after a successful landing page upload
function onLandingPhotoUploaded(photo) {
    landingGalleryPhotos.unshift(photo);
    renderLandingGalleryAdminGrid();
}

// ============================================
// PUBLIC — LANDING PAGE FILM-REEL MARQUEE
// ============================================

// Builds the landing page gallery
async function initLandingGallery() {
    const strip = document.getElementById('landingGalleryStrip');
    const track = document.getElementById('landingGalleryTrack');
    if (!strip || !track) return;

    try {
        const res  = await fetch('/api/landing/photos');
        const data = await res.json();

        if (!data.success || !data.photos.length) {
            strip.style.display = 'none';
            return;
        }

        const photos = data.photos;

        // Duplicate the sequence so the strip can loop seamlessly
        const slidesHtml = photos.map(p => `
            <div class="landing-gallery-slide">
                <img src="${p.photo_url}" alt="Stockton Esports community photo" loading="lazy">
            </div>
        `).join('');
        track.innerHTML = slidesHtml + slidesHtml;

        strip.style.display = 'block';
        track.style.animationDuration = `${photos.length * 6}s`;
    } catch (e) {
        console.error('Failed to load landing gallery photos:', e);
        strip.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // initFileInputCropper lives in communities.js, which isn't loaded
    // on the public landing page — guard so this file works on both
    if (typeof initFileInputCropper === 'function') {
        initFileInputCropper('landingGalleryFileInput', 'gallery');
    }
    initLandingGallery();
});

// ============================================
// UTILITIES
// ============================================

// Get a cropped image blob based on photo context
function getCroppedImageBlob(context) {
    switch(context) {
        case 'league':
            return croppedImageBlob;
        case 'community':
            return communityCroppedImageBlob;
        case 'avatar':
            return avatarCroppedImageBlob;
        case 'banner':
            return bannerCroppedImageBlob;
        case 'gallery':
            return galleryCroppedImageBlob;
        default:
            return null;
    }
}

// Clear cropped image blob for a specific context
function clearCroppedImageBlob(context) {
    switch(context) {
        case 'league':
            croppedImageBlob = null;
            break;
        case 'community':
            communityCroppedImageBlob = null;
            break;
        case 'avatar':
            avatarCroppedImageBlob = null;
            break;
        case 'banner':
            bannerCroppedImageBlob = null;
            break;
        case 'gallery':
            galleryCroppedImageBlob = null;
            break;
    }
}

// ============================================
// GLOBAL EXPORTS
// ============================================
window.openImageCropper = openImageCropper;
window.closeImageCropper = closeImageCropper;
window.applyCrop = applyCrop;

// Control functions
window.cropZoomIn = cropZoomIn;
window.cropZoomOut = cropZoomOut;
window.cropRotateLeft = cropRotateLeft;
window.cropRotateRight = cropRotateRight;
window.cropReset = cropReset;

// Utility functions
window.getCroppedImageBlob = getCroppedImageBlob;
window.clearCroppedImageBlob = clearCroppedImageBlob;

// Landing gallery — admin management
window.confirmDeleteLandingPhoto      = confirmDeleteLandingPhoto;
window.confirmDeleteCommunityPhoto    = confirmDeleteCommunityPhoto;
window.toggleCommunityPhotoHidden     = toggleCommunityPhotoHidden;