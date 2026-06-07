from EsportsManagementTool import mysql
import MySQLdb.cursors


# ============================================
# LANDING PAGE STATISTICS
# ============================================
def index_statistics() -> list[str]:
    """Returns a list of statistics for use on the landing page."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        season_id = get_season_id(cursor)
        return get_season_stats(cursor, season_id)
    finally:
        cursor.close()


def reformat_stat(stat: int) -> str:
    """Reformats a statistic before it is displayed on the landing page."""
    brackets = {
        150: '150+',
        120: '120+',
        100: '100+',
        90: '90+',
        80: '80+',
        70: '70+',
        60: '60+',
        50: '50+',
        40: '40+',
        30: '30+',
        25: '25+',
        20: '20+',
        15: '15+',
        10: '10+',
    }

    for threshold, label in brackets.items():
        if stat >= threshold:
            return label

    return str(stat)


def get_season_id(cursor) -> int | None:
    """Returns the season_id that statistics should be displayed for."""

    # Check for active season
    cursor.execute("""
        SELECT season_id
        FROM seasons
        WHERE is_active = 1;
    """)
    row = cursor.fetchone()
    if row:
        return row['season_id']

    # Check for most recent season that has ended
    cursor.execute("""
        SELECT season_id
        FROM seasons
        WHERE end_date < CURDATE()
        ORDER BY end_date DESC
        LIMIT 1;
    """)
    row = cursor.fetchone()
    if row:
        return row['season_id']
    return None


def get_season_stats(cursor, season_id: int) -> list[str]:
    """Returns the season stats for a given season_id."""

    # Total player count for given season
    cursor.execute("""
                   SELECT COUNT(*)
                   FROM users u
                            JOIN season_roles sr ON u.id = sr.userid
                            JOIN seasons s ON sr.season_id = s.season_id
                   WHERE s.season_id = %s
                     AND sr.is_player = 1;
                   """, (season_id,))
    player_count = cursor.fetchone()['COUNT(*)']

    # Total team count for given season
    cursor.execute("""
                   SELECT COUNT(*)
                   FROM teams t
                            JOIN seasons s ON t.season_id = s.season_id
                   WHERE s.season_id = %s;
                   """, (season_id,))
    team_count = cursor.fetchone()['COUNT(*)']

    # Total all-member events hosted
    cursor.execute("""
                   SELECT COUNT(*)
                   FROM generalevents
                   WHERE visibility = 'all_members';
                   """)
    event_count = cursor.fetchone()['COUNT(*)']

    # Total communities
    cursor.execute("""
                   SELECT COUNT(*)
                   FROM games;
                   """)
    community_count = cursor.fetchone()['COUNT(*)']

    return [
        reformat_stat(player_count),
        reformat_stat(team_count),
        reformat_stat(event_count),
        reformat_stat(community_count),
    ]