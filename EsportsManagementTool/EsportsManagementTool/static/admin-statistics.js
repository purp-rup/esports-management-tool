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

    initFlyoutTriggers();

    // Initialize charts
    initializeLeagueCharts();
    initializeOverallTrendsChart();
    initializeLeagueTrendsChart();
    initializeTrendsDurationLabels();

    // Set up export handlers
    setupExportHandlers();

    // Set up floating game tabs pan arrows
    initStatsFloatingTabs();

    // Populate Notable Performances cards
    notableCarousel.init(window.statisticsData && window.statisticsData.notable_performances);

    // Re-run on resize if the mobile/desktop slot count actually changes
    window.addEventListener('resize', () => {
        const newSlotCount = getResponsiveSlotCount();
        if (newSlotCount !== notableCarousel.slotCount) {
            notableCarousel.init(window.statisticsData && window.statisticsData.notable_performances);
        }
        if (newSlotCount !== partnershipsCarousel.slotCount) {
            partnershipsCarousel.init(window.statisticsData && window.statisticsData.community_partnerships);
        }
        if (newSlotCount !== gamePartnershipsCarousel.slotCount &&
            document.getElementById('statsGameCommunityView').style.display !== 'none') {
            gamePartnershipsCarousel.init(gamePartnershipsCarousel.items);
        }
    });
});

// ============================================
// VIEW STATE & NAVIGATION
// ============================================
// Tracks which top-level tab (Competitive/Community) is active, so the
// floating game tabs know which per-game view to render.
let currentStatsView = 'competitive';

// Guards so community charts/carousels only render once, the first time their tab is opened
let communityChartsInitialized = false;
let communityTrendsChartsRendered = false;

// Toggles the Competitive / Community view tabs and swaps the corresponding content containers.
function switchStatsView(view, btnEl) {
    document.querySelectorAll('.stats-view-tabs .tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    btnEl.classList.add('active');
    currentStatsView = view;

    if (view === 'community') {
        if (!communityChartsInitialized) {
            communityChartsInitialized = true;
            partnershipsCarousel.init(window.statisticsData && window.statisticsData.community_partnerships);
            initializeDivisionCharts();
        }
    }

    // Re-render whichever floating tab (Overview or a specific game) is
    // currently selected so it reflects the newly active Competitive/Community view
    const activeTab = document.querySelector('.stats-floating-tab.active');
    const gameId = activeTab ? activeTab.dataset.game : 'overview';

    if (gameId === 'overview') {
        showOverviewView();
    } else if (view === 'community') {
        showCommunityGameView(gameId, activeTab.querySelector('.stats-floating-tab-label').textContent, activeTab.dataset.icon);
    } else {
        showGameView(gameId, activeTab.querySelector('.stats-floating-tab-label').textContent, activeTab.dataset.icon);
    }
}

function showOverviewView() {
    document.getElementById('statsGameView').style.display = 'none';
    document.getElementById('statsGameCommunityView').style.display = 'none';

    if (currentStatsView === 'community') {
        document.getElementById('statsOverviewView').style.display = 'none';
        document.getElementById('statsCommunityView').style.display = '';

        if (!communityTrendsChartsRendered) {
            communityTrendsChartsRendered = true;
            initializeCommunityOverallTrendsChart();
            initializeCommunityGameTrendsChart();
        }
    } else {
        document.getElementById('statsOverviewView').style.display = '';
        document.getElementById('statsCommunityView').style.display = 'none';
    }
}

// Pulls a game's data after selecting its tab
function showGameView(gameId, gameTitle, gameIconUrl) {
    document.getElementById('statsOverviewView').style.display = 'none';
    document.getElementById('statsCommunityView').style.display = 'none';
    document.getElementById('statsGameCommunityView').style.display = 'none';
    document.getElementById('statsGameView').style.display = '';
    document.getElementById('gameViewTitleText').textContent = gameTitle;

    const titleIcon = document.querySelector('#statsGameView .game-view-title-icon');
    if (titleIcon) {
        titleIcon.innerHTML = gameIconUrl
            ? `<img src="${gameIconUrl}" alt="${gameTitle}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-gamepad\\'></i>';">`
            : '<i class="fas fa-gamepad"></i>';
    }

    // Immediate feedback while the fetch below is in flight
    document.getElementById('gameStatsTableWrap').style.display = 'none';
    document.getElementById('gameStatsCardsWrap').style.display = 'none';
    document.getElementById('gameStatsLoading').style.display = '';

    const seasonParam = window.selectedSeason ? `?season_id=${window.selectedSeason}` : '';

    fetch(`/api/admin/statistics/game/${gameId}${seasonParam}`)
        .then(res => res.json())
        .then(data => {
            // Reveal the content before rendering into it
            document.getElementById('gameStatsLoading').style.display = 'none';
            document.getElementById('gameStatsTableWrap').style.display = '';
            document.getElementById('gameStatsCardsWrap').style.display = '';
            renderGameStatsTable(data.statistics);
        })
        .catch(() => {
            document.getElementById('gameStatsLoading').style.display = 'none';
            document.getElementById('gameStatsTableWrap').style.display = '';
            document.getElementById('gameStatsCardsWrap').style.display = '';
            renderGameStatsTable(getMockGameStats()); // TEMP fallback until backend returns real match data
        });
}

// Pulls a game's Community-tab data (partnerships for now; the event-type
// chart and event list join this once the backend returns them)
function showCommunityGameView(gameId, gameTitle, gameIconUrl) {
    document.getElementById('statsOverviewView').style.display = 'none';
    document.getElementById('statsCommunityView').style.display = 'none';
    document.getElementById('statsGameView').style.display = 'none';
    document.getElementById('statsGameCommunityView').style.display = '';
    document.getElementById('communityGameViewTitleText').textContent = gameTitle;

    const titleIcon = document.querySelector('#statsGameCommunityView .game-view-title-icon');
    if (titleIcon) {
        titleIcon.innerHTML = gameIconUrl
            ? `<img src="${gameIconUrl}" alt="${gameTitle}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-gamepad\\'></i>';">`
            : '<i class="fas fa-gamepad"></i>';
    }

    // Immediate feedback while the fetch below is in flight
    document.getElementById('communityGameContent').style.display = 'none';
    document.getElementById('communityGameLoading').style.display = '';

    const seasonParam = window.selectedSeason ? `?season_id=${window.selectedSeason}` : '';

    fetch(`/api/admin/statistics/game/${gameId}/community${seasonParam}`)
        .then(res => res.json())
        .then(data => {
            document.getElementById('communityGameLoading').style.display = 'none';
            document.getElementById('communityGameContent').style.display = '';
            gamePartnershipsCarousel.init(data.statistics.partnerships);
            renderCommunityGameEventTypeChart(data.statistics.events_by_type);
            renderCommunityGameEventsList(data.statistics.events);
        })
        .catch(() => {
            document.getElementById('communityGameLoading').style.display = 'none';
            document.getElementById('communityGameContent').style.display = '';
            gamePartnershipsCarousel.init([]);
            renderCommunityGameEventTypeChart({});
            renderCommunityGameEventsList([]);
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
            } else if (currentStatsView === 'community') {
                showCommunityGameView(gameId, btn.querySelector('.stats-floating-tab-label').textContent, btn.dataset.icon);
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
// SEASON FILTERING
// ============================================
// Reloads the page with the selected season as a query param
function filterBySeason(seasonId) {
    window.location.href = seasonId
        ? `/admin/statistics?season_id=${seasonId}`
        : '/admin/statistics?season_id=all';
}

// ============================================
// CHART HELPERS (SHARED)
// ============================================
/**
 * Shared look for the standard bar charts (league cards, division panels,
 * per-game event-type chart): flat bars, no legend, dark tooltip, muted
 * axis labels. Pass overrides for anything chart-specific — they get
 * shallow-merged over the defaults.
 */
function buildBarChartOptions(overrides = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 10 } },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleFont: { size: 14 },
                bodyFont: { size: 13 }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: { color: '#9ca3af', font: { size: 11 } },
                grid: { color: 'rgba(156, 163, 175, 0.1)' }
            },
            x: {
                ticks: { color: '#9ca3af', font: { size: 10 }, maxRotation: 45, minRotation: 45 },
                grid: { display: false }
            }
        },
        ...overrides
    };
}

// Chart.js instances for each trends panel, keyed by panel name
const trendsChartInstances = {
    overall: { main: null, axis: null },
    league: { main: null, axis: null },
    communityOverall: { main: null, axis: null },
    communityGame: { main: null, axis: null }
};

/**
 * Draws y-axis labels into the frozen overlay using the chart's own
 * computed tick positions, so they can't drift out of sync with the bars.
 */
function syncFrozenAxisLabels(chart, axisEl) {
    if (!axisEl) return;
    axisEl.innerHTML = '';

    const yScale = chart.scales.y;
    const LABEL_HALF_HEIGHT = 7; // ~half the label's own line-height at 11px font

    yScale.ticks.forEach(tick => {
        const pixel = yScale.getPixelForValue(tick.value);
        // Clamp so a centered label can never render above the visible box,
        // no matter what the chart's own layout padding works out to.
        const safeTop = Math.max(pixel, LABEL_HALF_HEIGHT);

        const label = document.createElement('div');
        label.className = 'trends-chart-axis-label';
        label.style.top = `${safeTop}px`;
        label.textContent = tick.label ?? tick.value;
        axisEl.appendChild(label);
    });
}

// Render a trend chart based on provided data and applied filters
function renderTrendsChart(key, elIds, data, statKey, statLabel, color) {
    const canvas = document.getElementById(elIds.canvas);
    const axisEl = document.getElementById(elIds.axisCanvas);
    const scrollWrap = document.getElementById(elIds.scrollWrap);
    const innerWrap = document.getElementById(elIds.innerWrap);
    if (!canvas) return;

    const labels = data.map(d => d.season_name);
    const values = data.map(d => d[statKey]);

    const MIN_VISIBLE_BARS = 4;
    const needsScroll = data.length > MIN_VISIBLE_BARS;

    const viewportWidth = scrollWrap ? scrollWrap.clientWidth : 0;
    const pxPerBar = viewportWidth > 0 ? viewportWidth / MIN_VISIBLE_BARS : 90;

    innerWrap.style.width = needsScroll ? `${data.length * pxPerBar}px` : '100%';

    const maxValue = values.length ? Math.max(...values) : 0;
    const yMax = maxValue > 0 ? Math.ceil(maxValue * 1.2) : 5;

    // Widen the frozen axis strip to fit however many digits the largest tick label needs.
    const axisWrap = axisEl ? axisEl.closest('.trends-chart-axis-wrap') : null;
    const digitCount = String(yMax).length;
    const axisWidth = Math.max(42, 26 + digitCount * 9);
    if (axisWrap) axisWrap.style.width = `${axisWidth}px`;
    if (scrollWrap) scrollWrap.style.paddingLeft = `${axisWidth}px`;

    const instances = trendsChartInstances[key];
    if (instances.main) {
        instances.main.destroy();
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
                        display: false, // drawn separately in the frozen overlay
                        precision: 0,
                        maxTicksLimit: 6
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
        },
        plugins: [{
            id: 'frozenAxisSync',
            afterUpdate: (chart) => syncFrozenAxisLabels(chart, axisEl)
        }]
    });

    if (needsScroll && scrollWrap) {
        requestAnimationFrame(() => {
            scrollWrap.scrollLeft = scrollWrap.scrollWidth;
        });
    }
}

/**
 * Shared behavior behind every trends filter dropdown: mark the clicked
 * item active (clearing both plain and flyout items in its panel), update
 * the visible label, close the open panel, and re-render the chart.
 */
function applyTrendsFilter({ labelId, panelId, label, el, apply, render }) {
    apply();
    document.getElementById(labelId).textContent = label;
    document.querySelectorAll(`#${panelId} .filter-box-item`).forEach(item => item.classList.remove('active'));
    document.querySelectorAll(`#${panelId} .filter-box-flyout-item`).forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    closeAllFilterPanels();
    render();
}

/**
 * Builds a "{oldest season in range} - Now" label for the past-N-seasons
 * duration options, based on the shared program_trends season list.
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
    const panelPrefixes = ['overall', 'league', 'communityOverall', 'communityGame'];

    [2, 4, 8].forEach(n => {
        const label = formatDurationRangeLabel(n);
        panelPrefixes.forEach(prefix => {
            const el = document.getElementById(`${prefix}Duration${n}Item`);
            if (!el) return;
            el.textContent = label;
            el.style.display = totalSeasons < n ? 'none' : '';
        });
    });
}

// ============================================
// COMPETITIVE CHARTS
// ============================================
// Initialize bar charts for each league
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
            options: buildBarChartOptions()
       });
    });
}

// --- Overall Trends (All-Time view) ---
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

// program_trends is ordered oldest -> newest, so "past N seasons" = last N entries
function getOverallTrendsFilteredData() {
    const allData = (window.statisticsData && window.statisticsData.program_trends) || [];
    if (overallTrendsDuration === '2') return allData.slice(-2);
    if (overallTrendsDuration === '4') return allData.slice(-4);
    if (overallTrendsDuration === '8') return allData.slice(-8);
    return allData;
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

function setOverallTrendsStat(stat, el) {
    applyTrendsFilter({
        labelId: 'overallStatFilterLabel', panelId: 'overallStatFilterPanel',
        label: TRENDS_STAT_LABELS[stat], el,
        apply: () => { overallTrendsStat = stat; },
        render: initializeOverallTrendsChart
    });
}

function setOverallTrendsDuration(duration, el) {
    const labelText = duration === 'all' ? 'All-Time' : formatDurationRangeLabel(Number(duration));
    applyTrendsFilter({
        labelId: 'overallDurationFilterLabel', panelId: 'overallDurationFilterPanel',
        label: labelText, el,
        apply: () => { overallTrendsDuration = duration; },
        render: initializeOverallTrendsChart
    });
}

// --- Trends by League (All-Time view) ---
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

function setLeagueTrendsLeague(leagueId, leagueName, el) {
    applyTrendsFilter({
        labelId: 'leagueFilterLabel', panelId: 'leagueFilterPanel',
        label: leagueName, el,
        apply: () => { leagueTrendsLeagueId = leagueId; },
        render: initializeLeagueTrendsChart
    });
}

function setLeagueTrendsStat(stat, el) {
    applyTrendsFilter({
        labelId: 'leagueStatFilterLabel', panelId: 'leagueStatFilterPanel',
        label: TRENDS_STAT_LABELS[stat], el,
        apply: () => { leagueTrendsStat = stat; },
        render: initializeLeagueTrendsChart
    });
}

function setLeagueTrendsDuration(duration, el) {
    const labelText = duration === 'all' ? 'All-Time' : formatDurationRangeLabel(Number(duration));
    applyTrendsFilter({
        labelId: 'leagueDurationFilterLabel', panelId: 'leagueDurationFilterPanel',
        label: labelText, el,
        apply: () => { leagueTrendsDuration = duration; },
        render: initializeLeagueTrendsChart
    });
}

// ============================================
// COMMUNITY CHARTS
// ============================================
const DIVISION_CHART_PALETTE = [
    { bg: 'rgba(121, 189, 233, 0.7)', border: 'rgba(121, 189, 233, 1)' },
    { bg: 'rgba(167, 139, 250, 0.7)', border: 'rgba(167, 139, 250, 1)' },
    { bg: 'rgba(134, 239, 172, 0.7)', border: 'rgba(134, 239, 172, 1)' },
    { bg: 'rgba(250, 204, 21, 0.7)', border: 'rgba(250, 204, 21, 1)' },
    { bg: 'rgba(252, 165, 165, 0.7)', border: 'rgba(252, 165, 165, 1)' },
    { bg: 'rgba(147, 197, 253, 0.7)', border: 'rgba(147, 197, 253, 1)' }
];

/**
 * One bar chart per division panel on the Community Events Scorecard —
 * bars are that division's games, values are each game's event count.
 */
function initializeDivisionCharts() {
    if (!window.statisticsData || !window.statisticsData.community_division_breakdown) {
        console.log('No community division data available for charts');
        return;
    }

    const divisions = window.statisticsData.community_division_breakdown;

    divisions.forEach((division, index) => {
        const canvasId = `divisionChart${index + 1}`;
        const canvas = document.getElementById(canvasId);

        if (!canvas) {
            console.warn(`Canvas ${canvasId} not found`);
            return;
        }

        const ctx = canvas.getContext('2d');
        const games = division.games || [];

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: games.map(g => g.game_abbreviation),
                datasets: [{
                    label: division.division_name,
                    data: games.map(g => g.event_count),
                    backgroundColor: games.map((g, i) => DIVISION_CHART_PALETTE[i % DIVISION_CHART_PALETTE.length].bg),
                    borderColor: games.map((g, i) => DIVISION_CHART_PALETTE[i % DIVISION_CHART_PALETTE.length].border),
                    borderWidth: 2
                }]
            },
            options: buildBarChartOptions()
        });
    });
}

// --- Per-Game Events-by-Type Chart (game tab view) ---
let communityGameChartInstance = null;

const COMMUNITY_GAME_EVENT_TYPE_IDS = {
    Tournament: 'communityGameCountTournament',
    Match: 'communityGameCountMatch',
    Practice: 'communityGameCountPractice',
    Event: 'communityGameCountEvent',
    Misc: 'communityGameCountMisc'
};

/**
 * Fills the panel-row counts and (re)draws the 5-bar events-by-type chart.
 * Colors come from COMMUNITY_TREND_COLORS.type so they match the legend.
 */
function renderCommunityGameEventTypeChart(eventsByType) {
    eventsByType = eventsByType || {};

    Object.entries(COMMUNITY_GAME_EVENT_TYPE_IDS).forEach(([type, id]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = eventsByType[type] || 0;
    });

    const canvas = document.getElementById('communityGameEventTypeChart');
    if (!canvas) return;

    if (communityGameChartInstance) {
        communityGameChartInstance.destroy();
    }

    const labels = Object.keys(COMMUNITY_GAME_EVENT_TYPE_IDS);
    const colors = labels.map(type => COMMUNITY_TREND_COLORS.type[type]);

    const ctx = canvas.getContext('2d');
    communityGameChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Events',
                data: labels.map(t => eventsByType[t] || 0),
                backgroundColor: colors.map(c => c.bg),
                borderColor: colors.map(c => c.border),
                borderWidth: 2
            }]
        },
        options: buildBarChartOptions()
    });
}

// --- Overall Event Trends ---
let communityOverallStat = 'total';
let communityOverallEventType = null;
let communityOverallDuration = 'all';

const COMMUNITY_STAT_LABELS = {
    total: 'Total Events',
    partnerships: 'Events with Partnerships',
    scheduled: 'Scheduled Events'
};

const COMMUNITY_TREND_COLORS = {
    total: { bg: 'rgba(121, 189, 233, 0.7)', border: 'rgba(121, 189, 233, 1)' },
    partnerships: { bg: 'rgba(46, 204, 113, 0.7)', border: 'rgba(46, 204, 113, 1)' },
    scheduled: { bg: 'rgba(255, 152, 0, 0.7)', border: 'rgba(255, 152, 0, 1)' },
    // Matches the .legend-color swatch colors
    type: {
        Tournament: { bg: 'rgba(167, 139, 250, 0.7)', border: 'rgba(167, 139, 250, 1)' },
        Match: { bg: 'rgba(252, 165, 165, 0.7)', border: 'rgba(252, 165, 165, 1)' },
        Practice: { bg: 'rgba(134, 239, 172, 0.7)', border: 'rgba(134, 239, 172, 1)' },
        Event: { bg: 'rgba(147, 197, 253, 0.7)', border: 'rgba(147, 197, 253, 1)' },
        Misc: { bg: 'rgba(250, 204, 21, 0.7)', border: 'rgba(250, 204, 21, 1)' }
    }
};

/* Pulls the right count off a community_trends/community_game_trends season
 * entry based on the current stat filter (and event type, when stat === 'type')
 */
function getCommunityStatValue(entry, stat, eventType) {
    if (stat === 'type') return (entry.events_by_type && entry.events_by_type[eventType]) || 0;
    if (stat === 'partnerships') return entry.events_with_partnerships;
    if (stat === 'scheduled') return entry.scheduled_events;
    return entry.total_events;
}

function getCommunityStatColor(stat, eventType) {
    if (stat === 'type') return COMMUNITY_TREND_COLORS.type[eventType] || COMMUNITY_TREND_COLORS.total;
    return COMMUNITY_TREND_COLORS[stat] || COMMUNITY_TREND_COLORS.total;
}

function getCommunityStatLabel(stat, eventType) {
    return stat === 'type' ? `${eventType} Events` : COMMUNITY_STAT_LABELS[stat];
}

/**
 * community_trends trimmed to the duration filter, flattened to
 * { season_name, value } so renderTrendsChart can consume it like the others.
 */
function getCommunityOverallTrendsFilteredData() {
    const allData = (window.statisticsData && window.statisticsData.community_trends) || [];
    let trimmed = allData;
    if (communityOverallDuration === '2') trimmed = allData.slice(-2);
    else if (communityOverallDuration === '4') trimmed = allData.slice(-4);
    else if (communityOverallDuration === '8') trimmed = allData.slice(-8);

    return trimmed.map(entry => ({
        season_name: entry.season_name,
        value: getCommunityStatValue(entry, communityOverallStat, communityOverallEventType)
    }));
}

function initializeCommunityOverallTrendsChart() {
    const data = getCommunityOverallTrendsFilteredData();
    renderTrendsChart(
        'communityOverall',
        { canvas: 'communityOverallTrendsChart', axisCanvas: 'communityOverallTrendsAxisChart', scrollWrap: 'communityOverallTrendsScroll', innerWrap: 'communityOverallTrendsInner' },
        data,
        'value',
        getCommunityStatLabel(communityOverallStat, communityOverallEventType),
        getCommunityStatColor(communityOverallStat, communityOverallEventType)
    );
}

function setCommunityOverallStat(stat, el) {
    applyTrendsFilter({
        labelId: 'communityOverallStatFilterLabel', panelId: 'communityOverallStatFilterPanel',
        label: COMMUNITY_STAT_LABELS[stat], el,
        apply: () => { communityOverallStat = stat; communityOverallEventType = null; },
        render: initializeCommunityOverallTrendsChart
    });
}

function setCommunityOverallEventType(type, el) {
    applyTrendsFilter({
        labelId: 'communityOverallStatFilterLabel', panelId: 'communityOverallStatFilterPanel',
        label: `Event Type: ${type}`, el,
        apply: () => { communityOverallStat = 'type'; communityOverallEventType = type; },
        render: initializeCommunityOverallTrendsChart
    });
}

function setCommunityOverallDuration(duration, el) {
    const labelText = duration === 'all' ? 'All-Time' : formatDurationRangeLabel(Number(duration));
    applyTrendsFilter({
        labelId: 'communityOverallDurationFilterLabel', panelId: 'communityOverallDurationFilterPanel',
        label: labelText, el,
        apply: () => { communityOverallDuration = duration; },
        render: initializeCommunityOverallTrendsChart
    });
}

// --- Trends by Game ---
let communityGameTrendsGameId = null;
let communityGameTrendsStat = 'total';
let communityGameTrendsEventType = null;
let communityGameTrendsDuration = 'all';

/**
 * Same idea as getCommunityOverallTrendsFilteredData(), scoped to the
 * selected game. Defaults to the first game on first render.
 */
function getCommunityGameTrendsFilteredData() {
    const allGameTrends = (window.statisticsData && window.statisticsData.community_game_trends) || [];
    if (communityGameTrendsGameId === null && allGameTrends.length) {
        communityGameTrendsGameId = allGameTrends[0].game_id;
    }

    const gameEntry = allGameTrends.find(g => g.game_id === communityGameTrendsGameId);
    const seasonData = gameEntry ? gameEntry.trends : [];

    let trimmed = seasonData;
    if (communityGameTrendsDuration === '2') trimmed = seasonData.slice(-2);
    else if (communityGameTrendsDuration === '4') trimmed = seasonData.slice(-4);
    else if (communityGameTrendsDuration === '8') trimmed = seasonData.slice(-8);

    return trimmed.map(entry => ({
        season_name: entry.season_name,
        value: getCommunityStatValue(entry, communityGameTrendsStat, communityGameTrendsEventType)
    }));
}

function initializeCommunityGameTrendsChart() {
    const data = getCommunityGameTrendsFilteredData();
    renderTrendsChart(
        'communityGame',
        { canvas: 'communityGameTrendsChart', axisCanvas: 'communityGameTrendsAxisChart', scrollWrap: 'communityGameTrendsScroll', innerWrap: 'communityGameTrendsInner' },
        data,
        'value',
        getCommunityStatLabel(communityGameTrendsStat, communityGameTrendsEventType),
        getCommunityStatColor(communityGameTrendsStat, communityGameTrendsEventType)
    );
}

function setCommunityGameTrendsGame(gameId, gameTitle, el) {
    applyTrendsFilter({
        labelId: 'communityGameFilterLabel', panelId: 'communityGameFilterPanel',
        label: gameTitle, el,
        apply: () => { communityGameTrendsGameId = gameId; },
        render: initializeCommunityGameTrendsChart
    });
}

function setCommunityGameTrendsStat(stat, el) {
    applyTrendsFilter({
        labelId: 'communityGameStatFilterLabel', panelId: 'communityGameStatFilterPanel',
        label: COMMUNITY_STAT_LABELS[stat], el,
        apply: () => { communityGameTrendsStat = stat; communityGameTrendsEventType = null; },
        render: initializeCommunityGameTrendsChart
    });
}

function setCommunityGameTrendsEventType(type, el) {
    applyTrendsFilter({
        labelId: 'communityGameStatFilterLabel', panelId: 'communityGameStatFilterPanel',
        label: `Event Type: ${type}`, el,
        apply: () => { communityGameTrendsStat = 'type'; communityGameTrendsEventType = type; },
        render: initializeCommunityGameTrendsChart
    });
}

function setCommunityGameTrendsDuration(duration, el) {
    const labelText = duration === 'all' ? 'All-Time' : formatDurationRangeLabel(Number(duration));
    applyTrendsFilter({
        labelId: 'communityGameDurationFilterLabel', panelId: 'communityGameDurationFilterPanel',
        label: labelText, el,
        apply: () => { communityGameTrendsDuration = duration; },
        render: initializeCommunityGameTrendsChart
    });
}

// ============================================
// DATA TABLES & LISTS
// ============================================
/**
 * Renders a list of items into a table (desktop) and card list (mobile),
 * grouped into collapsible season sections. Shared by renderGameStatsTable() and renderCommunityGameEventsList()
 */
function renderSeasonGroupedList({ items, tbody, cardsWrap, toggleFn, getSeasonName, getConference = null, seasonCardExtra = null, buildRow, buildCard }) {
    const blockClasses = ['game-team-block-a', 'game-team-block-b', 'game-team-block-c'];
    let previousConference = null;
    let previousSeason; // stays undefined for season-filtered views (no season_name sent)
    let seasonIndex = -1;

    items.forEach((item, i) => {
        const seasonName = getSeasonName(item);
        const seasonChanged = seasonName != null && seasonName !== previousSeason;

        if (seasonChanged) {
            seasonIndex++;
            const currentSeasonIdx = seasonIndex;

            // Extra breathing room before every season header after the first
            // (tagged with the PRIOR season's index so it collapses along with it)
            if (i > 0) {
                const seasonGapRow = document.createElement('tr');
                seasonGapRow.className = 'game-stats-league-gap';
                seasonGapRow.dataset.seasonIdx = currentSeasonIdx - 1;
                seasonGapRow.innerHTML = '<td colspan="6"></td>';
                tbody.appendChild(seasonGapRow);
            }

            const seasonRow = document.createElement('tr');
            seasonRow.className = 'game-stats-season-header game-stats-season-header-toggle';
            seasonRow.dataset.seasonIdx = currentSeasonIdx;
            seasonRow.innerHTML = `
                <td colspan="6">
                    <i class="fas fa-chevron-down game-stats-season-chevron"></i>
                    ${seasonName || 'Unknown Season'}
                </td>
            `;
            seasonRow.onclick = () => toggleFn(currentSeasonIdx);
            tbody.appendChild(seasonRow);

            const seasonCard = document.createElement('div');
            seasonCard.className = 'game-stats-card-season-header game-stats-season-header-toggle';
            seasonCard.dataset.seasonIdx = currentSeasonIdx;
            seasonCard.innerHTML = `
                <span class="game-stats-card-season-title">
                    <i class="fas fa-chevron-down game-stats-season-chevron"></i>
                    ${seasonName || 'Unknown Season'}
                </span>
                ${seasonCardExtra ? seasonCardExtra(item) : ''}
            `;
            seasonCard.onclick = () => toggleFn(currentSeasonIdx);
            cardsWrap.appendChild(seasonCard);
        } else if (getConference && i > 0 && getConference(item) !== previousConference) {
            // Small gap between league groups within the same season
            const gapRow = document.createElement('tr');
            gapRow.className = 'game-stats-league-gap';
            gapRow.dataset.seasonIdx = seasonIndex;
            gapRow.innerHTML = '<td colspan="6"></td>';
            tbody.appendChild(gapRow);
        }

        if (getConference) previousConference = getConference(item);
        previousSeason = seasonName;

        const blockClass = blockClasses[i % blockClasses.length];

        const row = document.createElement('tr');
        row.className = `${blockClass} game-stats-season-body`;
        row.dataset.seasonIdx = seasonIndex;
        row.innerHTML = buildRow(item, blockClass);
        tbody.appendChild(row);

        const card = document.createElement('div');
        card.className = `game-stats-card ${blockClass} game-stats-season-body`;
        card.dataset.seasonIdx = seasonIndex;
        card.innerHTML = buildCard(item, blockClass);
        cardsWrap.appendChild(card);
    });
}

// Builds the game tab data sheet (table for desktop, cards for mobile)
function renderGameStatsTable(gameStats) {
    const tbody = document.getElementById('gameStatsTableBody');
    const cardsWrap = document.getElementById('gameStatsCardsWrap');
    tbody.innerHTML = '';
    cardsWrap.innerHTML = '';

    renderSeasonGroupedList({
        items: gameStats.teams || [],
        tbody,
        cardsWrap,
        toggleFn: toggleGameStatsSeason,
        getSeasonName: team => team.season_name,
        getConference: team => team.conference,
        seasonCardExtra: team => `<span class="game-stats-card-season-manager">${team.game_manager || gameStats.game_manager || '—'}</span>`,
        buildRow: team => `
            <td>${team.game_manager || gameStats.game_manager || '—'}</td>
            <td class="game-stats-team-name">${team.team_title}</td>
            <td>${team.conference || '—'}</td>
            <td>${renderMatchList(team.regular_season_matches)}</td>
            <td><span class="game-stats-record-badge">${team.regular_season_record || '—'}</span></td>
            <td>
                <div class="game-stats-qualified">${team.playoffs_status || ''}</div>
                ${renderMatchList(team.playoffs_matches)}
                <div class="game-stats-outcome">${team.playoffs_outcome || ''}</div>
            </td>
        `,
        buildCard: team => `
            <div class="game-stats-card-header">
                <span class="game-stats-card-team">${team.team_title}</span>
                <span class="game-stats-card-conference">${team.conference || '—'}</span>
            </div>
            ${team.season_name ? '' : `
            <div class="game-stats-card-row">
                <span class="game-stats-card-label">Manager</span>
                <span class="game-stats-card-value">${team.game_manager || gameStats.game_manager || '—'}</span>
            </div>
            `}
            <div class="game-stats-card-row">
                <span class="game-stats-card-label">Regular Season</span>
                <span class="game-stats-card-value">${renderMatchList(team.regular_season_matches, false) || '—'}</span>
            </div>
            <div class="game-stats-card-row">
                <span class="game-stats-card-label">Record</span>
                <span class="game-stats-card-value"><span class="game-stats-record-badge">${team.regular_season_record || '—'}</span></span>
            </div>
            <div class="game-stats-card-row game-stats-card-playoffs">
                <span class="game-stats-card-label">Playoffs</span>
                <span class="game-stats-card-value">
                    <div class="game-stats-qualified">${team.playoffs_status || ''}</div>
                    ${renderMatchList(team.playoffs_matches, false)}
                    <div class="game-stats-outcome">${team.playoffs_outcome || ''}</div>
                </span>
            </div>
        `
    });
}

/**
 * Same season-grouping pattern as renderGameStatsTable(), but for events,
 * scoped to its own containers so it can't collide with that table's classes.
 */
function renderCommunityGameEventsList(events) {
    const tbody = document.getElementById('communityGameEventsTableBody');
    const cardsWrap = document.getElementById('communityGameEventsCardsWrap');
    tbody.innerHTML = '';
    cardsWrap.innerHTML = '';

    const titleEl = document.getElementById('communityGameEventsTitle');
    if (titleEl) titleEl.textContent = `All Events (${events ? events.length : 0})`;

    if (!events || events.length === 0) {
        tbody.innerHTML = `
            <tr class="game-stats-loading-row">
                <td colspan="6">No events recorded for this period</td>
            </tr>
        `;
        cardsWrap.innerHTML = `<div class="game-stats-card-loading">No events recorded for this period</div>`;
        return;
    }

    const getAssociatedGames = event => (event.associated_games && event.associated_games.length)
        ? event.associated_games.join(', ')
        : '—';

    renderSeasonGroupedList({
        items: events,
        tbody,
        cardsWrap,
        toggleFn: toggleCommunityEventsSeason,
        getSeasonName: event => event.season_name,
        buildRow: event => `
            <td class="game-stats-team-name">${event.name}</td>
            <td>${event.date || '—'}</td>
            <td>${event.event_type}</td>
            <td>${event.start_time || '—'}</td>
            <td class="game-stats-cell-wrap">${getAssociatedGames(event)}</td>
            <td class="game-stats-cell-wrap">${event.description}</td>
        `,
        buildCard: event => `
            <div class="game-stats-card-header">
                <span class="game-stats-card-team">${event.name}</span>
                <span class="game-stats-card-conference">${event.event_type}</span>
            </div>
            <div class="game-stats-card-row">
                <span class="game-stats-card-label">Date</span>
                <span class="game-stats-card-value">${event.date || '—'}</span>
            </div>
            <div class="game-stats-card-row">
                <span class="game-stats-card-label">Start Time</span>
                <span class="game-stats-card-value">${event.start_time || '—'}</span>
            </div>
            <div class="game-stats-card-row">
                <span class="game-stats-card-label">Associated Games</span>
                <span class="game-stats-card-value game-stats-cell-wrap">${getAssociatedGames(event)}</span>
            </div>
            <div class="game-stats-card-row">
                <span class="game-stats-card-label">Description</span>
                <span class="game-stats-card-value game-stats-cell-wrap">${event.description}</span>
            </div>
        `
    });
}

// Expands/collapses a season's rows in both the table and card views at once.
function toggleSeasonGroup(seasonIdx, scopeSelectors = [null]) {
    const scopePrefixes = scopeSelectors.map(s => s ? `${s} ` : '');
    const headerSelector = scopePrefixes.map(p => `${p}.game-stats-season-header-toggle[data-season-idx="${seasonIdx}"]`).join(', ');
    const header = document.querySelector(headerSelector);
    if (!header) return;
    const isCollapsing = !header.classList.contains('game-stats-season-collapsed');

    document.querySelectorAll(headerSelector)
        .forEach(h => h.classList.toggle('game-stats-season-collapsed', isCollapsing));

    const bodySelector = scopePrefixes.map(p => `${p}[data-season-idx="${seasonIdx}"]`).join(', ');
    document.querySelectorAll(bodySelector).forEach(el => {
        if (!el.classList.contains('game-stats-season-header-toggle')) {
            el.style.display = isCollapsing ? 'none' : '';
        }
    });
}

function toggleGameStatsSeason(seasonIdx) {
    toggleSeasonGroup(seasonIdx);
}

function toggleCommunityEventsSeason(seasonIdx) {
    toggleSeasonGroup(seasonIdx, ['#communityGameEventsTableBody', '#communityGameEventsCardsWrap']);
}

// Displays a list of matches down via data
function renderMatchList(matches, showLabel = true) {
    if (!matches || !matches.length) return '';
    return `<div class="game-stats-match-list">` +
        matches.map(m => `
            <div class="match-row">
                ${showLabel ? `${m.label}: ` : ''}<span class="match-score ${m.result === 'loss' ? 'loss' : ''}">${m.score}</span>
                ${m.opponent ? `(vs ${m.opponent})` : ''}
            </div>
        `).join('') +
    `</div>`;
}

// ============================================
// CAROUSELS (Notable Performances / Partnerships)
// ============================================
function getResponsiveSlotCount() {
    return window.matchMedia('(max-width: 768px)').matches ? 1 : 3;
}

/**
 * Generic fade-cycle carousel used by Notable Performances and both
 * Partnership carousels. Handles slot/index bookkeeping, duplicate-avoidance
 * across visible slots, and the interval-driven cycle. Call .init(items) to
 * (re)populate — pass [] or omit to hide the section.
 */
function createCardCarousel({ sectionSelector, listId, renderCard, getSlotCount = getResponsiveSlotCount }) {
    let items = [];
    let nextSlot = 0;
    let nextIndex = 0;
    let intervalId = null;
    let visibleIds = []; // item.id currently shown per slot (index = slot)
    let slotCount = 3;

    function cycle() {
        const container = document.getElementById(listId);
        if (!container || items.length <= slotCount) return;

        const card = container.querySelectorAll('.notable-performance-card')[nextSlot];
        if (!card) return;

        // Skip forward past any item already showing in another visible
        // slot, so the same result never appears twice at once
        let next = items[nextIndex];
        let attempts = 0;
        while (visibleIds.some((id, slot) => slot !== nextSlot && id === next.id) && attempts < items.length) {
            nextIndex = (nextIndex + 1) % items.length;
            next = items[nextIndex];
            attempts++;
        }

        card.classList.add('notable-performance-card--fading');
        setTimeout(() => {
            renderCard(card, next);
            visibleIds[nextSlot] = next.id;
            card.classList.remove('notable-performance-card--fading');
        }, 300);

        nextSlot = (nextSlot + 1) % slotCount;
        nextIndex = (nextIndex + 1) % items.length;
    }

    function init(data) {
        const section = document.querySelector(sectionSelector);
        const container = document.getElementById(listId);
        if (!section || !container) return;

        items = data || [];

        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }

        if (items.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';
        slotCount = getSlotCount();
        const cards = Array.from(container.querySelectorAll('.notable-performance-card'));
        const visibleCount = Math.min(slotCount, items.length);

        visibleIds = [];
        cards.forEach((card, i) => {
            card.style.display = i < visibleCount ? '' : 'none';
            if (i < visibleCount) {
                renderCard(card, items[i]);
                visibleIds[i] = items[i].id;
            }
        });

        container.classList.toggle('notable-performances-list--centered', items.length < slotCount);

        if (items.length > visibleCount) {
            nextSlot = 0;
            nextIndex = visibleCount % items.length;
            intervalId = setInterval(cycle, 4000);
        }
    }

    return { init, get slotCount() { return slotCount; }, get items() { return items; } };
}

const notableCarousel = createCardCarousel({
    sectionSelector: '.notable-performances',
    listId: 'notablePerformancesList',
    renderCard: renderNotableCard
});

const partnershipsCarousel = createCardCarousel({
    sectionSelector: '.community-partnerships',
    listId: 'communityPartnershipsList',
    renderCard: renderPartnershipCard
});

const gamePartnershipsCarousel = createCardCarousel({
    sectionSelector: '.community-game-partnerships',
    listId: 'communityGamePartnershipsList',
    renderCard: renderPartnershipCard
});

// Fill a single notable-performance-card with data
function renderNotableCard(cardEl, performance) {
    const avatar = cardEl.querySelector('.notable-performance-avatar');
    const teamEl = cardEl.querySelector('.notable-performance-team');
    const metaEl = cardEl.querySelector('.notable-performance-meta');
    const seasonEl = cardEl.querySelector('.notable-performance-season');

    if (avatar) {
        avatar.innerHTML = performance.game_icon_url
            ? `<img src="${performance.game_icon_url}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='';">`
            : '';
    }
    if (teamEl) teamEl.textContent = performance.team_name;
    if (metaEl) metaEl.textContent = `${performance.placement} in ${performance.league_name}`;
    if (seasonEl) seasonEl.textContent = performance.season_name;
}

// Fill a single partnership card with data (shared by both partnership carousels)
function renderPartnershipCard(cardEl, partnership) {
    const avatar = cardEl.querySelector('.notable-performance-avatar');
    const nameEl = cardEl.querySelector('.notable-performance-team');
    const metaEl = cardEl.querySelector('.notable-performance-meta');
    const seasonEl = cardEl.querySelector('.notable-performance-season');

    if (avatar) {
        avatar.innerHTML = partnership.game_icon_url
            ? `<img src="${partnership.game_icon_url}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='';">`
            : '';
    }
    if (nameEl) nameEl.textContent = partnership.partnership_name;
    if (metaEl) metaEl.textContent = partnership.event_name;
    if (seasonEl) seasonEl.textContent = partnership.season_name;
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