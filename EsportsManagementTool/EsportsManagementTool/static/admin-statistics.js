/**
 * admin-statistics.js
 * ============================================================================
 * Handles interactions and visualizations for the admin statistics page
 * ============================================================================
 */

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin statistics page loaded');
    
    // Initialize charts
    initializeLeagueCharts();
    
    // Set up export handlers
    setupExportHandlers();
});

// ============================================
// SEASON FILTERING
// ============================================

/**
 * Filter statistics by season
 * Reloads the page with season parameter
 */
function filterBySeason(seasonId) {
    if (seasonId) {
        window.location.href = `/admin/statistics?season_id=${seasonId}`;
    } else {
        window.location.href = '/admin/statistics';
    }
}

// ============================================
// CHART INITIALIZATION
// ============================================

/**
 * Initialize bar charts for each league
 */
function initializeLeagueCharts() {
    if (!window.statisticsData || !window.statisticsData.league_breakdown) {
        console.log('No league data available for charts');
        return;
    }
    
    const leagues = window.statisticsData.league_breakdown;
    
    leagues.forEach((league, index) => {
        const canvasId = `leagueChart${index + 1}`;
        const canvas = document.getElementById(canvasId);
        
        if (!canvas) {
            console.warn(`Canvas ${canvasId} not found`);
            return;
        }
        
        const ctx = canvas.getContext('2d');
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [
                    'Unique Players',
                    'Unique Esports',
                    'Community Members',
                    'Fielded Players',
                    'Unique Teams'
                ],
                datasets: [{
                    label: league.league_name || 'No League',
                    data: [
                        league.unique_players,
                        league.unique_esports,
                        league.community_members,
                        league.fielded_players,
                        league.unique_teams
                    ],
                    backgroundColor: [
                        'rgba(121, 189, 233, 0.7)',
                        'rgba(76, 175, 80, 0.7)',
                        'rgba(255, 152, 0, 0.7)',
                        'rgba(156, 39, 176, 0.7)',
                        'rgba(244, 67, 54, 0.7)'
                    ],
                    borderColor: [
                        'rgba(121, 189, 233, 1)',
                        'rgba(76, 175, 80, 1)',
                        'rgba(255, 152, 0, 1)',
                        'rgba(156, 39, 176, 1)',
                        'rgba(244, 67, 54, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: {
                            size: 14
                        },
                        bodyFont: {
                            size: 13
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#9ca3af',
                            font: {
                                size: 11
                            }
                        },
                        grid: {
                            color: 'rgba(156, 163, 175, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#9ca3af',
                            font: {
                                size: 10
                            },
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    });
}

// ============================================
// EXPORT FUNCTIONALITY
// ============================================

/**
 * Set up export button handlers
 */
function setupExportHandlers() {
    // Export handlers are defined globally for onclick attributes
    console.log('Export handlers ready');
}

/**
 * Export statistics to Excel format
 */
function exportToExcel() {
    if (!window.statisticsData) {
        alert('No data available to export');
        return;
    }
    
    // Build CSV content
    let csvContent = "Stockton Esports Program Statistics\n\n";
    
    // Program-wide statistics
    csvContent += "PROGRAM OVERVIEW\n";
    csvContent += "Metric,Value\n";
    csvContent += `Competitive Game Titles,${window.statisticsData.program_wide.unique_games}\n`;
    csvContent += `Unique Leagues,${window.statisticsData.program_wide.unique_leagues}\n`;
    csvContent += `Unique Players,${window.statisticsData.program_wide.unique_players}\n`;
    csvContent += `Unique Teams,${window.statisticsData.program_wide.unique_teams}\n`;
    csvContent += `Community Members,${window.statisticsData.program_wide.community_members}\n`;
    csvContent += `Fielded Players,${window.statisticsData.program_wide.fielded_players}\n`;
    csvContent += "\n";
    
    // Player statistics
    csvContent += "PLAYER METRICS\n";
    csvContent += "Metric,Value\n";
    csvContent += `New Players,${window.statisticsData.player_stats.new_players}\n`;
    csvContent += `Returning Players,${window.statisticsData.player_stats.returning_players}\n`;
    csvContent += `Did Not Return,${window.statisticsData.player_stats.did_not_return}\n`;
    csvContent += `Multi-Team Players,${window.statisticsData.player_stats.multi_team_players}\n`;
    csvContent += "\n";
    
    // Tournament placements
    csvContent += "TOURNAMENT PERFORMANCE\n";
    csvContent += "Placement,Count\n";
    csvContent += `Winners,${window.statisticsData.tournament_placements.winners}\n`;
    csvContent += `Finals,${window.statisticsData.tournament_placements.finals}\n`;
    csvContent += `Semifinals,${window.statisticsData.tournament_placements.semifinals}\n`;
    csvContent += `Quarterfinals,${window.statisticsData.tournament_placements.quarterfinals}\n`;
    csvContent += `Playoffs,${window.statisticsData.tournament_placements.playoffs}\n`;
    csvContent += `Regular Season,${window.statisticsData.tournament_placements.regular_season}\n`;
    csvContent += `In Progress,${window.statisticsData.tournament_placements.in_progress}\n`;
    csvContent += "\n";
    
    // League breakdown
    if (window.statisticsData.league_breakdown && window.statisticsData.league_breakdown.length > 0) {
        csvContent += "LEAGUE BREAKDOWN\n";
        csvContent += "League,Unique Players,Unique Esports,Community Members,Fielded Players,Unique Teams\n";
        
        window.statisticsData.league_breakdown.forEach(league => {
            csvContent += `${league.league_name || 'No League'},`;
            csvContent += `${league.unique_players},`;
            csvContent += `${league.unique_esports},`;
            csvContent += `${league.community_members},`;
            csvContent += `${league.fielded_players},`;
            csvContent += `${league.unique_teams}\n`;
        });
    }
    
    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `stockton_esports_statistics_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Export statistics to PDF format
 */
function exportToPDF() {
    // This would require a library like jsPDF
    // For now, use print functionality as fallback
    alert('PDF export will open print dialog. Use "Save as PDF" option in your browser.');
    window.print();
}

/**
 * Print statistics page
 */
function printStatistics() {
    window.print();
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format number with commas
 */
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Calculate percentage
 */
function calculatePercentage(part, total) {
    if (total === 0) return 0;
    return ((part / total) * 100).toFixed(1);
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================

window.filterBySeason = filterBySeason;
window.exportToExcel = exportToExcel;
window.exportToPDF = exportToPDF;
window.printStatistics = printStatistics;