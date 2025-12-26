"""
season_roles.py
Helper functions for managing season-based role assignments
"""

def get_active_season_id(mysql):
    """
    Get the ID of the currently active season, or the most recent past season
    Returns None only if no seasons exist at all
    """
    cursor = mysql.connection.cursor()
    try:
        # First try to get active season
        cursor.execute("SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1")
        result = cursor.fetchone()
        if result:
            return result[0]

        # If no active season, get the most recent past season
        cursor.execute("""
            SELECT season_id 
            FROM seasons 
            WHERE is_active = 0 
            ORDER BY end_date DESC 
            LIMIT 1
        """)
        result = cursor.fetchone()
        return result[0] if result else None
    finally:
        cursor.close()


def get_season_role_stats(mysql, season_id=None):
    """
    Get role statistics for a specific season (or active/most recent season if not specified)

    Returns:
        dict: Contains counts for admins, gms, players, total_users_with_roles, and season_name
    """
    cursor = mysql.connection.cursor()

    try:
        if season_id is None:
            season_id = get_active_season_id(mysql)

        if season_id is None:
            # No seasons exist at all - return zeros
            return {
                'admins': 0,
                'gms': 0,
                'players': 0,
                'total_users_with_roles': 0,
                'season_name': None,
                'season_id': None
            }

        # Get season name
        cursor.execute("SELECT season_name FROM seasons WHERE season_id = %s", (season_id,))
        season_result = cursor.fetchone()
        season_name = season_result[0] if season_result else 'Unknown Season'

        # Count admins
        cursor.execute("""
            SELECT COUNT(DISTINCT userid) 
            FROM season_roles 
            WHERE season_id = %s AND is_admin = 1
        """, (season_id,))
        admins = cursor.fetchone()[0]

        # Count GMs
        cursor.execute("""
            SELECT COUNT(DISTINCT userid) 
            FROM season_roles 
            WHERE season_id = %s AND is_gm = 1
        """, (season_id,))
        gms = cursor.fetchone()[0]

        # Count Players
        cursor.execute("""
            SELECT COUNT(DISTINCT userid) 
            FROM season_roles 
            WHERE season_id = %s AND is_player = 1
        """, (season_id,))
        players = cursor.fetchone()[0]

        # Count total users with any role this season
        cursor.execute("""
            SELECT COUNT(DISTINCT userid)
            FROM season_roles
            WHERE season_id = %s 
            AND (is_admin = 1 OR is_gm = 1 OR is_player = 1 OR is_developer = 1)
        """, (season_id,))
        total_users_with_roles = cursor.fetchone()[0]

        return {
            'admins': admins,
            'gms': gms,
            'players': players,
            'total_users_with_roles': total_users_with_roles,
            'season_name': season_name,
            'season_id': season_id
        }
    finally:
        cursor.close()


def assign_season_role(mysql, user_id, season_id, role_name, value=True):
    """
    Assign or remove a role for a user in a specific season

    Args:
        mysql: MySQL connection object
        user_id: User ID
        season_id: Season ID
        role_name: One of 'admin', 'gm', 'player', 'developer'
        value: True to assign, False to remove

    Returns:
        bool: True if successful, False otherwise
    """
    role_column_map = {
        'admin': 'is_admin',
        'gm': 'is_gm',
        'player': 'is_player',
        'developer': 'is_developer'
    }

    if role_name.lower() not in role_column_map:
        return False

    column = role_column_map[role_name.lower()]
    int_value = 1 if value else 0

    cursor = mysql.connection.cursor()
    try:
        # Insert or update the role assignment
        cursor.execute(f"""
            INSERT INTO season_roles (userid, season_id, {column})
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE {column} = %s, updated_date = NOW()
        """, (user_id, season_id, int_value, int_value))

        mysql.connection.commit()
        return True
    except Exception as e:
        print(f"Error assigning season role: {str(e)}")
        mysql.connection.rollback()
        return False
    finally:
        cursor.close()


def get_user_season_roles(mysql, user_id, season_id=None):
    """
    Get all roles for a user in a specific season

    Args:
        mysql: MySQL connection object
        user_id: User ID
        season_id: Season ID (uses active season if None)

    Returns:
        dict: Role flags or None if user has no roles in the season
    """
    if season_id is None:
        season_id = get_active_season_id(mysql)

    if season_id is None:
        return None

    cursor = mysql.connection.cursor()
    try:
        cursor.execute("""
            SELECT is_admin, is_gm, is_player, is_developer
            FROM season_roles
            WHERE userid = %s AND season_id = %s
        """, (user_id, season_id))

        result = cursor.fetchone()
        if result:
            return {
                'is_admin': result[0],
                'is_gm': result[1],
                'is_player': result[2],
                'is_developer': result[3]
            }
        return None
    finally:
        cursor.close()


def copy_roles_to_new_season(mysql, old_season_id, new_season_id):
    """
    Copy all role assignments from one season to a new season
    Useful when starting a new season

    Args:
        mysql: MySQL connection object
        old_season_id: Source season ID
        new_season_id: Destination season ID

    Returns:
        int: Number of roles copied
    """
    cursor = mysql.connection.cursor()
    try:
        cursor.execute("""
            INSERT INTO season_roles (userid, season_id, is_admin, is_gm, is_player, is_developer)
            SELECT userid, %s, is_admin, is_gm, is_player, is_developer
            FROM season_roles
            WHERE season_id = %s
        """, (new_season_id, old_season_id))

        mysql.connection.commit()
        return cursor.rowcount
    except Exception as e:
        print(f"Error copying roles to new season: {str(e)}")
        mysql.connection.rollback()
        return 0
    finally:
        cursor.close()


def get_users_by_season_role(mysql, role_name, season_id=None):
    """
    Get all users with a specific role in a season

    Args:
        mysql: MySQL connection object
        role_name: One of 'admin', 'gm', 'player', 'developer'
        season_id: Season ID (uses active season if None)

    Returns:
        list: List of user dictionaries with basic info
    """
    if season_id is None:
        season_id = get_active_season_id(mysql)

    if season_id is None:
        return []

    role_column_map = {
        'admin': 'is_admin',
        'gm': 'is_gm',
        'player': 'is_player',
        'developer': 'is_developer'
    }

    if role_name.lower() not in role_column_map:
        return []

    column = role_column_map[role_name.lower()]

    cursor = mysql.connection.cursor()
    try:
        cursor.execute(f"""
            SELECT u.id, u.username, u.firstname, u.lastname, u.email
            FROM users u
            INNER JOIN season_roles sr ON u.id = sr.userid
            WHERE sr.season_id = %s AND sr.{column} = 1
            ORDER BY u.lastname, u.firstname
        """, (season_id,))

        columns = ['id', 'username', 'firstname', 'lastname', 'email']
        results = cursor.fetchall()

        return [dict(zip(columns, row)) for row in results]
    finally:
        cursor.close()