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
import pytz


app = Flask(__name__)

# =========================================
# IMPORTS THAT DON'T RELY ON INITIALIZATION
# =========================================
import EsportsManagementTool.exampleModule
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
app.config['YOUTUBE_API_KEY'] = os.environ.get('YOUTUBE_API_KEY')

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

# =========================================
# TIMEZONE CONFIGURATION
# =========================================
EST = pytz.timezone('America/New_York')  # EST/EDT timezone

def get_current_time():
    """Get current time in EST"""
    return datetime.now(EST)

def localize_datetime(dt):
    """Convert naive datetime to EST"""
    if dt.tzinfo is None:
        return EST.localize(dt)
    return dt.astimezone(EST)

##Set timezone, accounting for DST dynamically.
@app.before_request
def set_mysql_timezone():
    """Set MySQL session timezone to match EST/EDT dynamically"""
    if mysql.connection:
        cursor = mysql.connection.cursor()
        # Get current UTC offset for America/New_York (handles DST automatically)
        est_now = datetime.now(EST)
        offset_seconds = est_now.utcoffset().total_seconds()
        offset_hours = int(offset_seconds / 3600)
        offset_minutes = int((offset_seconds % 3600) / 60)

        offset_str = f"{offset_hours:+03d}:{offset_minutes:02d}"
        cursor.execute(f"SET time_zone = '{offset_str}';")
        cursor.close()

##Template to display times.
@app.template_filter('format_datetime')
def format_datetime_filter(dt, format='%B %d, %Y at %I:%M %p'):
    """Format datetime in EST for templates"""
    if dt is None:
        return 'N/A'
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt)
        except:
            return dt
    if dt.tzinfo is None:
        dt = EST.localize(dt)
    return dt.strftime(format) + ' EST'

@app.template_filter('to_est')
def to_est_filter(dt):
    """Convert datetime to EST"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return EST.localize(dt)
    return dt.astimezone(EST)

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
                        token_expiry = get_current_time() + timedelta(hours=24)

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
                        is_suspended, suspension_info = EsportsManagementTool.suspensions.check_user_suspension(mysql, account['id'])

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
                            session['login_time'] = get_current_time().isoformat()

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
                token_expiry = get_current_time() + timedelta(hours=24)

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

# =======================================
# IMPORTS THAT RELY ON INITIALIZATION
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

# ================================
# REGISTER SUSPENSION ROUTES (MOVED HERE)
# ==================================
EsportsManagementTool.suspensions.register_suspension_routes(app, mysql, roles_required)

# =====================================
# PULLS EVENT METHODS
# =====================================
EsportsManagementTool.events.register_event_routes(app, mysql, login_required, roles_required, get_user_permissions)

# =====================================
# REGISTER SCHEDULED EVENTS ROUTES
# =====================================
from EsportsManagementTool import scheduled_events
scheduled_events.register_scheduled_events_routes(app, mysql, login_required, roles_required, get_user_permissions)

# =====================================
# REGISTER TEAM STATISTICS ROUTES
# =====================================
from EsportsManagementTool import team_stats
team_stats.register_team_stats_routes(app, mysql, login_required, roles_required, get_user_permissions)

# =====================================
# EXPORT TIMEZONE FUNCTIONS
# =====================================
app.get_current_time = get_current_time
app.localize_datetime = localize_datetime
app.EST = EST

# This is used for debugging, It will show the app routes that are registered.
if __name__ != '__main__':
    print("\n=== REGISTERED ROUTES ===")
    for rule in app.url_map.iter_rules():
        print(f"{rule.endpoint}: {rule.rule}")
    print("=========================\n")
