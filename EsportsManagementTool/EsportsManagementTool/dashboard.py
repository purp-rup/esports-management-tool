from flask import render_template, request, redirect, url_for, session, flash, jsonify
from EsportsManagementTool import app, login_required, roles_required, mysql, season_roles, discord_integration
from EsportsManagementTool.universal_helpers import get_user_permissions
from flask_mail import Mail, Message
import MySQLdb.cursors
from dotenv import load_dotenv
from datetime import datetime
import calendar as cal
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
load_dotenv()

# Allowed file extensions for avatars
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

## =============================================
## THE FOLLOWING WAS PRODUCED ALONGSIDE CLAUDEAI
## =============================================

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

"""
Main route to allow all users to access the dashboard.
"""
@app.route('/dashboard')
@login_required  # Added security
def dashboard():
    # Get user data
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    cursor.execute("SELECT * FROM users WHERE id = %s", (session['id'],))
    user = cursor.fetchone()
    cursor.execute('SELECT * FROM verified_users WHERE userid = %s', [user['id']])
    is_verified = cursor.fetchone()

    # Get actual permissions from database instead of overriding
    permissions = get_user_permissions(user['id'])
    user['is_developer'] = permissions['is_developer']
    user['is_admin'] = permissions['is_admin']
    user['is_gm'] = permissions['is_gm']
    user['is_player'] = permissions['is_player']

    if not user:
        session.clear()
        flash('User not found', 'error')
        return redirect(url_for('login'))

    # Get notification preferences
    cursor.execute("""
        SELECT * FROM notification_preferences 
        WHERE user_id = %s
    """, (session['id'],))
    preferences = cursor.fetchone()

    # Get preferred tab, defaults to calendar
    cursor.execute("""
        SELECT preferred_tab 
        FROM tab_preferences 
        WHERE user_id = %s
    """, (session['id'],))
    tab_preference = cursor.fetchone()
    preferred_tab = tab_preference['preferred_tab'] if tab_preference else 'calendar'

    if preferred_tab == 'admin' and not (user['is_admin'] or user['is_developer']):
        preferred_tab = 'calendar'
        
    # Get today's date for highlighting
    today = datetime.now()

    # Get events from database for this month - WITH VISIBILITY FILTERING
    try:
        user_id = session['id']

        # --- Admin Panel Stats ---
        total_users = active_users = admins = gms = players = developers = 0
        current_season_name = None

        if user['is_admin'] == 1 or user['is_developer'] == 1:
            try:
                # Count all users
                cursor.execute("SELECT COUNT(*) AS total_users FROM users")
                total_users = cursor.fetchone()['total_users']

                # Count currently active users (logged in and active)
                cursor.execute("""
                    SELECT COUNT(*) AS active_users 
                    FROM user_activity 
                    WHERE is_active = 1
                """)
                active_users_result = cursor.fetchone()
                active_users = active_users_result['active_users'] if active_users_result else 0

                # Count Admins using live values from permissions
                cursor.execute("SELECT COUNT(*) AS admins FROM permissions WHERE is_admin = 1")
                admins = cursor.fetchone()['admins']

                # Count GMs using live values from permissions
                cursor.execute("SELECT COUNT(*) AS gms FROM permissions WHERE is_gm = 1")
                gms = cursor.fetchone()['gms']

                # Count Players (should be 0 between seasons
                cursor.execute("SELECT COUNT(*) AS players FROM permissions WHERE is_player = 1")
                players = cursor.fetchone()['players']

                # Count developers
                cursor.execute("SELECT COUNT(*) AS developers FROM permissions WHERE is_developer = 1")
                developers = cursor.fetchone()['developers']

            except Exception as e:
                print("Admin stats error:", e)

        # --- Admin User Management ---
        user_list = []

        # Only fetch user list if user is actually an admin
        if user['is_admin'] == 1 or user['is_developer'] == 1:
            # Clean up inactive users before displaying stats
            from EsportsManagementTool import cleanup_inactive_users
            cleanup_inactive_users()

            try:
                # Fetch users with their activity status
                cursor.execute("""
                    SELECT 
                        u.id,
                        u.firstname, 
                        u.lastname, 
                        u.username, 
                        u.email, 
                        u.date,
                        COALESCE(ua.is_active, 0) as is_active,
                        ua.last_seen,
                        p.is_admin,
                        p.is_gm,
                        p.is_player,
                        p.is_developer
                    FROM users u
                    LEFT JOIN user_activity ua ON u.id = ua.userid
                    LEFT JOIN permissions p ON u.id = p.userid
                    ORDER BY ua.is_active DESC, u.date DESC
                """)
                user_list = cursor.fetchall()

            except Exception as e:
                print("Error fetching user list:", e)

        return render_template(
            "dashboard.html",
            user=user,
            is_verified=is_verified,
            preferences=preferences,
            preferred_tab=preferred_tab,
            total_users=total_users,
            active_users=active_users,
            current_season_name=current_season_name,
            admins=admins,
            gms=gms,
            players=players,
            developers=developers,
            user_list=user_list
        )

    finally:
        cursor.close()

@app.route('/profile/preferred-tab', methods=['POST'])
@login_required
def save_preferred_tab():
    """Route to save a user's preferred tab to be displayed when opening the dashboard."""
    data = request.get_json()
    preferred_tab = data.get('preferred_tab')

    valid_tabs = ['calendar', 'profile', 'rosters', 'events', 'teams', 'admin']
    if preferred_tab not in valid_tabs:
        return jsonify({'success': False, 'message': 'Invalid tab selection'}), 400

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("""
            INSERT INTO tab_preferences (user_id, preferred_tab)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE preferred_tab = %s
        """, (session['id'], preferred_tab, preferred_tab))
        mysql.connection.commit()

        return jsonify({'success': True, 'message': 'Preferred tab saved'})

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error saving preferred tab: {str(e)}")
        return jsonify({'success': False, 'message': 'Database error occurred'}), 500

    finally:
        cursor.close()

"""
Route meant to assign and remove roles.
"""
@app.route('/admin/manage-role', methods=['POST'])
@roles_required('admin', 'developer')
def manage_role():
    """
    Assign or remove roles from users
    NOW INCLUDES: Prevent role changes when no active season exists
    """
    try:
        data = request.get_json()
        username = data.get('username')
        action = data.get('action')  # 'assign' or 'remove'
        role = data.get('role')  # 'Admin' or 'Game Manager'

        # Validate input
        if not username or not action or not role:
            return jsonify({
                'success': False,
                'message': 'Missing required fields'
            }), 400

        if action not in ['assign', 'remove']:
            return jsonify({
                'success': False,
                'message': 'Invalid action'
            }), 400

        if role not in ['Admin', 'Game Manager']:
            return jsonify({
                'success': False,
                'message': 'Invalid role'
            }), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get user ID from username
            cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
            user = cursor.fetchone()

            if not user:
                return jsonify({
                    'success': False,
                    'message': f'User "{username}" not found'
                }), 404

            user_id = user['id']

            # Prevent admin from removing their own admin role
            if action == 'remove' and role == 'Admin' and user_id == session['id']:
                return jsonify({
                    'success': False,
                    'message': 'You cannot remove your own admin privileges'
                }), 403

            # Map role names to database columns
            role_column_map = {
                'Admin': 'is_admin',
                'Game Manager': 'is_gm'
            }

            role_column = role_column_map[role]
            new_value = 1 if action == 'assign' else 0

            # Update the permissions table
            query = f"UPDATE permissions SET {role_column} = %s WHERE userid = %s"
            cursor.execute(query, (new_value, user_id))

            # ONLY update season-specific role if there's an ACTIVE season
            # Do NOT update if using fallback to most recent past season
            cursor.execute("SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1")
            active_season = cursor.fetchone()

            if active_season:
                active_season_id = active_season['season_id']
                role_name = 'gm' if role == 'Game Manager' else 'admin'

                # For GM role, get their current game assignment
                gm_game_id = None
                if role == 'Game Manager' and action == 'assign':
                    cursor.execute("""
                        SELECT GameID 
                        FROM games 
                        WHERE gm_id = %s 
                        LIMIT 1
                    """, (user_id,))
                    game_result = cursor.fetchone()
                    if game_result:
                        gm_game_id = game_result['GameID']

                season_roles.assign_season_role(
                    mysql,
                    user_id,
                    active_season_id,
                    role_name,
                    value=(action == 'assign'),
                    gm_game_id=gm_game_id  # Pass the game ID
                )
            else:
                # No active season - only update permissions table, not season_roles
                print(
                    f"⚠️ No active season - role change for {username} applied to permissions only (not season_roles)")

            # If removing Game Manager role, clear their game associations
            if action == 'remove' and role == 'Game Manager':
                cursor.execute("""
                    UPDATE games 
                    SET gm_id = NULL 
                    WHERE gm_id = %s
                """, (user_id,))

            mysql.connection.commit()

            # Prepare success message
            action_past_tense = 'assigned' if action == 'assign' else 'removed'
            message = f'{role} role {action_past_tense} {"to" if action == "assign" else "from"} {username} successfully'

            return jsonify({
                'success': True,
                'message': message
            }), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"Database error: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Database error occurred'
            }), 500

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Server error occurred'
        }), 500

"""
Route meant to retrieve the games a user manages from the database.
Updated to support checking a specific game or getting the first managed game.
"""
@app.route('/api/user/<int:user_id>/managed-game', methods=['GET'])
@app.route('/api/user/<int:user_id>/manages-game/<int:game_id>', methods=['GET'])
@login_required
def get_user_managed_game(user_id, game_id=None):
    """
    Get which game (if any) this user manages.
    If game_id is provided, check if user manages that specific game.
    If game_id is not provided, return the first game the user manages.
    """
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Check if this user is a GM
            cursor.execute("SELECT is_gm FROM permissions WHERE userid = %s", (user_id,))
            perm = cursor.fetchone()

            if not perm or perm['is_gm'] != 1:
                return jsonify({
                    'success': True,
                    'manages_game': False
                })

            # If specific game_id is provided, check that specific game
            if game_id is not None:
                cursor.execute("""
                    SELECT GameID, GameTitle, GameImage, gm_id
                    FROM games 
                    WHERE GameID = %s
                """, (game_id,))

                game = cursor.fetchone()

                if not game:
                    return jsonify({
                        'success': False,
                        'message': 'Game not found'
                    }), 404

                # Check if this user is the GM for this specific game
                manages_this_game = (game['gm_id'] == user_id)

                if manages_this_game:
                    image_url = f'/game-image/{game["GameID"]}' if game.get('GameImage') else None

                    return jsonify({
                        'success': True,
                        'manages_game': True,
                        'game_id': game['GameID'],
                        'game_title': game['GameTitle'],
                        'game_icon': image_url
                    })
                else:
                    return jsonify({
                        'success': True,
                        'manages_game': False,
                        'game_id': game_id
                    })

            # If no game_id provided, return the first game this user manages (original behavior)
            else:
                cursor.execute("""
                    SELECT GameID, GameTitle, GameImage 
                    FROM games 
                    WHERE gm_id = %s
                    LIMIT 1
                """, (user_id,))

                game = cursor.fetchone()

                if game:
                    image_url = f'/game-image/{game["GameID"]}' if game.get('GameImage') else None

                    return jsonify({
                        'success': True,
                        'manages_game': True,
                        'game_id': game['GameID'],
                        'game_title': game['GameTitle'],
                        'game_icon': image_url
                    })

                # User is a GM but doesn't manage any game yet
                return jsonify({
                    'success': True,
                    'manages_game': False
                })

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error getting managed game: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to get managed game'}), 500

"""
Method to search users in Admin Panel based on input from user in search bar.
"""
@app.route('/admin/search-users')
@login_required
@roles_required('admin', 'developer')
def search_users():
    """Search users by name, username, or email"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Get search query from URL parameter
        search_query = request.args.get('query', '').strip()

        if not search_query:
            # If empty search, return all users (or first 50)
            cursor.execute("""
                SELECT u.id, u.firstname, u.lastname, u.username, u.email, 
                       u.date,
                       COALESCE(ua.is_active, 0) as is_active,
                       ua.last_seen,
                       COALESCE(p.is_admin, 0) as is_admin, 
                       COALESCE(p.is_gm, 0) as is_gm, 
                       COALESCE(p.is_player, 0) as is_player,
                       COALESCE(p.is_developer, 0) as is_developer
                FROM users u
                LEFT JOIN permissions p ON u.id = p.userid
                LEFT JOIN user_activity ua ON u.id = ua.userid
                ORDER BY u.firstname, u.lastname
                LIMIT 50
            """)
        else:
            # Search for matching users
            search_pattern = f"%{search_query}%"
            cursor.execute("""
                SELECT u.id, u.firstname, u.lastname, u.username, u.email, 
                       u.date,
                       COALESCE(ua.is_active, 0) as is_active,
                       ua.last_seen,
                       COALESCE(p.is_admin, 0) as is_admin, 
                       COALESCE(p.is_gm, 0) as is_gm, 
                       COALESCE(p.is_player, 0) as is_player,
                       COALESCE(p.is_developer, 0) as is_developer
                FROM users u
                LEFT JOIN permissions p ON u.id = p.userid
                LEFT JOIN user_activity ua ON u.id = ua.userid
                WHERE u.firstname LIKE %s
                   OR u.lastname LIKE %s
                   OR u.username LIKE %s
                   OR u.email LIKE %s
                   OR CONCAT(u.firstname, ' ', u.lastname) LIKE %s
                ORDER BY u.firstname, u.lastname
                LIMIT 50
            """, (search_pattern, search_pattern, search_pattern, search_pattern, search_pattern))

        users = cursor.fetchall()

        # Format dates for display
        formatted_users = []
        for user in users:
            # Handle registration date
            date_registered = 'Unknown'
            if user.get('date'):
                try:
                    date_registered = user['date'].strftime('%B %d, %Y')
                except Exception as e:
                    print(f"Error formatting date: {e}")
                    date_registered = str(user['date'])

            # Handle last_seen
            last_seen = 'Never logged in'
            if user.get('last_seen'):
                try:
                    last_seen = user['last_seen'].strftime('%B %d, %Y; %I:%M %p')
                except Exception as e:
                    print(f"Error formatting last_seen: {e}")
                    last_seen = str(user['last_seen'])

            formatted_users.append({
                'id': user['id'],
                'firstname': user['firstname'],
                'lastname': user['lastname'],
                'username': user['username'],
                'email': user['email'],
                'date_registered': date_registered,
                'is_active': bool(user.get('is_active', 0)),
                'last_seen': last_seen,
                'is_admin': bool(user.get('is_admin', 0)),
                'is_gm': bool(user.get('is_gm', 0)),
                'is_player': bool(user.get('is_player', 0)),
                'is_developer': bool(user.get('is_developer', 0))
            })

        return jsonify({
            'success': True,
            'users': formatted_users
        })

    except Exception as e:
        import traceback
        print(f"Error searching users: {str(e)}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'message': f'Failed to search users: {str(e)}'
        }), 500

    finally:
        cursor.close()

"""
Route allowing admins to remove user data from the site. This includes email, password, profile picture, etc.
"""
@app.route('/admin/remove-user', methods=['POST'])
@roles_required('admin', 'developer')
def remove_user():
    """
    Permanently delete a user and all associated data
    """
    try:
        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({
                'success': False,
                'message': 'Missing user ID'
            }), 400

        # Prevent admin from deleting themselves
        if user_id == session['id']:
            return jsonify({
                'success': False,
                'message': 'You cannot delete your own account'
            }), 403

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get user info before deletion
            cursor.execute("SELECT username, firstname, lastname FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()

            if not user:
                return jsonify({
                    'success': False,
                    'message': 'User not found'
                }), 404

            username = user['username']
            full_name = f"{user['firstname']} {user['lastname']}"

            # Check if user is the last admin
            cursor.execute("""
                SELECT COUNT(*) as admin_count 
                FROM permissions 
                WHERE is_admin = 1
            """)
            admin_count = cursor.fetchone()['admin_count']

            cursor.execute("""
                SELECT is_admin 
                FROM permissions 
                WHERE userid = %s
            """, (user_id,))
            user_perms = cursor.fetchone()

            if user_perms and user_perms['is_admin'] == 1 and admin_count <= 1:
                return jsonify({
                    'success': False,
                    'message': 'Cannot delete the last admin user'
                }), 403

            # Delete user data from all tables
            # The order matters due to foreign key constraints

            # 1. Delete from sent_notifications
            cursor.execute("DELETE FROM sent_notifications WHERE id = %s", (user_id,))

            # 2. Delete from notification_preferences
            cursor.execute("DELETE FROM notification_preferences WHERE user_id = %s", (user_id,))

            # 3. Delete from event_subscriptions (if exists)
            cursor.execute("DELETE FROM event_subscriptions WHERE user_id = %s", (user_id,))

            # 4. Delete from Discord table
            cursor.execute("DELETE FROM discord WHERE userid = %s", (user_id,))

            # 5. Delete from permissions
            cursor.execute("DELETE FROM permissions WHERE userid = %s", (user_id,))

            # 6. Delete from verified_users
            cursor.execute("DELETE FROM verified_users WHERE userid = %s", (user_id,))

            # 7. Delete from user_activity
            cursor.execute("DELETE FROM user_activity WHERE userid = %s", (user_id,))

            # 8. Delete from suspensions (if exists)
            cursor.execute("DELETE FROM user_suspensions WHERE user_id = %s", (user_id,))

            # 9. Optional: Update or delete events created by user
            cursor.execute("UPDATE generalevents SET created_by = NULL WHERE created_by = %s", (user_id,))

            # 10. Finally, delete from users table
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))

            mysql.connection.commit()

            return jsonify({
                'success': True,
                'message': f'User {full_name} (@{username}) has been permanently deleted'
            }), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"Database error removing user: {str(e)}")
            return jsonify({
                'success': False,
                'message': f'Database error: {str(e)}'
            }), 500

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error in remove_user: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Server error occurred'
        }), 500