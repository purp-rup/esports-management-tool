"""
This file is dedicated to organizing helper functions that are used across multiple files.
Any helper that is only used in one file will remain in that file.
"""
from EsportsManagementTool import mysql
from datetime import timedelta
import MySQLdb.cursors

def get_user_permissions(user_id: int) -> dict[str, int]:
    """
    Fetch all permissions/roles for a specific user.
    Used in dashboard.py, events.py, communities.py, leagues.py, schedules.py, seasons.py,
    teams.py, team_stats.py, tournament_results.py, & vods.py
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

def format_time_to_12hr(time_value) -> str | None:
    """
    Convert time object or timedelta to 12-hour format string
    Used in communities.py, schedules.py, & teams.py
    """
    if not time_value:
        return None

    # Handle timedelta (from MySQL TIME type)
    if isinstance(time_value, timedelta):
        total_seconds = int(time_value.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
    else:
        # Handle time object
        hours = time_value.hour
        minutes = time_value.minute

    # Convert to 12-hour format
    period = "AM" if hours < 12 else "PM"
    display_hour = hours % 12
    if display_hour == 0:
        display_hour = 12

    return f"{display_hour}:{minutes:02d} {period}"

def is_all_day_event(start_time: str, end_time: str) -> bool:
    """
    Determines if an event is an all-day event or not
    Used in communities.py & teams.py
    """
    return bool(start_time and end_time and
                start_time == "12:00 AM" and end_time == "11:59 PM")


def build_member_profile(user_row, include_gm_flag=False):
    """
    Construct a user role list for each user to display on the front-end.
    Used in teams.py and communities.py
    """
    profile = {
        'id': user_row['id'],
        'name': f"{user_row['firstname']} {user_row['lastname']}",
        'username': user_row['username'],
        'profile_picture': user_row['profile_picture'] or None,
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