# This Flask project is set up in the packages format, meaning we can
# separate our application into multiple modules that are then imported
# into __init__.py here

from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_mysqldb import MySQL
from flask_mail import Mail, Message
from datetime import datetime
import calendar as cal
import MySQLdb.cursors
import re
import bcrypt
import secrets
from dotenv import load_dotenv
import os
import requests
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__)

# Module imports
import EsportsManagementTool.exampleModule
import EsportsManagementTool.EventNotificationManager
import EsportsManagementTool.UpdateProfile

# Change this to your secret key (can be anything, it's for extra protection)
app.secret_key = 'your secret key'

# Enter your database connection details below
app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD')
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB')

app.config['MAIL_SERVER'] = 'smtp-relay.brevo.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER')

app.config['MYSQL_SSL_DISABLED'] = False
app.config['MYSQL_CUSTOM_OPTIONS'] = {
    'ssl_mode': 'REQUIRED'
}

"""
All security settings were developed in part with Claude.ai.
Forcing HTTPS developed in part with Claude.ai.
SSL security and bcrypt set to hash and salt passwords, and to ensure no data
leakage across packet transferring. 
"""
mysql = MySQL(app)
mail = Mail(app)

# Set timezone for all MySQL connections
@app.before_request
def set_mysql_timezone():
    """Set MySQL session timezone to match server"""
    if mysql.connection:
        cursor = mysql.connection.cursor()
        cursor.execute("SET time_zone = '-05:00';")  # Adjust based on your timezone
        cursor.close()

# For production, force HTTPS
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'


# ============================================
# ROLE-BASED SECURITY SYSTEM (the following was developed in part with CLaudeAI)
# ============================================
"""
Method to ensure users must login before accessing program.
"""
def login_required(f):
    """Require user to be logged in"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'loggedin' not in session:
            flash('Please log in to access this page.', 'error')
            return redirect(url_for('login'))

        # Update last_seen timestamp on each request
        if 'id' in session:
            update_user_last_seen(session['id'])

        return f(*args, **kwargs)

    return decorated_function

"""
Method defining role hierarchy functionality.
@param - required_roles is the necessary roles for the action attempting to be performed.
"""
def roles_required(*required_roles):
    """
    Flexible decorator that checks if user has ANY of the specified roles.

    Usage:
        @roles_required('admin')                    # Only admins
        @roles_required('admin', 'gm')              # Admins OR GMs
        @roles_required('admin', 'gm', 'player')    # Any user with a role
    """
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

"""
Method that retrieves all roles a user has from the database.
@param - user_id is the id of the user being checked.
"""
def get_user_permissions(user_id):
    """Fetch user permissions from database"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("""
            SELECT is_admin, is_gm, is_player 
            FROM permissions 
            WHERE userid = %s
        """, (user_id,))
        permissions = cursor.fetchone()

        if permissions:
            return permissions
        else:
            return {'is_admin': 0, 'is_gm': 0, 'is_player': 0}
    finally:
        cursor.close()

"""
Method that checks if a user has a specific role for certain actions, including accessing admin panel, etc.
@param - role_name is the title of the role being checked from the user.
"""
def has_role(role_name):
    """
    Check if current user has a specific role.
    Useful for conditional logic in views.
    """
    if 'loggedin' not in session:
        return False

    permissions = get_user_permissions(session['id'])
    role_map = {
        'admin': permissions['is_admin'],
        'gm': permissions['is_gm'],
        'player': permissions['is_player']
    }

    return role_map.get(role_name, 0) == 1

"""
Method to show when a user was last seen active. Displays on Admin Panel.
@param - user_id is the id of the user being changed.
"""
def update_user_last_seen(user_id):
    """
    Update user's last_seen timestamp
    Called on each authenticated request to keep them marked as active
    """
    try:
        cursor = mysql.connection.cursor()
        cursor.execute("""
            UPDATE user_activity 
            SET last_seen = NOW(), is_active = 1
            WHERE userid = %s
        """, (user_id,))
        mysql.connection.commit()
        cursor.close()
    except Exception as e:
        print(f"Error updating last_seen: {str(e)}")

"""
Method to remove inactive users from the active users list in the database.
"""
def cleanup_inactive_users():
    """
    Mark users as inactive if they haven't been seen in 15 minutes
    This can be called periodically or before displaying the admin panel
    """
    cleanup_old_invalidations()
    try:
        cursor = mysql.connection.cursor()
        cursor.execute("""
            UPDATE user_activity 
            SET is_active = 0
            WHERE is_active = 1 
            AND last_seen < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
        """)
        mysql.connection.commit()
        cursor.close()
    except Exception as e:
        print(f"Error cleaning up inactive users: {str(e)}")

# ============================================
# ROUTES (The following was developed in part with ClaudeAI
# ============================================

# Home/Landing Page
@app.route('/')
def index():
    return render_template('index.html')

"""
Method to send a verification email to newly registered users.
@param - email is the inputted email from the user
@param - token is the email to be sent to the user.
"""
def send_verify_email(email, token):
    verify_url = url_for('verify_email', token=token, _external=True)
    msg = Message('Verify Your Stockton University Email Account', recipients=[email])
    msg.body = f'''Hello,
    Please click the link below to verify your Stockton Esports Management Tool account:

    {verify_url}

    This link will expire after 24 hours.

    If you did not create this account, please ignore this email.

    - 5 Brain Cells: SU Esports MGMT Tool Team.
    '''
    mail.send(msg)

"""
Method to determine whether a user session is valid (AKA: they are not suspended)
"""
def check_session_validity():
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
def cleanup_old_invalidations():
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

"""
Route designed to check session validity between pages. If a user is suspended, their next action will kick them.
"""
@app.before_request
def before_request_check():
    """Run session validity check before each request"""
    # Skip session check for certain routes
    excluded_routes = ['login', 'logout', 'register', 'static', 'verify_email']

    if request.endpoint and request.endpoint not in excluded_routes:
        result = check_session_validity()
        if result:
            return result

#Function to check whether a user is suspended. If so, the user is denied the ability to log in.
#@param - user_id is the ID of the user attempting to login.
def check_user_suspension(user_id):
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
API route to get event details for the Event Details Modal within dashboard.html
"""
@app.route('/api/event/<int:event_id>')
@login_required  # Added security
def api_event_details(event_id):
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute('SELECT * FROM generalevents WHERE EventID = %s', (event_id,))
        event = cursor.fetchone()

        if not event:
            return jsonify({'error': 'Event not found'}), 404

        # Format the event data
        event_data = {
            'id': event['EventID'],
            'name': event['EventName'],
            'date': event['Date'].strftime('%B %d, %Y'),
            'start_time': None,
            'end_time': None,
            'description': event['Description'] if event['Description'] else 'No description provided',
            'event_type': event['EventType'] if event['EventType'] else 'General',
            'game': event['Game'] if event['Game'] else 'N/A',
            'location': event['Location'] if event['Location'] else 'TBD'
        }

        # Handle timedelta for StartTime
        if event['StartTime']:
            total_seconds = int(event['StartTime'].total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            event_data['start_time'] = f"{hours:02d}:{minutes:02d}"

        # Handle timedelta for EndTime
        if event['EndTime']:
            total_seconds = int(event['EndTime'].total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            event_data['end_time'] = f"{hours:02d}:{minutes:02d}"

        return jsonify(event_data)
    finally:
        cursor.close()

"""
Route to let users successfully verify their email through the email sent to their inbox.
"""
@app.route('/verify/<token>')
def verify_email(token):
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute(
            'SELECT * FROM verified_users WHERE verification_token = %s AND token_expiry > NOW()', (token,))
        user = cursor.fetchone()

        if user:
            cursor.execute(
                'UPDATE verified_users SET is_verified = TRUE, verification_token = NULL, token_expiry = NULL where userid = %s',
                (user['userid'],)
            )
            mysql.connection.commit()
            flash('Email is successfully verified, welcome to Stockton Esports! You can now log in.', 'success')
            return redirect(url_for('login'))
        else:
            flash('ERROR: Verification link is invalid/expired.', 'error')
            return redirect(url_for('register'))
    finally:
        cursor.close()

"""
Route to let users login on the login page.
"""
@app.route('/login', methods=['GET', 'POST'])
def login():
    msg = ''
    if request.method == 'POST' and 'username' in request.form and 'password' in request.form:
        username = request.form['username']
        password = request.form['password']

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            cursor.execute('SELECT * FROM users WHERE username = %s', [username])
            account = cursor.fetchone()

            if account:
                cursor.execute('SELECT is_verified FROM verified_users WHERE userid = %s', (account['id'],))
                is_verified = cursor.fetchone()

                if account and bcrypt.checkpw(password.encode('utf-8'), account['password'].encode('utf-8')):
                    if is_verified['is_verified'] == 0:
                        flash(
                            'Account is still not verified! A new email has been sent, check your inbox! If mail does not appear, please check your spam!')
                        verification_token = secrets.token_urlsafe(32)
                        token_expiry = datetime.now() + timedelta(hours=24)

                        cursor.execute(
                            'UPDATE verified_users SET verification_token = %s, token_expiry = %s WHERE userid = %s',
                            (verification_token, token_expiry, account['id']))
                        mysql.connection.commit()

                        try:
                            send_verify_email(account['email'], verification_token)
                            msg = 'Email sent.'
                        except Exception as e:
                            msg = f'Email failed to send. Error: {str(e)}'
                    else:
                        # ============================================
                        # CHECK FOR SUSPENSION BEFORE ALLOWING LOGIN
                        # ============================================
                        is_suspended, suspension_info = check_user_suspension(account['id'])

                        if is_suspended:
                            # Format remaining time
                            if suspension_info['remaining_days'] > 0:
                                time_remaining = f"{suspension_info['remaining_days']} day(s)"
                                if suspension_info['remaining_hours'] > 0:
                                    time_remaining += f" and {suspension_info['remaining_hours']} hour(s)"
                            else:
                                time_remaining = f"{suspension_info['remaining_hours']} hour(s)"

                            msg = (f"Your account has been suspended until {suspension_info['suspended_until']}. "
                                   f"Reason: {suspension_info['reason']}. "
                                   f"Time remaining: {time_remaining}.")
                        else:
                            # User is NOT suspended - proceed with login
                            session['loggedin'] = True
                            session['id'] = account['id']
                            session['username'] = account['username']
                            session['login_time'] = datetime.now()

                            # Update user activity tracking
                            try:
                                cursor.execute("""
                                    INSERT INTO user_activity (userid, is_active, last_seen)
                                    VALUES (%s, 1, NOW())
                                    ON DUPLICATE KEY UPDATE
                                        is_active = 1,
                                        last_seen = NOW()
                                """, (account['id'],))
                                mysql.connection.commit()
                            except Exception as e:
                                print(f"Error updating user activity: {str(e)}")

                            return redirect(url_for('dashboard'))
                else:
                    msg = 'Incorrect username/password!'
            else:
                msg = 'Account does not exist!'
        finally:
            cursor.close()

    return render_template('login.html', msg=msg)

"""
Route to let users logout of their account whenever they please.
"""
@app.route('/logout', methods=['POST'])
def logout():
    # Mark user as inactive before logging out
    if 'id' in session:
        try:
            cursor = mysql.connection.cursor()
            cursor.execute("""
                UPDATE user_activity 
                SET is_active = 0, last_seen = NOW()
                WHERE userid = %s
            """, (session['id'],))
            mysql.connection.commit()
            cursor.close()
        except Exception as e:
            print(f"Error updating logout activity: {str(e)}")

    session.pop('loggedin', None)
    session.pop('id', None)
    session.pop('username', None)
    flash('Successfully logged out.')
    return redirect(url_for('login'))

"""
Route to allow users to register their account using email, password, and other fields.
"""
@app.route('/register', methods=['GET', 'POST'])
def register():
    msg = ''
    if request.method == 'POST' and 'username' in request.form and 'password' in request.form and 'passwordconfirm' in request.form and 'email' in request.form:

        firstname = request.form['firstname']
        lastname = request.form['lastname']
        username = request.form['username']
        password = request.form['password']
        passwordconfirm = request.form['passwordconfirm']
        email = request.form['email']

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            cursor.execute('SELECT * FROM users WHERE username = %s', (username,))
            account = cursor.fetchone()

            if account:
                msg = 'Account already exists!'
            elif not re.match(r'[^@]+@[^@]+\.[^@]+', email):
                msg = 'Invalid email address!'
            elif not re.match(r'[A-Za-z0-9]+', username):
                msg = 'Username must contain only characters and numbers!'
            elif password != passwordconfirm:
                msg = 'Passwords do not match!'
            elif not (email.endswith('@stockton.edu') or email.endswith('@go.stockton.edu')):
                msg = 'Email must be a Stockton email address (@stockton.edu or @go.stockton.edu)!'
            elif not username or not password or not email:
                msg = 'Please fill out the form!'
            else:
                hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
                cursor.execute(
                    'INSERT INTO users (firstname, lastname, username, password, email) VALUES (%s, %s, %s, %s, %s)',
                    (firstname, lastname, username, hashed_password, email))
                mysql.connection.commit()

                cursor.execute('SELECT id FROM users WHERE username = %s', [username])
                newUser = cursor.fetchone()

                cursor.execute('INSERT INTO verified_users (userid) VALUES (%s)', (newUser['id'],))
                mysql.connection.commit()

                cursor.execute('INSERT INTO permissions (userid) VALUES (%s)', (newUser['id'],))
                mysql.connection.commit()

                # Create user activity record (initially inactive)
                cursor.execute("""
                    INSERT INTO user_activity (userid, is_active, last_seen)
                    VALUES (%s, 0, NULL)
                """, (newUser['id'],))
                mysql.connection.commit()

                verification_token = secrets.token_urlsafe(32)
                token_expiry = datetime.now() + timedelta(hours=24)

                cursor.execute('UPDATE verified_users SET verification_token = %s, token_expiry = %s WHERE userid = %s',
                               (verification_token, token_expiry, newUser['id']))
                mysql.connection.commit()

                send_verify_email(email, verification_token)
                msg = 'You have successfully created an account! Please check your email for verification! If the email does not appear in your inbox, please check your spam!'
        finally:
            cursor.close()

    elif request.method == 'POST':
        msg = 'Please fill out the form!'

    return render_template('register.html', msg=msg)


"""
App route to get to event registration.
"""
@app.route('/event-register', methods=['GET', 'POST'])
@roles_required('admin', 'gm')  # Added security - GMs and Admins can create events
def eventRegister():
    msg = ''
    if request.method == 'POST':
        # Receives a user response for all of eventName, eventDate, eventTime, and eventDescription
        eventName = request.form.get('eventName', '').strip()
        eventDate = request.form.get('eventDate', '').strip()
        eventType = request.form.get('eventType', '').strip()
        game = request.form.get('game', '').strip()
        startTime = request.form.get('startTime', '').strip()
        endTime = request.form.get('endTime', '').strip()
        eventDescription = request.form.get('eventDescription', '').strip()
        location = request.form.get('eventLocation', '').strip()

        # Does what needs to be done if the fields are filled out.
        if eventName and eventDate and eventType and startTime and endTime and eventDescription:
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
            try:
                cursor.execute(
                    'INSERT INTO generalevents (EventName, Date, StartTime, EndTime, Description, EventType, Game, Location, created_by) '
                    'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)',
                    (eventName, eventDate, startTime, endTime, eventDescription, eventType, game, location,
                     session['id']))
                # Confirms that the event is registered.
                mysql.connection.commit()
                msg = 'Event Registered!'

                # Check if it's an AJAX request
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.accept_mimetypes.accept_json:
                    return jsonify({'success': True, 'message': msg}), 200

            except Exception as e:
                msg = f'Error: {str(e)}'
                # Return error as JSON for AJAX
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.accept_mimetypes.accept_json:
                    return jsonify({'success': False, 'message': msg}), 400
            finally:
                cursor.close()

        # Prompts user to fill out all fields if they leave any/all blank.
        else:
            msg = 'Please fill out all fields!'
            # Return error as JSON for AJAX
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.accept_mimetypes.accept_json:
                return jsonify({'success': False, 'message': msg}), 400

    # Uses the event-register html file to render the page (only for direct GET requests)
    return render_template('event-register.html', msg=msg)

import EsportsManagementTool.dashboard
from EsportsManagementTool import game
from EsportsManagementTool import teamCreation

# =======================
# SUSPENSION ROUTES (the following was produced in tandem with ClaudeAI)
# ========================
"""
Route allowing admins to suspend users for a customizable amount of time.
"""
@app.route('/admin/suspend-user', methods=['POST'])
@roles_required('admin')
def suspend_user():
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

        # **NEW: Invalidate user's session to force logout**
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

"""
Route allowing admins to lift suspensions for users.
"""
@app.route('/admin/lift-suspension', methods=['POST'])
@roles_required('admin')
def lift_suspension():
    """Lift an active suspension for a user"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({'success': False, 'message': 'User ID is required'})

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Deactivate all active suspensions
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
        return jsonify({'success': False, 'message': str(e)}), 500

"""
Route designed to find the suspension status when clicking on a user in the admin panel. Displays status if suspended.
"""
@app.route('/api/user/<int:user_id>/suspension-status')
@roles_required('admin')
def get_suspension_status(user_id):
    """Get suspension status for a user"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Get active suspension
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
                    'suspended_by': suspension['suspended_by_name'],
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
        return jsonify({'success': False, 'message': str(e)}), 500

# This is used for debugging, It will show the app routes that are registered.
if __name__ != '__main__':
    print("\n=== REGISTERED ROUTES ===")
    for rule in app.url_map.iter_rules():
        print(f"{rule.endpoint}: {rule.rule}")
    print("=========================\n")
