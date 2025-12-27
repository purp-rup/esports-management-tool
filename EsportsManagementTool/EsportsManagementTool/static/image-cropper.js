/**
 * image-cropper.js
 * ============================================================================
 * UNIVERSAL IMAGE CROPPER SYSTEM
 * ============================================================================
 * Provides centralized image cropping functionality using Cropper.js
 * Used by multiple modules: leagues, communities, profile avatars, etc.
 *
 * Features:
 * - Square aspect ratio cropping (1:1)
 * - Zoom, rotate, and reset controls
 * - Modal-safe scroll management
 * - Context-aware blob storage
 * - High-quality output (400x400px)
 *
 * ORGANIZED BY CLAUDE AI
 * ============================================================================
 */

// ============================================
// GLOBAL STATE
// ============================================

/**
 * Cropper.js instance
 * @type {Cropper|null}
 */
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
let communityCroppedImageBlob = null;  // Used by communities
let avatarCroppedImageBlob = null;     // Used by profile avatar

// ============================================
// CROPPER MODAL - OPEN/CLOSE
// ============================================

/**
 * Open image cropper modal with file
 * @param {File} file - Image file to crop
 * @param {string} context - Context identifier ('league', 'community', 'avatar')
 */
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
        document.body.style.overflow = 'hidden';

        // Initialize Cropper.js after a short delay to ensure image is loaded
        setTimeout(() => {
            if (cropper) {
                cropper.destroy();
            }

            cropper = new Cropper(imageElement, {
                aspectRatio: 1, // Square crop
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

/**
 * Close image cropper modal
 */
function closeImageCropper() {
    const modal = document.getElementById('imageCropperModal');
    if (!modal) return;

    modal.style.display = 'none';

    // Check if there are other modals still open before restoring scroll
    const openModals = document.querySelectorAll('.modal');
    const hasOpenModals = Array.from(openModals).some(m => {
        if (m.id === 'imageCropperModal') return false; // Exclude the modal we're closing
        const style = window.getComputedStyle(m);
        return style.display === 'block' || style.display === 'flex' || m.classList.contains('active');
    });

    if (!hasOpenModals) {
        document.body.style.overflow = 'auto';
    }

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

// ============================================
// APPLY CROP - CONTEXT-AWARE
// ============================================

/**
 * Apply crop and route to correct handler based on context
 * Generates 400x400px PNG with high quality
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

        const preview = document.getElementById('avatarPreview');
        if (preview) {
            const url = URL.createObjectURL(blob);
            preview.innerHTML = `<img src="${url}" alt="Cropped avatar">`;
        }

        closeImageCropper();
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

// Global state (for backwards compatibility)
window.cropper = cropper;
window.currentImageField = currentImageField;
window.croppedImageBlob = croppedImageBlob;
window.communityCroppedImageBlob = communityCroppedImageBlob;
window.avatarCroppedImageBlob = avatarCroppedImageBlob;