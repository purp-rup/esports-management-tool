"""
This file is dedicated to organizing helper functions that are used across multiple files.
Any helper that is only used in one file will remain in that file.
"""
from EsportsManagementTool import mysql
from datetime import timedelta
import MySQLdb.cursors
from flask import session

def get_user_permissions(user_id: int) -> dict[str, int]:
    """
    Fetch all permissions/roles for a specific user.
    Used in dashboard.py, events.py, communities.py, leagues.py, schedules.py, seasons.py,
    teams.py, team_stats.py, playoffs_results.py, & vods.py
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("""
            SELECT is_admin, is_gm, is_player, is_developer 
            FROM permissions 
            WHERE userid = %s
        """, (user_id,))
        permissions = cursor.fetchone()

        if permissions:
            return permissions
        else:
            # Default permissions if none exist
            return {
                'is_admin': 0,
                'is_gm': 0,
                'is_player': 0,
                'is_developer': 0
            }
    finally:
        cursor.close()

def get_team_game_id(cursor, team_id: int) -> int | None:
    """
    Returns gameID for a team, or None if not found.
    Used in teams.py & schedules.py
    """
    cursor.execute("SELECT gameID FROM teams WHERE TeamID = %s", (team_id,))
    result = cursor.fetchone()
    return result['gameID'] if result else None


def format_time_raw(time_value) -> str:
    """
    Convert time object or timedelta to HH:MM string for use in HTML time inputs.
    Used in events.py
    """
    if not time_value:
        return ''
    if isinstance(time_value, timedelta):
        total_seconds = int(time_value.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
    else:
        hours = time_value.hour
        minutes = time_value.minute
    return f"{hours:02d}:{minutes:02d}"


def format_time_to_12hr(time_value) -> str | None:
    """
    Convert time object or timedelta to 12-hour format string.
    Used in communities.py, events.py, schedules.py, & teams.py
    """
    if not time_value:
        return None
    raw = format_time_raw(time_value)
    hours, minutes = map(int, raw.split(':'))

    # Convert to 12-hour format
    period = "AM" if hours < 12 else "PM"
    display_hour = hours % 12 or 12
    return f"{display_hour}:{minutes:02d} {period}"


def is_all_day_event(start_time: str, end_time: str) -> bool:
    """
    Determines if an event is an all-day event or not
    Used in communities.py & teams.py
    """
    return bool(start_time and end_time and
                start_time == "12:00 AM" and end_time == "11:59 PM")


def select_profile_communities(communities, current_game_id):
    """
    Given a member's full list of joined communities (each a dict with
    'id', 'title', 'image_url', 'joined_at'), return up to 3 for display
    on the user profile popup — oldest joined first — plus a count of how
    many communities beyond those 3 aren't being shown.

    The community matching current_game_id (the community page currently
    being viewed) is excluded UNLESS the member has 3 or fewer communities
    total, in which case everything is shown.

    Used in communities.py
    """
    total = len(communities)
    ordered = sorted(communities, key=lambda c: c['joined_at'])

    if total > 3:
        ordered = [c for c in ordered if c['id'] != current_game_id]

    shown = [{'id': c['id'], 'title': c['title'], 'image_url': c['image_url']} for c in ordered[:3]]
    remaining = max(total - len(shown), 0)

    return shown, remaining

def select_profile_teams(teams, current_game_id, viewer_team_ids):
    """
    Given a member's full list of teams (each a dict with 'id', 'name',
    'game_id', 'game_icon_url', 'joined_at'), return up to 2 for display
    on the user profile popup.

    Ordering: oldest joined first, with any team belonging to the community
    currently being viewed (current_game_id) bumped to the front.

    Any team also shared with the current viewer (id present in
    viewer_team_ids) is excluded — even if it belongs to the current
    community — UNLESS the member has 2 or fewer teams total, in which
    case nothing is excluded.

    Used in communities.py
    """
    total = len(teams)
    ordered = sorted(teams, key=lambda t: t['joined_at'])

    if total > 2:
        ordered = [t for t in ordered if t['id'] not in viewer_team_ids]

    # Stable sort: teams from the current community move to the front,
    # while preserving oldest-first order within each group
    ordered.sort(key=lambda t: t['game_id'] != current_game_id)

    return [
        {'id': t['id'], 'name': t['name'], 'game_icon_url': t['game_icon_url']}
        for t in ordered[:2]
    ]


def build_member_profile(user_row, include_gm_flag=False):
    """
    Construct a user role list for each user to display on the front-end.
    Used in teams.py and communities.py
    """
    discord_username = None
    if user_row.get('discord_username'):
        if user_row.get('discord_discriminator') and user_row['discord_discriminator'] != '0':
            discord_username = f"{user_row['discord_username']}#{user_row['discord_discriminator']}"
        else:
            discord_username = user_row['discord_username']

    profile = {
        'id': user_row['id'],
        'name': f"{user_row['firstname']} {user_row['lastname']}",
        'username': user_row['username'],
        'profile_picture': user_row['profile_picture'] or None,
        'discord_username': discord_username,
        'communities': user_row.get('communities', []),
        'communities_remaining': user_row.get('communities_remaining', 0),
        'teams': user_row.get('teams', []),
        'is_captain': bool(user_row.get('is_captain')),
        'roles': (
                [r for flag, r in [
                    (user_row.get('is_admin') == 1, 'Admin'),
                    (user_row.get('is_developer') == 1, 'Developer'),
                    (user_row.get('is_gm') == 1, 'Game Manager'),
                    (user_row.get('is_player') == 1, 'Player'),
                ] if flag] or ['Member']
        ),
        'joined_at': (
            user_row['joined_at'].strftime('%B %d, %Y')
            if user_row.get('joined_at') else None
        ),
    }

    if include_gm_flag:
        profile['is_game_manager'] = bool(user_row.get('is_game_manager'))

    return profile

def attach_profile_extras(cursor, members, current_game_id):
    """
    Bulk-fetch and attach each member's communities and teams (for display
    on the user profile popup/panel), applying the same selection rules
    on both the communities page and the Teams tab roster.

    Mutates each dict in `members` in place, adding 'communities',
    'communities_remaining', and 'teams' keys.

    Does NOT handle Discord data — that must already be joined into the
    caller's own member query (LEFT JOIN discord d ON d.userid = u.id),
    since that query's column list differs slightly per caller (e.g.
    season_roles vs permissions).

    Used in communities.py (get_community_details) & teams.py (team_details).
    """
    member_ids = [m['id'] for m in members]
    if not member_ids:
        return members

    placeholders = ','.join(['%s'] * len(member_ids))

    # -- Communities --
    communities_by_user = {}
    cursor.execute(f"""
        SELECT c.user_id, c.game_id, c.joined_at, g.GameTitle, g.GameImage
        FROM in_communities c
        JOIN games g ON c.game_id = g.GameID
        WHERE c.user_id IN ({placeholders})
    """, tuple(member_ids))

    for row in cursor.fetchall():
        communities_by_user.setdefault(row['user_id'], []).append({
            'id': row['game_id'],
            'title': row['GameTitle'],
            'image_url': f"/game-image/{row['game_id']}" if row['GameImage'] else None,
            'joined_at': row['joined_at'],
        })

    # -- Teams (current season only) --
    teams_by_user = {}
    cursor.execute("SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1")
    active_season = cursor.fetchone()
    active_season_id = active_season['season_id'] if active_season else None

    if active_season_id:
        cursor.execute(f"""
            SELECT tm.user_id, tm.team_id, tm.joined_at, t.teamName, t.gameID, g.GameImage
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.TeamID
            JOIN games g ON t.gameID = g.GameID
            WHERE tm.user_id IN ({placeholders}) AND t.season_id = %s
        """, tuple(member_ids) + (active_season_id,))

        for row in cursor.fetchall():
            teams_by_user.setdefault(row['user_id'], []).append({
                'id': row['team_id'],
                'name': row['teamName'],
                'game_id': row['gameID'],
                'game_icon_url': f"/game-image/{row['gameID']}" if row['GameImage'] else None,
                'joined_at': row['joined_at'],
            })

    cursor.execute("SELECT team_id FROM team_members WHERE user_id = %s", (session['id'],))
    viewer_team_ids = {row['team_id'] for row in cursor.fetchall()}

    for m in members:
        m['communities'], m['communities_remaining'] = select_profile_communities(
            communities_by_user.get(m['id'], []), current_game_id
        )
        m['teams'] = select_profile_teams(
            teams_by_user.get(m['id'], []), current_game_id, viewer_team_ids
        )

    return members