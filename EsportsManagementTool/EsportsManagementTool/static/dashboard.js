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

    // ========================================
    // PREFERRED TAB SETTING
    // ========================================

    initializePreferredTabSetting();

    // =======================================
    // PAGE RELOAD CONSISTENCY SETUP
    //========================================
    const storedTab = sessionStorage.getItem('activeTab');

    if (storedTab) {
        // Clear the stored tab
        sessionStorage.removeItem('activeTab');

        // Find and click the stored tab
        const tabElement = document.querySelector(`[data-tab="${storedTab}"]`);
        if (tabElement) {
            // Small delay to ensure everything is loaded
            setTimeout(() => {
                tabElement.click();
            }, 100);
        }
    } else {
        // Force a click on the current tab to ensure content is fetched
        const activeTabElement = document.querySelector('.tab-button.active');
        if (activeTabElement) {
            setTimeout(() => {
                activeTabElement.click();
            }, 100);
        }
    }

    // Character Counter        
    attachCharacterCounter('gameDescription', 250);
    attachCharacterCounter('matchNotes', 250);
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

    // Initialize admin panel if admin tab exists (from admin-panel.js)
    // Only initializes for users with admin access
    const adminTab = document.querySelector('[data-tab="admin"]');
    if (adminTab && typeof initializeAdminPanel === 'function') {
        initializeAdminPanel();
        console.log('Admin panel initialized');
    }
    // Note: Other modules (communities, profile, etc.) initialize themselves
    // or are initialized by their respective loaded scripts
    
    // Initialize events module on page load
    const eventsTab = document.querySelector('[data-tab="events"]');
    if (eventsTab) {
        // Initialize events module (from events.js)
        if (typeof initializeEventsModule === 'function') {
            initializeEventsModule(typeof eventsDataFromServer !== 'undefined' ? eventsDataFromServer : {});
            console.log('Events module initialized');
        }

        if (typeof loadEvents === 'function') {
            setTimeout(() => {
                loadEvents();
            }, 150);
        }
    }
}

// ============================================
// TAB NAVIGATION
// ============================================

/**
 * Initialize tab navigation system
 * Sets up desktop buttons
 * Handles URL hash for deep linking to specific tabs
 */
function initializeTabNavigation() {
    // Get all tab navigation elements
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

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
}

// ============================================
// PREFERRED TAB SETTING
// ============================================

function initializePreferredTabSetting() {
    const container = document.getElementById('preferredTabButtons');
    if (!container) return;

    const buttons = container.querySelectorAll('.filter-btn');
    const message  = document.getElementById('preferredTabMessage');

    buttons.forEach(btn => {
        btn.addEventListener('click', async function () {
            const selectedTab = this.dataset.tabValue;

            // Single-select
            buttons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            try {
                const response = await fetch('/profile/preferred-tab', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ preferred_tab: selectedTab })
                });
                const data = await response.json();

                if (data.success && message) {
                    clearTimeout(message._hideTimer);
                    clearTimeout(message._displayTimer);

                    // Set display first, force a reflow so the
                    // opacity transition has something to animate from,
                    // then add .visible to trigger the fade-in
                    message.style.display = 'block';
                    void message.offsetHeight;
                    message.classList.add('visible');

                    message._hideTimer = setTimeout(() => {
                        message.classList.remove('visible');
                        // Wait for the 0.25s fade-out to finish before
                        // collapsing the space entirely
                        message._displayTimer = setTimeout(() => {
                            message.style.display = 'none';
                        }, 250);
                    }, 2000);
                }
            } catch (err) {
                console.error('Failed to save preferred tab:', err);
            }
        });
    });
}

// ============================================
// PREFERRED TAB DROPDOWN
// Selection handler for the filter-box styled dropdown.
// Opening/closing is handled by toggleFilterBox() and
// closeAllFilterPanels(), both already defined in events.js.
// ============================================

function applyPreferredTabFilter(value, label) {
    document.getElementById('preferredTabFilterLabel').textContent = label;
    document.getElementById('preferredTabSelect').value = value;

    document.querySelectorAll('#preferredTabFilterPanel .filter-box-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-value') === value);
    });

    closeAllFilterPanels();
}