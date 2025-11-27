/**
 * dashboard.js
 * ============================================================================
 * DASHBOARD INITIALIZATION & TAB MANAGEMENT
 * ORGANIZED BY CLAUDEAI
 * ============================================================================
 * Core dashboard functionality that handles:
 * - Module initialization (events, admin panel, communities, etc.)
 * - Tab switching between dashboard sections
 * - Desktop and mobile navigation synchronization
 * - URL hash handling for deep linking to specific tabs
 *
 * This module serves as the entry point and coordinator for all dashboard
 * features, initializing sub-modules and managing the overall user interface.
 * ============================================================================
 */

// ============================================
// MAIN INITIALIZATION
// ============================================

/**
 * Initialize dashboard on page load
 * Coordinates module initialization and sets up tab navigation
 */
document.addEventListener('DOMContentLoaded', function() {

    // ========================================
    // MODULE INITIALIZATION
    // ========================================

    initializeDashboardModules();

    // ========================================
    // TAB NAVIGATION SETUP
    // ========================================

    initializeTabNavigation();
});

// ============================================
// MODULE INITIALIZATION
// ============================================

/**
 * Initialize all dashboard modules
 * Each module is checked for availability before initialization
 * This allows for modular loading - modules only initialize if present
 */
function initializeDashboardModules() {

    // Initialize events module (from events.js)
    // Only initializes if both the function and server data are available
    if (typeof initializeEventsModule === 'function' && typeof eventsDataFromServer !== 'undefined') {
        initializeEventsModule(eventsDataFromServer);
        console.log('Events module initialized');
    }

    // Initialize admin panel if admin tab exists (from admin-panel.js)
    // Only initializes for users with admin access
    const adminTab = document.querySelector('[data-tab="admin"]');
    if (adminTab && typeof initializeAdminPanel === 'function') {
        initializeAdminPanel();
        console.log('Admin panel initialized');
    }

    // Note: Other modules (communities, profile, etc.) initialize themselves
    // or are initialized by their respective loaded scripts
}

// ============================================
// TAB NAVIGATION
// ============================================

/**
 * Initialize tab navigation system
 * Sets up both desktop buttons and mobile dropdown
 * Handles URL hash for deep linking to specific tabs
 */
function initializeTabNavigation() {
    // Get all tab navigation elements
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const tabDropdown = document.getElementById('tabDropdown');

    // Check for URL hash to restore previous tab state
    // Useful for returning to a specific tab after external actions
    // (e.g., returning to profile tab after Discord avatar sync)
    const urlHash = window.location.hash.substring(1); // Remove the '#' character
    if (urlHash && document.getElementById(urlHash)) {
        switchTab(urlHash);
    }

    // ========================================
    // TAB SWITCHING FUNCTION
    // ========================================

    /**
     * Switch between dashboard tabs
     * Updates both desktop buttons and mobile dropdown to stay in sync
     *
     * @param {string} targetTab - ID of the tab content to display
     *
     */
    function switchTab(targetTab) {
        // Remove active class from all tab buttons
        tabButtons.forEach(btn => btn.classList.remove('active'));

        // Hide all tab content sections
        tabContents.forEach(content => content.classList.remove('active'));

        // Activate the clicked tab button
        const activeButton = document.querySelector(`[data-tab="${targetTab}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }

        // Show the corresponding tab content
        const targetContent = document.getElementById(targetTab);
        if (targetContent) {
            targetContent.classList.add('active');
        }

        // Sync mobile dropdown selection
        if (tabDropdown) {
            tabDropdown.value = targetTab;
        }

        // Optional: Update URL hash for bookmarking/sharing
        // Commented out to avoid cluttering browser history
        // window.location.hash = targetTab;
    }

    // ========================================
    // DESKTOP TAB BUTTONS
    // ========================================

    // Attach click handlers to all desktop tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });

    // ========================================
    // MOBILE TAB DROPDOWN
    // ========================================

    // Attach change handler to mobile dropdown
    // Keeps mobile and desktop navigation in sync
    if (tabDropdown) {
        tabDropdown.addEventListener('change', function() {
            switchTab(this.value);
        });
    }
}