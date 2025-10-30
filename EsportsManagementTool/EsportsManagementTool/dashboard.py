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
            #Clean up inactive users before displaying stats
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

#Route meant to assign and remove roles. Hopefully will move to adminPanel.py at some point
#unless that file gets nuked eventually.
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

