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
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__)

# Module imports
import EsportsManagementTool.exampleModule
import EsportsManagementTool.EventNotificationManager

# Change this to your secret key (can be anything, it's for extra protection)
app.secret_key = 'your secret key'

# Enter your database connection details below
app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD')
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB')

app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_USERNAME')

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

# For production, force HTTPS
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'


# ============================================
# ROLE-BASED SECURITY SYSTEM
# ============================================
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

def cleanup_inactive_users():
    """
    Mark users as inactive if they haven't been seen in 15 minutes
    This can be called periodically or before displaying the admin panel
    """
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
# ROUTES
# ============================================

# Home/Landing Page
@app.route('/')
def index():
    return render_template('index.html')


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


# API route to get event details for the Event Details Modal within dashboard.html
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
                (user['id'],)
            )
            mysql.connection.commit()
            flash('Email is successfully verified, welcome to Stockton Esports! You can now log in.', 'success')
            return redirect(url_for('login'))
        else:
            flash('ERROR: Verification link is invalid/expired.', 'error')
            return redirect(url_for('register'))
    finally:
        cursor.close()


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
                        flash('Account is still not verified! A new email has been sent, check your inbox!')
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
                        session['loggedin'] = True
                        session['id'] = account['id']
                        session['username'] = account['username']

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
                msg = 'You have successfully created an account! Please check your email for verification!'
        finally:
            cursor.close()

    elif request.method == 'POST':
        msg = 'Please fill out the form!'

    return render_template('register.html', msg=msg)


# App route to get to event registration.
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

@app.route('/admin/toggle-user-activity', methods=['POST'])
@roles_required('admin')
def toggle_user_activity():
    """
    Toggle user active/inactive status
    """
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        is_active = data.get('is_active')  # True or False

        if user_id is None or is_active is None:
            return jsonify({
                'success': False,
                'message': 'Missing required fields'
            }), 400

        # Prevent admin from deactivating themselves
        if user_id == session['id'] and not is_active:
            return jsonify({
                'success': False,
                'message': 'You cannot deactivate your own account'
            }), 403

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get username
            cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()

            if not user:
                return jsonify({
                    'success': False,
                    'message': 'User not found'
                }), 404

            # Update activity status
            cursor.execute("""
                UPDATE user_activity 
                SET is_active = %s 
                WHERE userid = %s
            """, (1 if is_active else 0, user_id))
            mysql.connection.commit()

            status_text = 'activated' if is_active else 'deactivated'
            return jsonify({
                'success': True,
                'message': f'User @{user["username"]} has been {status_text}'
            }), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error toggling user activity: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Server error occurred'
        }), 500

import EsportsManagementTool.dashboard
from EsportsManagementTool import game

# This is used for debugging, It will show the app routes that are registered.
if __name__ != '__main__':
    print("\n=== REGISTERED ROUTES ===")
    for rule in app.url_map.iter_rules():
        print(f"{rule.endpoint}: {rule.rule}")
    print("=========================\n")