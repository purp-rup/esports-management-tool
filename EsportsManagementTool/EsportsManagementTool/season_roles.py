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


def assign_season_role(mysql, user_id, season_id, role_name, value=True, gm_game_id=None):
    """
    Assign or remove a role for a user in a specific season

    Args:
        mysql: MySQL connection object
        user_id: User ID
        season_id: Season ID
        role_name: One of 'admin', 'gm', 'player', 'developer'
        value: True to assign, False to remove
        gm_game_id: Optional game ID for GM role (preserves which game they managed)

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
        # If assigning GM role and game_id provided, include it
        if role_name.lower() == 'gm' and gm_game_id is not None:
            cursor.execute(f"""
                INSERT INTO season_roles (userid, season_id, {column}, gm_game_id)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    {column} = %s, 
                    gm_game_id = %s,
                    updated_date = NOW()
            """, (user_id, season_id, int_value, gm_game_id, int_value, gm_game_id))
        else:
            # For non-GM roles or when removing GM role
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


def snapshot_all_permissions_to_season(mysql, season_id):
    """
    Snapshot all current user permissions into season_roles for a new season
    This should be called when a season is created or activated
    NOW INCLUDES: GM game assignments to preserve history

    Args:
        mysql: MySQL connection object
        season_id: The season ID to snapshot permissions for

    Returns:
        int: Number of users whose permissions were snapshotted
    """
    cursor = mysql.connection.cursor()
    try:
        # Get all users with any role assigned
        cursor.execute("""
            SELECT userid, is_admin, is_gm, is_player, is_developer
            FROM permissions
            WHERE is_admin = 1 OR is_gm = 1 OR is_player = 1 OR is_developer = 1
        """)

        users_with_roles = cursor.fetchall()

        if not users_with_roles:
            return 0

        # Insert all users into season_roles for this season
        for user_row in users_with_roles:
            userid = user_row[0]
            is_admin = user_row[1]
            is_gm = user_row[2]
            is_player = user_row[3]
            is_developer = user_row[4]

            # Get the game this user manages (if they're a GM)
            gm_game_id = None
            if is_gm == 1:
                cursor.execute("""
                    SELECT GameID 
                    FROM games 
                    WHERE gm_id = %s 
                    LIMIT 1
                """, (userid,))
                game_result = cursor.fetchone()
                if game_result:
                    gm_game_id = game_result[0]

            cursor.execute("""
                INSERT INTO season_roles (userid, season_id, is_admin, is_gm, is_player, is_developer, gm_game_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    is_admin = VALUES(is_admin),
                    is_gm = VALUES(is_gm),
                    is_player = VALUES(is_player),
                    is_developer = VALUES(is_developer),
                    gm_game_id = VALUES(gm_game_id),
                    updated_date = NOW()
            """, (userid, season_id, is_admin, is_gm, is_player, is_developer, gm_game_id))

        mysql.connection.commit()
        return len(users_with_roles)

    except Exception as e:
        print(f"Error snapshotting permissions to season: {str(e)}")
        mysql.connection.rollback()
        return 0
    finally:
        cursor.close()

def get_gm_game_mappings_for_season(mysql, season_id=None):
    """
    Get GM-game mappings for a specific season (or active season if not specified)
    This returns the HISTORICAL game assignments preserved in season_roles

    Args:
        mysql: MySQL connection object
        season_id: Season ID (uses active season if None)

    Returns:
        dict: Mapping of user_id -> list of game info dicts
              Format: { user_id: [{ game_id, game_title, game_icon_url }, ...] }
    """
    if season_id is None:
        season_id = get_active_season_id(mysql)

    if season_id is None:
        return {}

    cursor = mysql.connection.cursor()
    mappings = {}

    try:
        cursor.execute("""
            SELECT sr.userid, sr.gm_game_id, g.GameTitle
            FROM season_roles sr
            INNER JOIN games g ON sr.gm_game_id = g.GameID
            WHERE sr.season_id = %s 
            AND sr.is_gm = 1 
            AND sr.gm_game_id IS NOT NULL
        """, (season_id,))

        results = cursor.fetchall()

        for row in results:
            user_id = row[0]
            game_id = row[1]
            game_title = row[2]

            if user_id not in mappings:
                mappings[user_id] = []

            mappings[user_id].append({
                'game_id': game_id,
                'game_title': game_title,
                'game_icon_url': f'/game-image/{game_id}'
            })

        return mappings

    except Exception as e:
        print(f"Error getting GM game mappings for season: {str(e)}")
        return {}
    finally:
        cursor.close()