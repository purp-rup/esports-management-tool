// DISCLAIMER: CODE ORGANIZED BY CLAUDE

// ============================================
// DASHBOARD INITIALIZATION
// Main dashboard functionality and tab switching
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // ========================================
    // INITIALIZE MODULES
    // ========================================

    // Initialize events module (from events.js)
    if (typeof initializeEventsModule === 'function' && typeof eventsDataFromServer !== 'undefined') {
        initializeEventsModule(eventsDataFromServer);
    }

    // Initialize admin panel if admin tab exists (from admin-panel.js)
    const adminTab = document.querySelector('[data-tab="admin"]');
    if (adminTab && typeof initializeAdminPanel === 'function') {
        initializeAdminPanel();
    }

    // ========================================
    // TAB SWITCHING
    // ========================================
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const tabDropdown = document.getElementById('tabDropdown');

    // Check if there's a tab hash in URL (for returning to profile after avatar sync)
    const urlHash = window.location.hash.substring(1); // Remove the '#'
    if (urlHash && document.getElementById(urlHash)) {
        switchTab(urlHash);
    }

    /**
     * Switch between dashboard tabs
     * @param {string} targetTab - ID of the tab to switch to
     */
    function switchTab(targetTab) {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        const activeButton = document.querySelector(`[data-tab="${targetTab}"]`);
        if (activeButton) activeButton.classList.add('active');

        const targetContent = document.getElementById(targetTab);
        if (targetContent) targetContent.classList.add('active');

        tabDropdown.value = targetTab;
    }

    // Desktop tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            switchTab(this.getAttribute('data-tab'));
        });
    });

    // Mobile dropdown
    if (tabDropdown) {
        tabDropdown.addEventListener('change', function() {
            switchTab(this.value);
        });
    }
});