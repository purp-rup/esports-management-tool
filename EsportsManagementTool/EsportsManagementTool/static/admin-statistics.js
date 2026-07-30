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
    initializeOverallTrendsChart();
    initializeLeagueTrendsChart();
    initializeTrendsDurationLabels();

    // Set up export handlers
    setupExportHandlers();

    // Set up floating game tabs pan arrows
    initStatsFloatingTabs();
});

// ============================================
// SEASON FILTERING
// ============================================

/**
 * Filter statistics by season
 * Reloads the page with season parameter
 */
function filterBySeason(seasonId) {
    window.location.href = seasonId
        ? `/admin/statistics?season_id=${seasonId}`
        : '/admin/statistics?season_id=all';
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

/**
 * Set up left/right pan arrows for the floating game tabs strip.
 * Arrows only appear when the tabs overflow the visible track width.
 */
function initStatsFloatingTabs() {
    const track = document.getElementById('statsFloatingTabsTrack');
    const leftArrow = document.getElementById('statsFloatingTabsArrowLeft');
    const rightArrow = document.getElementById('statsFloatingTabsArrowRight');

    // Wire up each floating tab (Overview + per-game) to switch views
    document.querySelectorAll('.stats-floating-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stats-floating-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const gameId = btn.dataset.game;
            if (gameId === 'overview') {
                showOverviewView();
            } else {
                showGameView(gameId, btn.querySelector('.stats-floating-tab-label').textContent, btn.dataset.icon);
            }
        });
    });

    if (!track || !leftArrow || !rightArrow) return;

    function updateArrows() {
        const maxScroll = track.scrollWidth - track.clientWidth;
        leftArrow.style.display = track.scrollLeft > 4 ? 'flex' : 'none';
        rightArrow.style.display = track.scrollLeft < maxScroll - 4 ? 'flex' : 'none';
    }

    leftArrow.addEventListener('click', () => {
        track.scrollBy({ left: -220, behavior: 'smooth' });
    });

    rightArrow.addEventListener('click', () => {
        track.scrollBy({ left: 220, behavior: 'smooth' });
    });

    track.addEventListener('scroll', updateArrows);
    window.addEventListener('resize', updateArrows);

    updateArrows();

    // Hide the tab bar once the user scrolls near the bottom of the page,
    // so it doesn't sit on top of the footer.
    const wrapper = document.querySelector('.stats-floating-tabs-wrapper');
    if (wrapper) {
        const BOTTOM_THRESHOLD = 100; // px from the true bottom before hiding

        function updateWrapperVisibility() {
            const distanceFromBottom =
                document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);

            if (distanceFromBottom < BOTTOM_THRESHOLD) {
                wrapper.classList.add('stats-floating-tabs-hidden');
            } else {
                wrapper.classList.remove('stats-floating-tabs-hidden');
            }
        }

        window.addEventListener('scroll', updateWrapperVisibility);
        window.addEventListener('resize', updateWrapperVisibility);

        updateWrapperVisibility();
    }
}

// ============================================
// PER-GAME DETAIL VIEW
// ============================================
function showOverviewView() {
    document.getElementById('statsOverviewView').style.display = '';
    document.getElementById('statsGameView').style.display = 'none';
}

// Pulls a game's data after selecting its tab
function showGameView(gameId, gameTitle, gameIconUrl) {
    document.getElementById('statsOverviewView').style.display = 'none';
    document.getElementById('statsGameView').style.display = '';
    document.getElementById('gameViewTitleText').textContent = gameTitle;

    const titleIcon = document.querySelector('.game-view-title-icon');
    if (titleIcon) {
        titleIcon.innerHTML = gameIconUrl
            ? `<img src="${gameIconUrl}" alt="${gameTitle}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-gamepad\\'></i>';">`
            : '<i class="fas fa-gamepad"></i>';
    }

    // Immediate feedback while the fetch below is in flight
    document.getElementById('gameStatsTableBody').innerHTML = `
        <tr class="game-stats-loading-row">
            <td colspan="6"><i class="fas fa-spinner fa-spin"></i> Loading stats...</td>
        </tr>
    `;

    const seasonParam = window.selectedSeason ? `?season_id=${window.selectedSeason}` : '';

    fetch(`/api/admin/statistics/game/${gameId}${seasonParam}`)
        .then(res => res.json())
        .then(data => renderGameStatsTable(data.statistics))
        .catch(() => renderGameStatsTable(getMockGameStats())); // TEMP fallback until backend returns real match data
}

// Builds the game tab data sheet
function renderGameStatsTable(gameStats) {
    const tbody = document.getElementById('gameStatsTableBody');
    tbody.innerHTML = '';

    const blockClasses = ['game-team-block-a', 'game-team-block-b', 'game-team-block-c'];
    let previousConference = null;
    let previousSeason; // stays undefined for season-filtered views (no season_name sent)

    (gameStats.teams || []).forEach((team, i) => {
        const seasonChanged = team.season_name != null && team.season_name !== previousSeason;

        if (seasonChanged) {
            // Extra breathing room before every season header after the first
            if (i > 0) {
                const seasonGapRow = document.createElement('tr');
                seasonGapRow.className = 'game-stats-league-gap';
                seasonGapRow.innerHTML = '<td colspan="6"></td>';
                tbody.appendChild(seasonGapRow);
            }
            const seasonRow = document.createElement('tr');
            seasonRow.className = 'game-stats-season-header';
            seasonRow.innerHTML = `<td colspan="6">${team.season_name || 'Unknown Season'}</td>`;
            tbody.appendChild(seasonRow);
        } else if (i > 0 && team.conference !== previousConference) {
            // Small gap between league groups within the same season
            const gapRow = document.createElement('tr');
            gapRow.className = 'game-stats-league-gap';
            gapRow.innerHTML = '<td colspan="6"></td>';
            tbody.appendChild(gapRow);
        }

        previousConference = team.conference;
        previousSeason = team.season_name;

        const row = document.createElement('tr');
        row.className = blockClasses[i % blockClasses.length];

        row.innerHTML = `
            <td>${gameStats.game_manager || '—'}</td>
            <td class="game-stats-team-name">${team.team_title}</td>
            <td>${team.conference || '—'}</td>
            <td>${renderMatchList(team.regular_season_matches)}</td>
            <td><span class="game-stats-record-badge">${team.regular_season_record || '—'}</span></td>
            <td>
                <div class="game-stats-qualified">${team.playoffs_status || ''}</div>
                ${renderMatchList(team.playoffs_matches)}
                <div class="game-stats-outcome">${team.playoffs_outcome || ''}</div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Displays a list of matches down via data
function renderMatchList(matches) {
    if (!matches || !matches.length) return '';
    return `<div class="game-stats-match-list">` +
        matches.map(m => `
            <div class="match-row">
                ${m.label}: <span class="match-score ${m.result === 'loss' ? 'loss' : ''}">${m.score}</span>
                ${m.opponent ? `(vs ${m.opponent})` : ''}
            </div>
        `).join('') +
    `</div>`;
}

// ============================================
// OVERALL TRENDS CHART (All-Time view)
// ============================================
let overallTrendsStat = 'players';
let overallTrendsDuration = 'all';

const TRENDS_STAT_LABELS = {
    players: 'Players',
    teams: 'Teams',
    playoffs: 'Playoff Qualifications'
};

const TRENDS_STAT_KEYS = {
    players: 'unique_players',
    teams: 'unique_teams',
    playoffs: 'playoff_qualified'
};

const TRENDS_STAT_COLORS = {
    players: { bg: 'rgba(121, 189, 233, 0.7)', border: 'rgba(121, 189, 233, 1)' },
    teams: { bg: 'rgba(244, 67, 54, 0.7)', border: 'rgba(244, 67, 54, 1)' },
    playoffs: { bg: 'rgba(79, 172, 254, 0.7)', border: 'rgba(79, 172, 254, 1)' }
};

// Chart.js instances for each trends panel, keyed by panel name
const trendsChartInstances = {
    overall: { main: null, axis: null },
    league: { main: null, axis: null }
};

/**
 * Build a "{oldest season in range} - Now" label for the past-N-seasons
 * duration options. Both trends panels enumerate the same full season
 * list under the hood, so this range is consistent across Overall and
 * League panels regardless of which one is currently selected.
 */
function formatDurationRangeLabel(n) {
    const allData = (window.statisticsData && window.statisticsData.program_trends) || [];
    const slice = allData.slice(-n);
    if (!slice.length) {
        return `Past ${n} Seasons`;
    }
    return `${slice[0].season_name} - Now`;
}

/**
 * Fill in the "past 2"/"past 4" filter option text with real season
 * ranges once statisticsData is available, and hide either option
 * entirely if the program doesn't have enough seasons of history yet
 * to fill it (e.g. hide "Past 4 Seasons" if only 3 seasons exist).
 */
function initializeTrendsDurationLabels() {
    const totalSeasons = ((window.statisticsData && window.statisticsData.program_trends) || []).length;
    const label2 = formatDurationRangeLabel(2);
    const label4 = formatDurationRangeLabel(4);
    const label8 = formatDurationRangeLabel(8);

    ['overallDuration2Item', 'leagueDuration2Item'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = label2;
        el.style.display = totalSeasons < 2 ? 'none' : '';
    });
    ['overallDuration4Item', 'leagueDuration4Item'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = label4;
        el.style.display = totalSeasons < 4 ? 'none' : '';
    });
    ['overallDuration8Item', 'leagueDuration8Item'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = label8;
        el.style.display = totalSeasons < 8 ? 'none' : '';
    });
}

/**
 * Return program_trends data trimmed to the current duration filter.
 * Data is ordered oldest -> newest, so "past N seasons" is the last N entries.
 */
function getOverallTrendsFilteredData() {
    const allData = (window.statisticsData && window.statisticsData.program_trends) || [];
    if (overallTrendsDuration === '2') return allData.slice(-2);
    if (overallTrendsDuration === '4') return allData.slice(-4);
    if (overallTrendsDuration === '8') return allData.slice(-8);
    return allData;
}

/**
 * Shared renderer for any "seasons on the x-axis" trends chart: builds the
 * scrollable main chart plus its frozen y-axis twin. Used by both the
 * Overall Trends panel and the Trends by League panel.
 */
function renderTrendsChart(key, elIds, data, statKey, statLabel, color) {
    const canvas = document.getElementById(elIds.canvas);
    const axisCanvas = document.getElementById(elIds.axisCanvas);
    const scrollWrap = document.getElementById(elIds.scrollWrap);
    const innerWrap = document.getElementById(elIds.innerWrap);
    if (!canvas || !axisCanvas) return;

    const labels = data.map(d => d.season_name);
    const values = data.map(d => d[statKey]);

    const PX_PER_BAR = 90;
    const MIN_VISIBLE_BARS = 4;
    const needsScroll = data.length > MIN_VISIBLE_BARS;

    innerWrap.style.width = needsScroll ? `${data.length * PX_PER_BAR}px` : '100%';

    // Shared y-axis bounds so the frozen axis lines up with the scrolling bars
    const maxValue = values.length ? Math.max(...values) : 0;
    const yMax = maxValue > 0 ? Math.ceil(maxValue * 1.2) : 5;

    const instances = trendsChartInstances[key];
    if (instances.main) {
        instances.main.destroy();
    }
    if (instances.axis) {
        instances.axis.destroy();
    }

    const ctx = canvas.getContext('2d');
    instances.main = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: statLabel,
                data: values,
                backgroundColor: color.bg,
                borderColor: color.border,
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
                    min: 0,
                    max: yMax,
                    ticks: {
                        display: false
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
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    // Frozen axis-only chart: same y range, no visible bars, pinned on top-left
    const axisCtx = axisCanvas.getContext('2d');
    instances.axis = new Chart(axisCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            events: [],
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    min: 0,
                    max: yMax,
                    ticks: {
                        color: '#9ca3af',
                        font: {
                            size: 11
                        },
                        precision: 0
                    },
                    grid: {
                        display: false
                    }
                },
                x: {
                    display: false
                }
            }
        }
    });

    // When scrolling is active, default to showing the most recent seasons
    if (needsScroll && scrollWrap) {
        requestAnimationFrame(() => {
            scrollWrap.scrollLeft = scrollWrap.scrollWidth;
        });
    }
}

function initializeOverallTrendsChart() {
    const data = getOverallTrendsFilteredData();
    renderTrendsChart(
        'overall',
        { canvas: 'overallTrendsChart', axisCanvas: 'overallTrendsAxisChart', scrollWrap: 'overallTrendsScroll', innerWrap: 'overallTrendsInner' },
        data,
        TRENDS_STAT_KEYS[overallTrendsStat],
        TRENDS_STAT_LABELS[overallTrendsStat],
        TRENDS_STAT_COLORS[overallTrendsStat]
    );
}

// ============================================
// TRENDS BY LEAGUE CHART (All-Time view)
// ============================================
let leagueTrendsStat = 'players';
let leagueTrendsDuration = 'all';
let leagueTrendsLeagueId = null;

/**
 * Return the currently-selected league's trend data, trimmed to the
 * current duration filter. Defaults to the first league on first render.
 */
function getLeagueTrendsFilteredData() {
    const allLeagueTrends = (window.statisticsData && window.statisticsData.league_trends) || [];
    if (leagueTrendsLeagueId === null && allLeagueTrends.length) {
        leagueTrendsLeagueId = allLeagueTrends[0].league_id;
    }

    const leagueEntry = allLeagueTrends.find(l => l.league_id === leagueTrendsLeagueId);
    const seasonData = leagueEntry ? leagueEntry.trends : [];

    if (leagueTrendsDuration === '2') return seasonData.slice(-2);
    if (leagueTrendsDuration === '4') return seasonData.slice(-4);
    if (leagueTrendsDuration === '8') return seasonData.slice(-8);
    return seasonData;
}

function initializeLeagueTrendsChart() {
    const data = getLeagueTrendsFilteredData();
    renderTrendsChart(
        'league',
        { canvas: 'leagueTrendsChart', axisCanvas: 'leagueTrendsAxisChart', scrollWrap: 'leagueTrendsScroll', innerWrap: 'leagueTrendsInner' },
        data,
        TRENDS_STAT_KEYS[leagueTrendsStat],
        TRENDS_STAT_LABELS[leagueTrendsStat],
        TRENDS_STAT_COLORS[leagueTrendsStat]
    );
}

// Handle League Filter selection for the Trends by League chart
function setLeagueTrendsLeague(leagueId, leagueName, el) {
    leagueTrendsLeagueId = leagueId;
    document.getElementById('leagueFilterLabel').textContent = leagueName;
    document.querySelectorAll('#leagueFilterPanel .filter-box-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    closeAllFilterPanels();
    initializeLeagueTrendsChart();
}

// Handle Stat Filter selection for the Trends by League chart
function setLeagueTrendsStat(stat, el) {
    leagueTrendsStat = stat;
    document.getElementById('leagueStatFilterLabel').textContent = TRENDS_STAT_LABELS[stat];
    document.querySelectorAll('#leagueStatFilterPanel .filter-box-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    closeAllFilterPanels();
    initializeLeagueTrendsChart();
}

// Handle Duration Filter selection for the Trends by League chart
function setLeagueTrendsDuration(duration, el) {
    leagueTrendsDuration = duration;
    const labelText = duration === 'all' ? 'All-Time' : formatDurationRangeLabel(Number(duration));
    document.getElementById('leagueDurationFilterLabel').textContent = labelText;
    document.querySelectorAll('#leagueDurationFilterPanel .filter-box-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    closeAllFilterPanels();
    initializeLeagueTrendsChart();
}

// Handle Stat Filter selection for the Overall Trends chart
function setOverallTrendsStat(stat, el) {
    overallTrendsStat = stat;
    document.getElementById('overallStatFilterLabel').textContent = TRENDS_STAT_LABELS[stat];
    document.querySelectorAll('#overallStatFilterPanel .filter-box-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    closeAllFilterPanels();
    initializeOverallTrendsChart();
}

// Handle Duration Filter selection for the Overall Trends chart
function setOverallTrendsDuration(duration, el) {
    overallTrendsDuration = duration;
    const labelText = duration === 'all' ? 'All-Time' : formatDurationRangeLabel(Number(duration));
    document.getElementById('overallDurationFilterLabel').textContent = labelText;
    document.querySelectorAll('#overallDurationFilterPanel .filter-box-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    closeAllFilterPanels();
    initializeOverallTrendsChart();
}

// ============================================
// EXPORT FUNCTIONALITY
// ============================================
function setupExportHandlers() {
    // Export handlers are defined globally for onclick attributes
    console.log('Export handlers ready');
}

// Export statistics to Excel format
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
    
    // Playoffs placements
    csvContent += "PLAYOFFS PERFORMANCE\n";
    csvContent += "Placement,Count\n";
    csvContent += `Winners,${window.statisticsData.playoffs_placements.winners}\n`;
    csvContent += `Finals,${window.statisticsData.playoffs_placements.finals}\n`;
    csvContent += `Semifinals,${window.statisticsData.playoffs_placements.semifinals}\n`;
    csvContent += `Quarterfinals,${window.statisticsData.playoffs_placements.quarterfinals}\n`;
    csvContent += `Playoffs,${window.statisticsData.playoffs_placements.playoffs}\n`;
    csvContent += `Did Not Qualify,${window.statisticsData.playoffs_placements.regular_season}\n`;
    csvContent += `In Progress,${window.statisticsData.playoffs_placements.in_progress}\n`;
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

// Export statistics to PDF format
function exportToPDF() {
    // This would require a library like jsPDF
    // For now, use print functionality as fallback
    alert('PDF export will open print dialog. Use "Save as PDF" option in your browser.');
    window.print();
}

// Print statistics page
function printStatistics() {
    window.print();
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

//Format number with commas
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Calculate percentage
function calculatePercentage(part, total) {
    if (total === 0) return 0;
    return ((part / total) * 100).toFixed(1);
}

/**
 * Placeholder toggle for the Competitive / Community view tabs.
 * Purely visual for now — no content switching until the split is built.
 */
function switchStatsView(view, btnEl) {
    document.querySelectorAll('.stats-view-tabs .tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    btnEl.classList.add('active');
}

// ============================================
// EXPORT FUNCTIONS TO GLOBAL SCOPE
// ============================================
window.filterBySeason = filterBySeason;
window.exportToExcel = exportToExcel;
window.exportToPDF = exportToPDF;
window.printStatistics = printStatistics;
window.switchStatsView = switchStatsView;
window.showOverviewView = showOverviewView;
window.showGameView = showGameView;