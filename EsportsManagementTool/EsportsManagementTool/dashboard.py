from EsportsManagementTool import app, login_required, roles_required, get_user_permissions, has_role
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_mysqldb import MySQL
from flask_mail import Mail, Message
import MySQLdb.cursors
import re
import bcrypt
import secrets
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta
import calendar as cal
from EsportsManagementTool import discord_integration

from EsportsManagementTool import mysql

from werkzeug.utils import secure_filename

# Allowed file extensions for avatars
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/dashboard')
@app.route('/dashboard/<int:year>/<int:month>')
@login_required  # Added security
def dashboard(year=None, month=None):
    # Get user data
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    cursor.execute("SELECT * FROM users WHERE id = %s", (session['id'],))
    user = cursor.fetchone()
    cursor.execute('SELECT * FROM verified_users WHERE userid = %s', [user['id']])
    is_verified = cursor.fetchone()

    # CRITICAL FIX: Get actual permissions from database instead of overriding
    permissions = get_user_permissions(user['id'])
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

    # Default to current month/year if not specified
    if year is None or month is None:
        today = datetime.now()
        year = today.year
        month = today.month

    # Validate month and year
    if month < 1 or month > 12:
        flash('Invalid month!')
        return redirect(url_for('dashboard'))
    if year < 1900 or year > 2100:
        flash('Year must be between 1900 and 2100!')
        return redirect(url_for('dashboard'))

    # Get today's date for highlighting
    today = datetime.now()
    today_str = today.strftime('%Y-%m-%d')

    # Get calendar information
    cal.setfirstweekday(cal.SUNDAY)
    month_calendar = cal.monthcalendar(year, month)
    month_name = cal.month_name[month]

    # Calculate previous and next month
    if month == 1:
        prev_month = 12
        prev_year = year - 1
    else:
        prev_month = month - 1
        prev_year = year

    if month == 12:
        next_month = 1
        next_year = year + 1
    else:
        next_month = month + 1
        next_year = year

    # Get events from database for this month
    try:
        cursor.execute(
            'SELECT * FROM generalevents WHERE YEAR(Date) = %s AND MONTH(Date) = %s ORDER BY Date, StartTime',
            (year, month)
        )
        events = cursor.fetchall()

        # Organize events by date
        events_by_date = {}
        for event in events:
            date_str = event['Date'].strftime('%Y-%m-%d')

            # Handle timedelta for StartTime
            if event['StartTime']:
                total_seconds = int(event['StartTime'].total_seconds())
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                time_str = f"{hours:02d}:{minutes:02d}"
            else:
                time_str = None

            event_data = {
                'id': event['EventID'],
                'time': time_str,
                'title': event['EventName'],
                'description': event['Description'] if event['Description'] else ''
            }

            if date_str not in events_by_date:
                events_by_date[date_str] = []
            events_by_date[date_str].append(event_data)

        # --- Admin Panel Stats ---
        total_users = active_users = admins = gms = 0

        if user['is_admin'] == 1:
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

                # Count admins from permissions table
                cursor.execute("""
                    SELECT COUNT(DISTINCT u.id) AS admins
                    FROM users u
                    INNER JOIN permissions p ON p.userid = u.id
                    WHERE p.is_admin = 1
                """)
                admins = cursor.fetchone()['admins']

                # Count game managers
                cursor.execute("SELECT COUNT(*) AS gms FROM permissions WHERE is_gm = 1")
                gms = cursor.fetchone()['gms']
            except Exception as e:
                print("Admin stats error:", e)

        # --- Admin User Management ---
        user_list = []

        # FIXED: Only fetch user list if user is actually an admin
        if user['is_admin'] == 1:
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
                        p.is_player
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
            month_calendar=month_calendar,
            month_name=month_name,
            year=year,
            month=month,
            events_by_date=events_by_date,
            today_str=today_str,
            prev_year=prev_year,
            prev_month=prev_month,
            next_year=next_year,
            next_month=next_month,
            total_users=total_users,
            active_users=active_users,
            admins=admins,
            gms=gms,
            user_list=user_list
        )

    finally:
        cursor.close()


# Delete Events functionality. Includes deleting from table.
@app.route('/delete-event', methods=['POST'])
@roles_required('admin')  # Added security - Only admins can delete events
def delete_event():
    """
    Delete an event from the generalevents table.
    Only accessible to logged-in admin users.
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Get the event ID from request JSON
        data = request.get_json()
        event_id = data.get('event_id')

        if not event_id:
            return jsonify({'success': False, 'message': 'Missing event ID'}), 400

        # Verify event exists before attempting to delete
        cursor.execute("SELECT EventID FROM generalevents WHERE EventID = %s", (event_id,))
        event = cursor.fetchone()

        if not event:
            return jsonify({'success': False, 'message': 'Event not found'}), 404

        # Delete the event from the database
        cursor.execute("DELETE FROM generalevents WHERE EventID = %s", (event_id,))
        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': 'Event deleted successfully'
        }), 200

    except Exception as e:
        # Log the error for debugging
        print(f"Error deleting event: {str(e)}")
        mysql.connection.rollback()
        return jsonify({
            'success': False,
            'message': 'Database error occurred while deleting event'
        }), 500

    finally:
        cursor.close()


@app.route('/upload-avatar', methods=['POST'])
def upload_avatar():
    """Handle custom avatar upload"""
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    if 'avatar' not in request.files:
        return jsonify({'success': False, 'message': 'No file uploaded'}), 400

    file = request.files['avatar']

    if file.filename == '':
        return jsonify({'success': False, 'message': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'success': False, 'message': 'Invalid file type. Use PNG, JPG, JPEG, GIF, or WEBP'}), 400

    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > MAX_FILE_SIZE:
        return jsonify({'success': False, 'message': 'File too large. Maximum size is 5MB'}), 400

    try:
        file_extension = file.filename.rsplit('.', 1)[1].lower()
        filename = f"user_{session['id']}.{file_extension}"

        upload_dir = os.path.join(app.root_path, 'static', 'uploads', 'avatars')
        os.makedirs(upload_dir, exist_ok=True)

        filepath = os.path.join(upload_dir, filename)

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute("SELECT profile_picture FROM users WHERE id = %s", (session['id'],))
        old_avatar = cursor.fetchone()

        if old_avatar and old_avatar['profile_picture']:
            old_filepath = os.path.join(upload_dir, old_avatar['profile_picture'])
            if os.path.exists(old_filepath):
                os.remove(old_filepath)

        file.save(filepath)

        cursor.execute("""
            UPDATE users 
            SET profile_picture = %s 
            WHERE id = %s
        """, (filename, session['id']))

        mysql.connection.commit()
        cursor.close()

        return jsonify({
            'success': True,
            'message': 'Avatar uploaded successfully!',
            'avatar_url': f"/static/uploads/avatars/{filename}"
        })

    except Exception as e:
        print(f"Error uploading avatar: {str(e)}")
        mysql.connection.rollback()
        return jsonify({'success': False, 'message': 'Failed to upload avatar'}), 500


# Route meant to assign and remove roles.
# unless that file gets nuked eventually.
@app.route('/admin/manage-role', methods=['POST'])
@roles_required('admin')
def manage_role():
    """
    Assign or remove roles from users
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


@app.route('/api/user/<int:user_id>/managed-game', methods=['GET'])
@login_required
def get_user_managed_game(user_id):
    """Get which game (if any) this user manages"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get all games
            cursor.execute("SELECT GameID, GameTitle, GameImage FROM games")
            all_games = cursor.fetchall()

            # Check each game table to see if this user is the GM
            for game in all_games:
                table_name = get_game_table_name(game['GameTitle'])

                try:
                    cursor.execute(
                        f"SELECT 1 FROM `{table_name}` WHERE user_id = %s AND is_game_manager = 1",
                        (user_id,)
                    )

                    if cursor.fetchone():
                        # This user manages this game
                        image_url = f'/game-image/{game["GameID"]}' if game.get('GameImage') else None

                        return jsonify({
                            'success': True,
                            'manages_game': True,
                            'game_id': game['GameID'],
                            'game_title': game['GameTitle'],
                            'game_icon': image_url
                        })
                except Exception as e:
                    # Table might not exist, continue
                    continue

            # User doesn't manage any game
            return jsonify({
                'success': True,
                'manages_game': False
            })

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error getting managed game: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to get managed game'}), 500

@app.route('/admin/remove-user', methods=['POST'])
@roles_required('admin')
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
            cursor.execute("DELETE FROM suspensions WHERE userid = %s", (user_id,))

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


# ===================================
# EVENTS TAB API ROUTES
# ===================================

@app.route('/api/events', methods=['GET'])
@login_required
def get_events():
    """
    Get events based on user role:
    - Admins: See all events (or upcoming based on filter)
    - Game Managers: See events they created (or upcoming based on filter)
    - Regular Users: See events they're subscribed to (or upcoming based on filter)
    """
    try:
        user_id = session['id']
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Get user permissions
        permissions = get_user_permissions(user_id)
        is_admin = permissions['is_admin']
        is_gm = permissions['is_gm']

        # Get filter parameter from request (default to 'all')
        event_filter = request.args.get('filter', 'all')

        # Get current date and time
        now = datetime.now()
        current_date = now.date()
        current_time = now.time()

        # Determine date filter based on filter type
        if event_filter == 'upcoming':
            # Show events in next 7 days
            end_date = current_date + timedelta(days=7)
            date_condition = "Date >= %s AND Date <= %s"
            date_params = (current_date, end_date)
        else:  # 'all'
            # Show all events (no date filter)
            date_condition = "1=1"  # Always true
            date_params = ()

        # Build query based on user role
        if is_admin:
            # Admins see all events (based on filter)
            if event_filter == 'upcoming':
                cursor.execute(f"""
                    SELECT 
                        EventID,
                        EventName,
                        Date,
                        StartTime,
                        EndTime,
                        EventType,
                        Game,
                        Location,
                        Description,
                        created_by
                    FROM generalevents
                    WHERE {date_condition}
                    ORDER BY Date ASC, StartTime ASC
                """, date_params)
            else:
                cursor.execute("""
                    SELECT 
                        EventID,
                        EventName,
                        Date,
                        StartTime,
                        EndTime,
                        EventType,
                        Game,
                        Location,
                        Description,
                        created_by
                    FROM generalevents
                    ORDER BY Date DESC, StartTime DESC
                """)

        elif is_gm:
            # Game Managers see only events they created (based on filter)
            if event_filter == 'upcoming':
                cursor.execute(f"""
                    SELECT 
                        EventID,
                        EventName,
                        Date,
                        StartTime,
                        EndTime,
                        EventType,
                        Game,
                        Location,
                        Description,
                        created_by
                    FROM generalevents
                    WHERE {date_condition} AND created_by = %s
                    ORDER BY Date ASC, StartTime ASC
                """, (*date_params, user_id))
            else:
                cursor.execute("""
                    SELECT 
                        EventID,
                        EventName,
                        Date,
                        StartTime,
                        EndTime,
                        EventType,
                        Game,
                        Location,
                        Description,
                        created_by
                    FROM generalevents
                    WHERE created_by = %s
                    ORDER BY Date DESC, StartTime DESC
                """, (user_id,))

        else:
            # Regular users see events they're subscribed to (based on filter)
            if event_filter == 'upcoming':
                cursor.execute(f"""
                    SELECT 
                        ge.EventID,
                        ge.EventName,
                        ge.Date,
                        ge.StartTime,
                        ge.EndTime,
                        ge.EventType,
                        ge.Game,
                        ge.Location,
                        ge.Description,
                        ge.created_by
                    FROM generalevents ge
                    INNER JOIN event_subscriptions es ON ge.EventID = es.event_id
                    WHERE {date_condition} AND es.user_id = %s
                    ORDER BY ge.Date ASC, ge.StartTime ASC
                """, (*date_params, user_id))
            else:
                cursor.execute("""
                    SELECT 
                        ge.EventID,
                        ge.EventName,
                        ge.Date,
                        ge.StartTime,
                        ge.EndTime,
                        ge.EventType,
                        ge.Game,
                        ge.Location,
                        ge.Description,
                        ge.created_by
                    FROM generalevents ge
                    INNER JOIN event_subscriptions es ON ge.EventID = es.event_id
                    WHERE es.user_id = %s
                    ORDER BY ge.Date DESC, ge.StartTime DESC
                """, (user_id,))

        events = cursor.fetchall()
        cursor.close()

        # Process events to format time and check if ongoing
        events_list = []
        for event in events:
            # Convert timedelta to time string
            start_time_str = None
            end_time_str = None

            if event['StartTime']:
                if isinstance(event['StartTime'], timedelta):
                    total_seconds = int(event['StartTime'].total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    start_time_str = f"{hours:02d}:{minutes:02d}"
                else:
                    start_time_str = event['StartTime'].strftime('%H:%M')

            if event['EndTime']:
                if isinstance(event['EndTime'], timedelta):
                    total_seconds = int(event['EndTime'].total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    end_time_str = f"{hours:02d}:{minutes:02d}"
                else:
                    end_time_str = event['EndTime'].strftime('%H:%M')

            # Check if event is ongoing
            is_ongoing = False
            event_date = event['Date']

            if event_date == current_date and start_time_str and end_time_str:
                # Parse times for comparison
                try:
                    start_hour, start_min = map(int, start_time_str.split(':'))
                    end_hour, end_min = map(int, end_time_str.split(':'))

                    # Create time objects for comparison
                    from datetime import time as dt_time
                    start_time = dt_time(start_hour, start_min)
                    end_time = dt_time(end_hour, end_min)

                    # Compare with current time
                    if start_time <= current_time <= end_time:
                        is_ongoing = True
                        print(
                            f"Event {event['EventName']} is ongoing! Current: {current_time}, Start: {start_time}, End: {end_time}")
                except Exception as e:
                    print(f"Error checking if event is ongoing: {str(e)}")
                    pass

            # Format date for display
            date_str = event_date.strftime('%B %d, %Y')

            event_data = {
                'id': event['EventID'],
                'name': event['EventName'],
                'date': date_str,
                'date_raw': event_date.strftime('%Y-%m-%d'),
                'start_time': start_time_str,
                'end_time': end_time_str,
                'event_type': event['EventType'] or 'Event',
                'game': event['Game'] or 'N/A',
                'location': event['Location'] or 'TBD',
                'description': event['Description'] or 'No description provided',
                'is_ongoing': is_ongoing,
                'created_by': event['created_by']
            }

            events_list.append(event_data)

        return jsonify({
            'success': True,
            'events': events_list,
            'is_admin': is_admin,
            'is_gm': is_gm
        }), 200

    except Exception as e:
        print(f"Error fetching events: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': 'Failed to fetch events'
        }), 500


@app.route('/api/events/<int:event_id>', methods=['DELETE'])
@login_required
def delete_event_from_tab(event_id):
    """
    Delete an event from the Events tab
    - Admins can delete any event
    - Game Managers can only delete events they created
    """
    try:
        user_id = session['id']
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Get user permissions
        permissions = get_user_permissions(user_id)
        is_admin = permissions['is_admin']
        is_gm = permissions['is_gm']

        # Get event details
        cursor.execute("""
            SELECT EventID, EventName, created_by
            FROM generalevents
            WHERE EventID = %s
        """, (event_id,))

        event = cursor.fetchone()

        if not event:
            cursor.close()
            return jsonify({
                'success': False,
                'message': 'Event not found'
            }), 404

        # Check permissions
        if is_admin:
            # Admins can delete any event
            can_delete = True
        elif is_gm and event['created_by'] == user_id:
            # Game Managers can only delete their own events
            can_delete = True
        else:
            can_delete = False

        if not can_delete:
            cursor.close()
            return jsonify({
                'success': False,
                'message': 'You do not have permission to delete this event'
            }), 403

        # Delete the event
        cursor.execute("DELETE FROM generalevents WHERE EventID = %s", (event_id,))
        mysql.connection.commit()
        cursor.close()

        return jsonify({
            'success': True,
            'message': f'Event "{event["EventName"]}" deleted successfully'
        }), 200

    except Exception as e:
        print(f"Error deleting event: {str(e)}")
        import traceback
        traceback.print_exc()
        mysql.connection.rollback()
        return jsonify({
            'success': False,
            'message': 'Failed to delete event'
        }), 500

#DISCLAIMER: THIS CODE WAS GENERATED BY CHATGPT#

# ------------------------------
# Check subscription for current user & event
# ------------------------------
@app.route('/api/event/<int:event_id>/subscription-status')
def subscription_status(event_id):
    user_id = session['id']
    if not user_id:
        return jsonify({'error': 'User not logged in'}), 401

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    # Check if user subscribed to this event
    cursor.execute("""
        SELECT * FROM event_subscriptions
        WHERE user_id=%s AND event_id=%s
    """, (user_id, event_id))
    subscription = cursor.fetchone()

    # Check global notification preference
    cursor.execute("""
        SELECT enable_notifications FROM notification_preferences
        WHERE user_id=%s
    """, (user_id,))
    pref = cursor.fetchone()

    cursor.close()

    return jsonify({
        'subscribed': bool(subscription),
        'notifications_enabled': pref['enable_notifications'] if pref else False
    })


# ------------------------------
# Toggle event subscription
# ------------------------------
@app.route('/api/event/<int:event_id>/toggle-subscription', methods=['POST'])
def toggle_subscription(event_id):
    user_id = session.get('id')
    if not user_id:
        return jsonify({'error': 'User not logged in'}), 401

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        # Check global notification preference
        cursor.execute("""
            SELECT enable_notifications
            FROM notification_preferences
            WHERE user_id=%s
        """, (user_id,))
        pref = cursor.fetchone()
        notifications_enabled = pref and pref['enable_notifications'] == 1

        if not notifications_enabled:
            return jsonify({
                'error': 'Global notifications are disabled. Enable them first in your preferences.'
            }), 403

        # Check if already subscribed
        cursor.execute("""
            SELECT * FROM event_subscriptions
            WHERE user_id=%s AND event_id=%s
        """, (user_id, event_id))
        subscription = cursor.fetchone()

        if subscription:
            # Unsubscribe
            cursor.execute("""
                DELETE FROM event_subscriptions
                WHERE user_id=%s AND event_id=%s
            """, (user_id, event_id))
            status = 'unsubscribed'
        else:
            # Subscribe
            cursor.execute("""
                INSERT INTO event_subscriptions (user_id, event_id, subscribed_at)
                VALUES (%s, %s, %s)
            """, (user_id, event_id, datetime.now()))
            status = 'subscribed'

        mysql.connection.commit()
        return jsonify({'status': status})
    except Exception as e:
        print("Error in toggle_subscription:", e)
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()

#DISCLAIMER: THIS CODE WAS GENERATED BY CHATGPT#