"""
User Suspension Management System
Handles all suspension-related functionality including:
- Suspending users
- Lifting suspensions
- Checking suspension status
- Session invalidation
"""

from flask import jsonify, session, redirect, url_for, flash, request
from datetime import datetime, timedelta
import MySQLdb.cursors


"""
Function to check whether a user is suspended. If so, the user is denied the ability to log in.
@param - user_id is the ID of the user attempting to login.
"""
def check_user_suspension(mysql, user_id):
    """
    Helper function to check if user is suspended
    Returns (is_suspended, suspension_info)
    """
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        cursor.execute("""
            SELECT 
                sus_id,
                suspended_until,
                reason
            FROM user_suspensions
            WHERE user_id = %s 
            AND is_active = TRUE 
            AND suspended_until > NOW()
            ORDER BY suspended_at DESC
            LIMIT 1
        """, (user_id,))

        suspension = cursor.fetchone()
        cursor.close()

        if suspension:
            remaining = suspension['suspended_until'] - datetime.now()
            days = remaining.days
            hours = remaining.seconds // 3600

            return True, {
                'reason': suspension['reason'],
                'suspended_until': suspension['suspended_until'].strftime('%B %d, %Y at %I:%M %p'),
                'remaining_days': days,
                'remaining_hours': hours
            }

        return False, None

    except Exception as e:
        print(f"Error checking suspension: {e}")
        return False, None

"""
Method to determine whether a user session is valid (AKA: they are not suspended)
"""
def check_session_validity(mysql):
    """
    Check if current user's session has been invalidated.
    This runs before every request to protected routes.
    """
    if 'loggedin' in session and 'id' in session:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            # Check if this user has been invalidated since they logged in
            cursor.execute("""
                SELECT kicked_id, reason 
                FROM invalidated_sessions 
                WHERE user_id = %s 
                AND invalidated_at > %s
                ORDER BY invalidated_at DESC 
                LIMIT 1
            """, (session['id'], session.get('login_time', datetime.now())))

            invalidation = cursor.fetchone()

            if invalidation:
                # Session has been invalidated - clear it
                reason = invalidation['reason']
                user_id = session['id']

                # Clear session
                session.clear()

                # Set flash message based on reason
                if reason == 'suspension':
                    flash('Your account has been suspended. You have been logged out.', 'error')
                else:
                    flash('Your session has been terminated by an administrator.', 'error')

                # Delete the invalidation record so we don't keep showing the message
                cursor.execute("DELETE FROM invalidated_sessions WHERE user_id = %s", (user_id,))
                mysql.connection.commit()

                return redirect(url_for('login'))
        finally:
            cursor.close()

    return None

"""
Method meant to clean invalid sessions table every 24 hours to keep it from becoming congested.
"""
def cleanup_old_invalidations(mysql):
    """Remove invalidation records older than 24 hours"""
    try:
        cursor = mysql.connection.cursor()
        cursor.execute("""
            DELETE FROM invalidated_sessions 
            WHERE invalidated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
        """)
        mysql.connection.commit()
        cursor.close()
    except Exception as e:
        print(f"Error cleaning up invalidations: {e}")


def suspend_user_route(mysql):
    """Suspend a user for a specified duration"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        duration_days = int(data.get('duration_days', 0))
        duration_hours = int(data.get('duration_hours', 0))
        reason = data.get('reason', 'No reason provided')

        if not user_id:
            return jsonify({'success': False, 'message': 'User ID is required'})

        # CONVERT user_id to int for proper comparison
        user_id = int(user_id)

        if duration_days == 0 and duration_hours == 0:
            return jsonify({'success': False, 'message': 'Duration must be greater than 0'})

        # Prevent admins from suspending themselves
        if user_id == session['id']:
            return jsonify({'success': False, 'message': 'You cannot suspend yourself'})

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Check if user exists
        cursor.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()

        if not user:
            cursor.close()
            return jsonify({'success': False, 'message': 'User not found'})

        # Calculate suspension end time
        total_hours = (duration_days * 24) + duration_hours
        suspended_until = datetime.now() + timedelta(hours=total_hours)

        # Deactivate any existing active suspensions for this user
        cursor.execute("""
            UPDATE user_suspensions 
            SET is_active = FALSE 
            WHERE user_id = %s AND is_active = TRUE
        """, (user_id,))

        # Create new suspension (sus_id will auto-increment)
        cursor.execute("""
            INSERT INTO user_suspensions 
            (user_id, suspended_until, reason, suspended_by, suspended_at, is_active) 
            VALUES (%s, %s, %s, %s, NOW(), TRUE)
        """, (user_id, suspended_until, reason, session['id']))

        # Invalidate user's session to force logout
        cursor.execute("""
            INSERT INTO invalidated_sessions (user_id, reason)
            VALUES (%s, 'suspension')
        """, (user_id,))

        # Mark user as inactive
        cursor.execute("""
            UPDATE user_activity 
            SET is_active = 0
            WHERE userid = %s
        """, (user_id,))

        mysql.connection.commit()
        cursor.close()

        # Format duration for message
        if duration_days > 0 and duration_hours > 0:
            duration_text = f"{duration_days} day(s) and {duration_hours} hour(s)"
        elif duration_days > 0:
            duration_text = f"{duration_days} day(s)"
        else:
            duration_text = f"{duration_hours} hour(s)"

        return jsonify({
            'success': True,
            'message': f'User @{user["username"]} has been suspended for {duration_text}'
        })

    except Exception as e:
        print(f"Error suspending user: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


def lift_suspension_route(mysql):
    """Lift an active suspension for a user"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({'success': False, 'message': 'User ID is required'})

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Deactivate all active suspensions for this user
        cursor.execute("""
            UPDATE user_suspensions 
            SET is_active = FALSE 
            WHERE user_id = %s AND is_active = TRUE
        """, (user_id,))

        mysql.connection.commit()
        cursor.close()

        return jsonify({
            'success': True,
            'message': 'Suspension has been lifted successfully'
        })

    except Exception as e:
        print(f"Error lifting suspension: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


def get_suspension_status_route(mysql, user_id):
    """Get suspension status for a user"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Get active suspension - using sus_id now
        cursor.execute("""
            SELECT 
                s.sus_id,
                s.suspended_until,
                s.reason,
                s.suspended_at,
                CONCAT(u.firstname, ' ', u.lastname) as suspended_by_name
            FROM user_suspensions s
            LEFT JOIN users u ON s.suspended_by = u.id
            WHERE s.user_id = %s 
            AND s.is_active = TRUE 
            AND s.suspended_until > NOW()
            ORDER BY s.suspended_at DESC
            LIMIT 1
        """, (user_id,))

        suspension = cursor.fetchone()
        cursor.close()

        if suspension:
            # Calculate remaining time
            remaining = suspension['suspended_until'] - datetime.now()
            days = remaining.days
            hours = remaining.seconds // 3600

            return jsonify({
                'success': True,
                'is_suspended': True,
                'suspension': {
                    'sus_id': suspension['sus_id'],
                    'reason': suspension['reason'],
                    'suspended_until': suspension['suspended_until'].strftime('%B %d, %Y at %I:%M %p'),
                    'suspended_at': suspension['suspended_at'].strftime('%B %d, %Y at %I:%M %p'),
                    'suspended_by': suspension.get('suspended_by_name', 'Unknown'),
                    'remaining_days': days,
                    'remaining_hours': hours
                }
            })
        else:
            return jsonify({
                'success': True,
                'is_suspended': False
            })

    except Exception as e:
        print(f"Error getting suspension status: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


def register_suspension_routes(app, mysql):
    """
    Register all suspension-related routes with the Flask app
    This function is called from __init__.py
    """
    from functools import wraps

    # Import the roles_required decorator from the main app
    # We'll need to define it here or import it
    def roles_required(*required_roles):
        """Flexible decorator that checks if user has ANY of the specified roles."""

        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                if 'loggedin' not in session:
                    flash('Please log in to access this page.', 'error')
                    return redirect(url_for('login'))

                cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

                try:
                    cursor.execute("""
                        SELECT is_admin, is_gm, is_player 
                        FROM permissions 
                        WHERE userid = %s
                    """, (session['id'],))
                    permissions = cursor.fetchone()

                    if not permissions:
                        flash('User permissions not found.', 'error')
                        return redirect(url_for('dashboard'))

                    # Map role names to permission columns
                    role_map = {
                        'admin': permissions.get('is_admin', 0),
                        'gm': permissions.get('is_gm', 0),
                        'player': permissions.get('is_player', 0)
                    }

                    # Check if user has ANY of the required roles
                    has_permission = any(role_map.get(role, 0) == 1 for role in required_roles)

                    if not has_permission:
                        flash('You do not have permission to access this page.', 'error')
                        return redirect(url_for('dashboard'))

                    return f(*args, **kwargs)

                finally:
                    cursor.close()

            return decorated_function

        return decorator

    # Register routes
    @app.route('/admin/suspend-user', methods=['POST'])
    @roles_required('admin')
    def suspend_user():
        return suspend_user_route(mysql)

    @app.route('/admin/lift-suspension', methods=['POST'])
    @roles_required('admin')
    def lift_suspension():
        return lift_suspension_route(mysql)

    @app.route('/api/user/<int:user_id>/suspension-status')
    @roles_required('admin')
    def get_suspension_status(user_id):
        return get_suspension_status_route(mysql, user_id)

    # Register the before_request handler
    @app.before_request
    def before_request_check():
        """Run session validity check before each request"""
        # Skip session check for certain routes
        excluded_routes = ['login', 'logout', 'register', 'static', 'verify_email']

        if request.endpoint and request.endpoint not in excluded_routes:
            result = check_session_validity(mysql)
            if result:
                return result