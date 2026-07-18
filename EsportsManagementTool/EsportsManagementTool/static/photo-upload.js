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
 * @type {string|null} - 'league', 'community', 'avatar', etc.
 */
let currentImageField = null;

/**
 * Cropped image blob storage
 * Different contexts use different variable names for backwards compatibility
 */
let croppedImageBlob = null;           // Used by leagues
let bannerCroppedImageBlob = null;     // Used by community banner
let communityCroppedImageBlob = null;  // Used as community icon
let avatarCroppedImageBlob = null;     // Used by profile avatar
let carouselCroppedImageBlob = null;  // Used by community photo carousel

// ============================================
// CROPPER MODAL - OPEN/CLOSE
// ============================================

// Open image cropper modal with file attached
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
                             currentImageField === 'carousel' ? 16 / 9  : 1,
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

/**
 * Zoom in on image
 */
function cropZoomIn() {
    if (cropper) cropper.zoom(0.1);
}

/**
 * Zoom out on image
 */
function cropZoomOut() {
    if (cropper) cropper.zoom(-0.1);
}

/**
 * Rotate image left (counter-clockwise)
 */
function cropRotateLeft() {
    if (cropper) cropper.rotate(-90);
}

/**
 * Rotate image right (clockwise)
 */
function cropRotateRight() {
    if (cropper) cropper.rotate(90);
}

/**
 * Reset crop to original state
 */
function cropReset() {
    if (cropper) cropper.reset();
}

// ================================
// APPLY CROP
// ================================

/**
 * Apply crop and route to correct handler based on context
 */
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
        case 'carousel':
            handleCarouselCrop(cropSettings);
            break;
        default:
            console.warn('Unknown image field type:', currentImageField);
            // Fallback to league behavior for backwards compatibility
            handleLeagueCrop(cropSettings);
    }
}

/**
 * Handle crop for league logo
 * @param {Object} settings - Crop canvas settings
 */
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
 * Handle crop for community photo carousel.
 * Output: 1280×720px PNG (16:9 aspect ratio)
 */
function handleCarouselCrop(settings) {
    const carouselSettings = {
        width: 1280,
        height: 720,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    };

    cropper.getCroppedCanvas(carouselSettings).toBlob((blob) => {
        carouselCroppedImageBlob = blob;
        closeImageCropper();

        const gameIdEl = document.getElementById('communityGameId');
        if (!gameIdEl) return;

        const formData = new FormData();
        formData.append('photo', blob, 'photo.png');

        fetch(`/api/game/${gameIdEl.value}/photos`, { method: 'POST', body: formData })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    carouselPhotos.push(data.photo);
                    carouselIndex = carouselPhotos.length - 1;
                    renderCarousel();
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
// UTILITY - GET CROPPED BLOB
// ============================================

/**
 * Get the cropped image blob for a specific context
 * @param {string} context - Context identifier
 * @returns {Blob|null} Cropped image blob
 */
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
        case 'carousel':
            return carouselCroppedImageBlob;
        default:
            return null;
    }
}

/**
 * Clear cropped image blob for a specific context
 * @param {string} context - Context identifier
 */
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
        case 'carousel':
            carouselCroppedImageBlob = null;
            break;
    }
}

// ============================================
// GLOBAL EXPORTS
// ============================================

// Core functions
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