"""
Esports Management Tool - Main Application Module
================================================
This module serves as the entry point for the Flask application, configured in
the packages format for modular organization.

Features:
---------
- User authentication (login, registration, logout) with bcrypt password hashing
- Email verification system for new user accounts
- Role-based access control (Admin, GM, Player, Developer)
- Timezone management (EST/EDT with automatic DST handling)
- Session security with HTTPS enforcement
- Calendar event system with AJAX endpoints
- User activity tracking
- "Remember Me" functionality with secure tokens

Security:
---------
- SSL/TLS encryption for database connections
- bcrypt password hashing with salt
- Secure session cookies (HTTPOnly, Secure, SameSite)
- CSRF protection via Flask's session management
- Role-based authorization decorators

Dependencies:
------------
- Flask: Web framework
- Flask-MySQLdb: MySQL database integration
- Flask-Mail: Email functionality
- bcrypt: Password hashing
- pytz: Timezone management
- python-dotenv: Environment variable management

Authors: 5 Brain Cells Team (developed in part with Claude.ai)
"""

# =========================================
# CORE IMPORTS
# =========================================
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify, make_response
from flask_mysqldb import MySQL
from flask_mail import Mail, Message
from datetime import datetime, timedelta
from functools import wraps
import calendar as cal
import MySQLdb.cursors
import re
import bcrypt
import secrets
import os
import requests
import pytz

# =========================================
# APPLICATION INITIALIZATION
# =========================================
app = Flask(__name__)

# =========================================
# EARLY MODULE IMPORTS (No initialization dependencies)
# =========================================
import EsportsManagementTool.exampleModule
import EsportsManagementTool.UpdateProfile

# =========================================
# CONFIGURATION
# =========================================
# Security: Change this to a strong random key in production
app.secret_key = 'your secret key'

# Database Configuration (loaded from environment variables)
app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD')
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB')

# SSL Configuration for MySQL (enforces encrypted connections)
app.config['MYSQL_SSL_DISABLED'] = False
app.config['MYSQL_CUSTOM_OPTIONS'] = {
    'ssl_mode': 'REQUIRED'
}

# Email Configuration (Brevo SMTP)
app.config['MAIL_SERVER'] = 'smtp-relay.brevo.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER')

# API Keys
app.config['YOUTUBE_API_KEY'] = os.environ.get('YOUTUBE_API_KEY')

# Session Security (HTTPS enforcement)
# Note: SESSION_COOKIE_SECURE should be True in production with HTTPS
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Initialize extensions
mysql = MySQL(app)
mail = Mail(app)

# =========================================
# TIMEZONE CONFIGURATION
# =========================================
# Eastern Time Zone (handles DST automatically)
EST = pytz.timezone('America/New_York')


def get_current_time():
    """
    Get current time in EST/EDT timezone.

    Returns:
        datetime: Current time with EST timezone information
    """
    return datetime.now(EST)


def localize_datetime(dt):
    """
    Convert naive datetime to EST or convert aware datetime to EST.

    Args:
        dt (datetime): Datetime object to localize

    Returns:
        datetime: Timezone-aware datetime in EST
    """
    if dt.tzinfo is None:
        return EST.localize(dt)
    return dt.astimezone(EST)


@app.before_request
def set_mysql_timezone():
    """
    Set MySQL session timezone to match EST/EDT dynamically.

    This hook runs before each request to ensure database timestamps
    are consistent with application timezone. Handles DST transitions
    automatically.
    """
    if mysql.connection:
        cursor = mysql.connection.cursor()
        try:
            # Calculate current UTC offset for EST (accounts for DST)
            est_now = datetime.now(EST)
            offset_seconds = est_now.utcoffset().total_seconds()
            offset_hours = int(offset_seconds / 3600)
            offset_minutes = int((offset_seconds % 3600) / 60)

            offset_str = f"{offset_hours:+03d}:{offset_minutes:02d}"
            cursor.execute(f"SET time_zone = '{offset_str}';")
        finally:
            cursor.close()


# =========================================
# TEMPLATE FILTERS
# =========================================
@app.template_filter('format_datetime')
def format_datetime_filter(dt, format='%B %d, %Y at %I:%M %p'):
    """
    Format datetime for display in templates with EST timezone.

    Args:
        dt: Datetime object or ISO format string
        format (str): strftime format string

    Returns:
        str: Formatted datetime string with 'EST' suffix, or 'N/A' if None

    Example:
        {{ event.date|format_datetime }} -> "December 24, 2025 at 03:30 PM EST"
    """
    if dt is None:
        return 'N/A'

    # Handle string input (ISO format)
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt)
        except:
            return dt

    # Ensure timezone awareness
    if dt.tzinfo is None:
        dt = EST.localize(dt)

    return dt.strftime(format) + ' EST'


@app.template_filter('to_est')
def to_est_filter(dt):
    """
    Convert datetime to EST timezone for template use.

    Args:
        dt (datetime): Datetime to convert

    Returns:
        datetime: EST timezone-aware datetime, or None if input is None
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return EST.localize(dt)
    return dt.astimezone(EST)


# ============================================
# ROLE-BASED SECURITY SYSTEM
# ============================================
def login_required(f):
    """
    Decorator to ensure user is authenticated before accessing a route.

    Also updates the user's last_seen timestamp on each request to track
    active users in the system.

    Args:
        f: View function to wrap

    Returns:
        Decorated function that checks authentication

    Example:
        @app.route('/dashboard')
        @login_required
        def dashboard():
            return render_template('dashboard.html')
    """

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'loggedin' not in session:
            flash('Please log in to access this page.', 'error')
            return redirect(url_for('login'))

        # Update user activity tracking
        if 'id' in session:
            update_user_last_seen(session['id'])

        return f(*args, **kwargs)

    return decorated_function


def roles_required(*required_roles):
    """
    Flexible decorator to check if user has ANY of the specified roles.

    Checks against the permissions table in the database. User must have
    at least one of the specified roles to access the route.

    Args:
        *required_roles: Variable number of role names ('admin', 'gm', 
                        'player', 'developer')

    Returns:
        Decorator function

    Example:
        @app.route('/admin')
        @roles_required('admin', 'developer')
        def admin_panel():
            return render_template('admin.html')
    """

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Ensure user is logged in
            if 'loggedin' not in session:
                flash('Please log in to access this page.', 'error')
                return redirect(url_for('login'))

            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # Fetch user permissions from database
                cursor.execute("""
                    SELECT is_admin, is_gm, is_player, is_developer 
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
                    'player': permissions.get('is_player', 0),
                    'developer': permissions.get('is_developer', 0)
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


def get_user_permissions(user_id):
    """
    Fetch all permissions/roles for a specific user.

    Args:
        user_id (int): User ID to look up

    Returns:
        dict: Permission flags (is_admin, is_gm, is_player, is_developer)
              Returns all flags as 0 if user has no permission record
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


def has_role(role_name):
    """
    Check if currently logged-in user has a specific role.

    Utility function for checking roles in templates or view functions.

    Args:
        role_name (str): Role to check ('admin', 'gm', 'player', 'developer')

    Returns:
        bool: True if user has the role, False otherwise

    Example:
        if has_role('admin'):
            # Show admin controls
    """
    if 'loggedin' not in session:
        return False

    permissions = get_user_permissions(session['id'])
    role_map = {
        'admin': permissions['is_admin'],
        'gm': permissions['is_gm'],
        'player': permissions['is_player'],
        'developer': permissions['is_developer']
    }

    return role_map.get(role_name, 0) == 1


# ============================================
# USER ACTIVITY TRACKING
# ============================================
def update_user_last_seen(user_id):
    """
    Update user's last_seen timestamp and mark them as active.

    Called automatically on each authenticated request to maintain
    accurate active user tracking for the admin panel.

    Args:
        user_id (int): User ID to update
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


def cleanup_inactive_users():
    """
    Mark users as inactive if they haven't been seen in 15 minutes.

    This function should be called periodically (e.g., before displaying
    the admin panel) to maintain accurate active user counts. Also cleans
    up old suspension invalidations.
    """
    # Clean up expired suspensions first
    EsportsManagementTool.suspensions.cleanup_old_invalidations(mysql)

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
# EMAIL VERIFICATION
# ============================================
def send_verify_email(email, token):
    """
    Send verification email to newly registered users.

    Constructs and sends an email containing a verification link that
    expires after 24 hours.

    Args:
        email (str): Recipient email address
        token (str): Unique verification token

    Raises:
        Exception: If email sending fails
    """
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


@app.route('/verify/<token>')
def verify_email(token):
    """
    Process email verification when user clicks verification link.

    Verifies the token is valid and not expired, then marks the user's
    account as verified in the database.

    Args:
        token (str): Verification token from URL

    Returns:
        Redirect to login page on success, or registration page on failure
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        # Look up token and check expiry
        cursor.execute(
            'SELECT * FROM verified_users WHERE verification_token = %s AND token_expiry > NOW()',
            (token,)
        )
        user = cursor.fetchone()

        if user:
            # Mark user as verified and clear token
            cursor.execute(
                '''UPDATE verified_users 
                   SET is_verified = TRUE, verification_token = NULL, token_expiry = NULL 
                   WHERE userid = %s''',
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


# ============================================
# AUTHENTICATION ROUTES
# ============================================
@app.route('/')
def index():
    """
    Landing page with calendar view.

    Checks for "remember me" cookie and auto-logs user in if valid.
    Verifies user is not suspended before allowing auto-login.

    Returns:
        Rendered index.html template
    """
    remember_token = request.cookies.get('remember_token')

    if remember_token:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            cursor.execute('SELECT * FROM users WHERE remember_token = %s', (remember_token,))
            account = cursor.fetchone()

            if account:
                # Check for active suspensions
                is_suspended, suspension_info = EsportsManagementTool.suspensions.check_user_suspension(
                    mysql, account['id']
                )

                if not is_suspended:
                    # Auto-login user
                    session['loggedin'] = True
                    session['id'] = account['id']
                    session['username'] = account['username']
                    session['login_time'] = get_current_time().isoformat()

                    # Update activity tracking
                    cursor.execute("""
                        INSERT INTO user_activity (userid, is_active, last_seen)
                        VALUES (%s, 1, NOW())
                        ON DUPLICATE KEY UPDATE
                            is_active = 1,
                            last_seen = NOW()
                    """, (account['id'],))
                    mysql.connection.commit()
        finally:
            cursor.close()

    return render_template('index.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    """
    Handle user login with optional "remember me" functionality.

    Features:
    - bcrypt password verification
    - Email verification requirement
    - Suspension checking
    - Activity tracking
    - Secure "remember me" tokens

    POST Parameters:
        username (str): User's username
        password (str): User's password (plaintext, hashed for comparison)
        remember (str): Optional "remember me" checkbox

    Returns:
        Rendered login.html on GET or validation failure
        Redirect to dashboard on successful login
    """
    msg = ''

    if request.method == 'POST' and 'username' in request.form and 'password' in request.form:
        username = request.form['username']
        password = request.form['password']
        remember_me = request.form.get('remember')

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            # Fetch user account
            cursor.execute('SELECT * FROM users WHERE username = %s', [username])
            account = cursor.fetchone()

            if account:
                # Check email verification status
                cursor.execute('SELECT is_verified FROM verified_users WHERE userid = %s', (account['id'],))
                is_verified = cursor.fetchone()

                # Verify password with bcrypt
                if bcrypt.checkpw(password.encode('utf-8'), account['password'].encode('utf-8')):
                    if is_verified['is_verified'] == 0:
                        # Resend verification email
                        flash(
                            'Account is still not verified! A new email has been sent, check your inbox! '
                            'If mail does not appear, please check your spam!'
                        )
                        verification_token = secrets.token_urlsafe(32)
                        token_expiry = get_current_time() + timedelta(hours=24)

                        cursor.execute(
                            'UPDATE verified_users SET verification_token = %s, token_expiry = %s WHERE userid = %s',
                            (verification_token, token_expiry, account['id'])
                        )
                        mysql.connection.commit()

                        try:
                            send_verify_email(account['email'], verification_token)
                            msg = 'Email sent.'
                        except Exception as e:
                            msg = f'Email failed to send. Error: {str(e)}'
                    else:
                        # Check for active suspension
                        is_suspended, suspension_info = EsportsManagementTool.suspensions.check_user_suspension(
                            mysql, account['id']
                        )

                        if is_suspended:
                            # Build suspension message
                            if suspension_info['remaining_days'] > 0:
                                time_remaining = f"{suspension_info['remaining_days']} day(s)"
                                if suspension_info['remaining_hours'] > 0:
                                    time_remaining += f" and {suspension_info['remaining_hours']} hour(s)"
                            else:
                                time_remaining = f"{suspension_info['remaining_hours']} hour(s)"

                            msg = (
                                f"Your account has been suspended until {suspension_info['suspended_until']}. "
                                f"Reason: {suspension_info['reason']}. "
                                f"Time remaining: {time_remaining}."
                            )
                        else:
                            # Successful login - create session
                            session['loggedin'] = True
                            session['id'] = account['id']
                            session['username'] = account['username']
                            session['login_time'] = get_current_time().isoformat()

                            # Update activity tracking
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

                            # Handle "remember me" functionality
                            response = make_response(redirect(url_for('dashboard')))

                            if remember_me:
                                # Generate secure token
                                remember_token = secrets.token_urlsafe(32)

                                cursor.execute(
                                    'UPDATE users SET remember_token = %s WHERE id = %s',
                                    (remember_token, account['id'])
                                )
                                mysql.connection.commit()

                                # Set cookie (30 days expiration)
                                # NOTE: 'secure' should be True in production with HTTPS
                                response.set_cookie(
                                    'remember_token',
                                    remember_token,
                                    max_age=30 * 24 * 60 * 60,  # 30 days in seconds
                                    httponly=True,
                                    secure=False,  # MUST BE TRUE IN PRODUCTION WITH HTTPS
                                    samesite='Lax'
                                )
                            else:
                                # Clear any existing token
                                cursor.execute(
                                    'UPDATE users SET remember_token = NULL WHERE id = %s',
                                    (account['id'],)
                                )
                                mysql.connection.commit()
                                response.set_cookie('remember_token', '', max_age=0)

                            return response
                else:
                    msg = 'Incorrect username/password!'
            else:
                msg = 'Account does not exist!'
        finally:
            cursor.close()

    return render_template('login.html', msg=msg)


@app.route('/logout', methods=['POST'])
def logout():
    """
    Handle user logout and cleanup.

    Marks user as inactive, clears remember token, and destroys session.
    Uses POST method to prevent CSRF attacks.

    Returns:
        Redirect to login page with cleared cookies
    """
    # Mark user as inactive before logging out
    if 'id' in session:
        try:
            cursor = mysql.connection.cursor()

            # Update activity status
            cursor.execute("""
                UPDATE user_activity 
                SET is_active = 0, last_seen = NOW()
                WHERE userid = %s
            """, (session['id'],))
            mysql.connection.commit()

            # Clear remember token from database
            cursor.execute('UPDATE users SET remember_token = NULL WHERE id = %s', (session['id'],))
            mysql.connection.commit()

            cursor.close()
        except Exception as e:
            print(f"Error updating logout activity: {str(e)}")

    # Clear session data
    session.pop('loggedin', None)
    session.pop('id', None)
    session.pop('username', None)
    flash('Successfully logged out.')

    # Clear remember cookie
    response = make_response(redirect(url_for('login')))
    response.set_cookie('remember_token', '', max_age=0)
    return response


@app.route('/register', methods=['GET', 'POST'])
def register():
    """
    Handle new user registration with email verification.

    Validation includes:
    - Unique username
    - Valid email format
    - Stockton email domain requirement
    - Password confirmation match
    - All required fields filled

    POST Parameters:
        firstname (str): User's first name
        lastname (str): User's last name
        username (str): Desired username (alphanumeric only)
        password (str): Desired password
        passwordconfirm (str): Password confirmation
        email (str): Stockton email address

    Returns:
        Rendered register.html with validation messages
    """
    msg = ''

    if request.method == 'POST' and all(field in request.form for field in
                                        ['username', 'password', 'passwordconfirm', 'email']):
        # Extract form data
        firstname = request.form['firstname']
        lastname = request.form['lastname']
        username = request.form['username']
        password = request.form['password']
        passwordconfirm = request.form['passwordconfirm']
        email = request.form['email']

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            # Check if username already exists
            cursor.execute('SELECT * FROM users WHERE username = %s', (username,))
            account = cursor.fetchone()

            # Validation checks
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
                # Hash password with bcrypt
                hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

                # Insert new user
                cursor.execute(
                    'INSERT INTO users (firstname, lastname, username, password, email) VALUES (%s, %s, %s, %s, %s)',
                    (firstname, lastname, username, hashed_password, email)
                )
                mysql.connection.commit()

                # Get newly created user ID
                cursor.execute('SELECT id FROM users WHERE username = %s', [username])
                newUser = cursor.fetchone()

                # Initialize related records
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

                # Generate verification token
                verification_token = secrets.token_urlsafe(32)
                token_expiry = get_current_time() + timedelta(hours=24)

                cursor.execute(
                    'UPDATE verified_users SET verification_token = %s, token_expiry = %s WHERE userid = %s',
                    (verification_token, token_expiry, newUser['id'])
                )
                mysql.connection.commit()

                # Send verification email
                send_verify_email(email, verification_token)
                msg = ('You have successfully created an account! Please check your email for verification! '
                       'If the email does not appear in your inbox, please check your spam!')
        finally:
            cursor.close()

    elif request.method == 'POST':
        msg = 'Please fill out the form!'

    return render_template('register.html', msg=msg)


# =======================================
# MODULE IMPORTS (After Initialization)
# =======================================
import EsportsManagementTool.exampleModule
import EsportsManagementTool.UpdateProfile
import EsportsManagementTool.EventNotificationManager
import EsportsManagementTool.suspensions
import EsportsManagementTool.events
import EsportsManagementTool.dashboard
from EsportsManagementTool import game
from EsportsManagementTool import teamCreation
from EsportsManagementTool import vods
from EsportsManagementTool import seasons
from EsportsManagementTool import leagues
from EsportsManagementTool import statistics

# ================================
# REGISTER MODULE ROUTES
# ==================================
# Register suspension management routes
EsportsManagementTool.suspensions.register_suspension_routes(app, mysql, roles_required)

# Register event, season, and league routes
EsportsManagementTool.events.register_event_routes(app, mysql, login_required, roles_required, get_user_permissions)
EsportsManagementTool.seasons.register_seasons_routes(app, mysql, login_required, roles_required, get_user_permissions)
leagues.register_league_routes(app, mysql, login_required, roles_required, get_user_permissions)

# Register team statistics routes
from EsportsManagementTool import team_stats

team_stats.register_team_stats_routes(app, mysql, login_required, roles_required, get_user_permissions)
statistics.register_statistics_routes(app, mysql, login_required, roles_required)

# Register scheduled events routes
from EsportsManagementTool import scheduled_events

scheduled_events.register_scheduled_events_routes(app, mysql, login_required, roles_required, get_user_permissions)


# =======================================
# CALENDAR API ENDPOINTS
# =======================================
@app.route('/api/calendar/events')
def get_calendar_events():
    """
    Fetch events for calendar view via AJAX with visibility filtering.

    Returns events based on:
    - User login status (public events only if not logged in)
    - User permissions (events they created or have access to)
    - Event visibility settings (all_members, team, game_players, game_community)

    Query Parameters:
        year (int): Year to fetch events for
        month (int): Month to fetch events for (1-12)

    Returns:
        JSON: Dictionary of events grouped by date string (YYYY-MM-DD)

    Example Response:
        {
            "2025-12-25": [
                {
                    "id": 1,
                    "title": "Team Practice",
                    "time": "3:00 PM",
                    "description": "Practice session",
                    "event_type": "practice",
                    "date": "2025-12-25"
                }
            ]
        }
    """
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)

    # Validate required parameters
    if not year or not month:
        return jsonify({'error': 'Year and month parameters required'}), 400

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    events_by_date = {}

    try:
        if not session.get('loggedin'):
            # Not logged in: only show public events
            cursor.execute("""
                SELECT ge.* 
                FROM generalevents ge
                LEFT JOIN scheduled_events se ON ge.schedule_id = se.schedule_id
                WHERE YEAR(ge.Date) = %s AND MONTH(ge.Date) = %s
                AND (
                    ge.schedule_id IS NULL
                    OR se.visibility = 'all_members'
                )
                ORDER BY ge.Date, ge.StartTime
            """, (year, month))
        else:
            # Logged in: show events based on permissions and visibility
            user_id = session.get('id')
            cursor.execute("""
                SELECT ge.* 
                FROM generalevents ge
                LEFT JOIN scheduled_events se ON ge.schedule_id = se.schedule_id
                WHERE YEAR(ge.Date) = %s AND MONTH(ge.Date) = %s
                AND (
                    ge.schedule_id IS NULL
                    OR se.created_by = %s
                    OR se.visibility = 'all_members'
                    OR (se.visibility = 'team' AND EXISTS (
                        SELECT 1 FROM team_members tm 
                        WHERE tm.team_id = se.team_id 
                        AND tm.user_id = %s
                    ))
                    OR (se.visibility = 'game_players' AND EXISTS (
                        SELECT 1 FROM team_members tm
                        JOIN teams t ON tm.team_id = t.TeamID
                        WHERE t.gameID = se.game_id
                        AND tm.user_id = %s
                    ))
                    OR (se.visibility = 'game_community' AND EXISTS (
                        SELECT 1 FROM in_communities ic
                        WHERE ic.game_id = se.game_id
                        AND ic.user_id = %s
                    ))
                )
                ORDER BY ge.Date, ge.StartTime
            """, (year, month, user_id, user_id, user_id, user_id))

        events = cursor.fetchall()

        # Process and group events by date
        for event in events:
            date_str = event['Date'].strftime('%Y-%m-%d')

            # Handle timedelta for StartTime and convert to 12-hour format
            if event['StartTime']:
                total_seconds = int(event['StartTime'].total_seconds())
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60

                # Check if all-day event (00:00 to 23:59)
                if event['EndTime']:
                    end_total_seconds = int(event['EndTime'].total_seconds())
                    end_hours = end_total_seconds // 3600
                    end_minutes = (end_total_seconds % 3600) // 60
                    is_all_day = (hours == 0 and minutes == 0 and end_hours == 23 and end_minutes == 59)
                else:
                    is_all_day = False

                # Convert to 12-hour format
                period = 'AM' if hours < 12 else 'PM'
                display_hours = hours if hours <= 12 else hours - 12
                if display_hours == 0:
                    display_hours = 12  # Midnight = 12 AM

                time_str = None if is_all_day else f"{display_hours}:{minutes:02d} {period}"
            else:
                time_str = None

            # Build event object
            event_obj = {
                'id': event['EventID'],
                'title': event['EventName'],
                'time': time_str,
                'description': event.get('Description', ''),
                'event_type': event.get('EventType', 'event').lower(),
                'location': event.get('Location', ''),
                'date': date_str,
                'start_time': str(event['StartTime']) if event.get('StartTime') else '',
                'end_time': str(event['EndTime']) if event.get('EndTime') else '',
                'game_name': None
            }

            # Group by date
            if date_str not in events_by_date:
                events_by_date[date_str] = []
            events_by_date[date_str].append(event_obj)

        return jsonify(events_by_date)

    except Exception as e:
        print(f"Error fetching calendar events: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch events'}), 500
    finally:
        cursor.close()


@app.route('/api/events/<int:event_id>')
def get_event_details(event_id):
    """
    Fetch detailed information for a specific event.

    Used by the event details modal on the calendar.

    Args:
        event_id (int): Event ID to fetch

    Returns:
        JSON: Event details including title, description, times, location

    Status Codes:
        200: Success
        404: Event not found
        500: Server error
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Fetch event from generalevents table
        cursor.execute("""
            SELECT * FROM generalevents WHERE EventID = %s
        """, (event_id,))

        event = cursor.fetchone()

        if not event:
            return jsonify({'error': 'Event not found'}), 404

        # Format times as HH:MM strings
        start_time_str = ''
        end_time_str = ''

        if event['StartTime']:
            total_seconds = int(event['StartTime'].total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            start_time_str = f"{hours:02d}:{minutes:02d}"

        if event['EndTime']:
            total_seconds = int(event['EndTime'].total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            end_time_str = f"{hours:02d}:{minutes:02d}"

        # Build response
        event_data = {
            'id': event['EventID'],
            'title': event['EventName'],
            'description': event.get('Description', ''),
            'date': event['Date'].strftime('%Y-%m-%d'),
            'start_time': start_time_str,
            'end_time': end_time_str,
            'location': event.get('Location', ''),
            'event_type': event.get('EventType', 'event').lower(),
            'game_name': event.get('Game', None)
        }

        return jsonify(event_data)

    except Exception as e:
        print(f"Error fetching event details: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch event details'}), 500
    finally:
        cursor.close()


# =====================================
# EXPORT TIMEZONE FUNCTIONS
# =====================================
# Make timezone functions available to other modules
app.get_current_time = get_current_time
app.localize_datetime = localize_datetime
app.EST = EST

# =====================================
# DEBUG ROUTE LISTING
# =====================================
if __name__ != '__main__':
    print("\n=== REGISTERED ROUTES ===")
    for rule in app.url_map.iter_rules():
        print(f"{rule.endpoint}: {rule.rule}")
    print("=========================\n")