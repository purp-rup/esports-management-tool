"""
This file is dedicated to organizing helper functions that are used across multiple files.
Any helper that is only used in one file will remain in that file.
"""
from EsportsManagementTool import mysql
from datetime import timedelta
import MySQLdb.cursors

def get_user_permissions(user_id):
    """
    Fetch all permissions/roles for a specific user.
    Used in dashboard.py, events.py, game.py, leagues.py, schedules.py, seasons.py,
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

def get_team_game_id(cursor, team_id):
    """
    Returns gameID for a team, or None if not found.
    Used in teams.py & schedules.py
    """
    cursor.execute("SELECT gameID FROM teams WHERE TeamID = %s", (team_id,))
    result = cursor.fetchone()
    return result['gameID'] if result else None

def format_time_to_12hr(time_value):
    """
    Convert time object or timedelta to 12-hour format string
    Used in game.py, schedules.py, & teams.py
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

def is_all_day_event(start_time_str, end_time_str):
    """
    Determines if an event is an all-day event or not
    Used in game.py & teams.py
    """
    return bool(start_time_str and end_time_str and
                start_time_str == "12:00 AM" and end_time_str == "11:59 PM")