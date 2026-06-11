"""
Esports Management Tool Automatic Email Handler/Email Testing
This file verifies and sends all automatic emails & can test emails via Mailpit.
"""

from EsportsManagementTool import app, mail
from flask import url_for, redirect, flash
from flask_mail import Message
from datetime import datetime
import MySQLdb.cursors


# =========================================
# EMAIL SENDING FUNCTIONS
# =========================================

# Account Verification Email
def send_verify_email(email: str, token: str, user_firstname: str) -> None:
    """
    Send verification email to newly registered users.
    Constructs and sends an email containing a verification link that
    expires after 24 hours.
    """
    verify_url = url_for('verify_email', token=token, _external=True)
    msg = Message('Verify Your Stockton University Email Account', recipients=[email])
    msg.html = f'''
        <div style="background-color: #f4f4f4; width: 100%; margin: 0; padding: 10px 0; font-family: 'Inter', sans-serif;">
            <div style="background-color: #ffffff; max-width: 600px; margin: 0 auto;">
                <div style="margin: 0; padding: 0;">
                    <img src="https://res.cloudinary.com/dltfdjwzs/image/upload/v1780009089/01235ad8-2454-4a46-98cd-163de62e7fa0.png" 
                         style="width: 100%; display: block; margin: 0; padding: 0;">
                </div>
                <div style="padding: 8px 10px 20px 30px;">
                    <br>
                    <p style="text-align: left; font-weight: bold;">Hello, {user_firstname}!</p>
                    <div style="padding-left: 15px;">
                        <p style="font-size: 15px;">Welcome to Stockton Esports! We're glad to have you.</p>
                        <p style="font-size: 15px;">Please click the button below to verify your Stockton Esports Management Tool account:</p>
                        <a href="{verify_url}" 
                           style="display: inline-block; padding: 12px 24px; background-color: #6a0dad; color: #ffffff; 
                                  text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 15px;">
                            Verify My Account
                        </a>
                        <br><br>
                        <p style="font-size: 15px;">This link will expire after 24 hours.</p>
                        <p style="font-size: 15px;">If you did not create this account, please ignore this email.</p>
                    </div>
                    <p style="text-align: left;">- EsMT Team</p>
                </div>
                {get_email_footer()}
            </div>
        </div>
    '''
    mail.send(msg)

# Verifies token for email verification
def register_verification_routes(app, mysql):
    @app.route('/verify/<token>')
    def verify_email(token: str):
        """
        Process email verification when user clicks verification link.
        Verifies the token is valid and not expired, then marks the user's
        account as verified in the database.

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

# Event Notification Email
def send_event_notification(user_email, user_firstname, event_type, start_time, event_details):
    """Send email notification to user about upcoming event."""
    try:
        msg = Message(f"Reminder: Upcoming {event_type}", recipients=[user_email])
        msg.html = f'''
                <div style="background-color: #f4f4f4; width: 100%; margin: 0; padding: 10px 0; font-family: 'Inter', sans-serif;">
                    <div style="background-color: #ffffff; max-width: 600px; margin: 0 auto;">
                        <div style="margin: 0; padding: 0;">
                            <img src="https://res.cloudinary.com/dltfdjwzs/image/upload/v1780009089/01235ad8-2454-4a46-98cd-163de62e7fa0.png"
                                 style="width: 100%; display: block; margin: 0; padding: 0;">
                        </div>
                        <div style="padding: 8px 10px 20px 30px;">
                            <br>
                            <p style="text-align: left; font-weight: bold;">Hello, {user_firstname}!</p>
                            <div style="padding-left: 15px;">
                                <p style="font-size: 15px;">This is a reminder about your <strong>upcoming {event_type.lower()}:</strong></p>
                                <p style="font-size: 18px;">🎮 {event_details['EventName']} 🎮<br>
                                <p style="font-size: 15px;">
                                    📍 {event_details['location']}<br>
                                    📅 {event_details['date'].strftime('%B %d, %Y')}<br>
                                    🕑 {start_time.strftime('%I:%M %p')}
                                </p>
                                <p style="font-size: 15px;">{event_details.get('description', 'No additional details')}</p>
                                <p style="font-size: 15px;">We look forward to seeing you there!</p>
                            </div>
                            <p style="text-align: left;">- EsMT Team</p>
                        </div>
                        {get_email_footer()}
                    </div>
                </div>
            '''
        mail.send(msg)

        return True
    except Exception as e:
        print(f"Error sending email to {user_email}: {e}")
        return False

# GM Reminder Email
def send_reminder_email(user_email, user_firstname, season_name, game_title, pending_count, days_until_end):
    """Send GMs reminders to update their tournament results."""
    try:
        urgency = "URGENT " if days_until_end <= 3 else ""

        subject = f"{urgency}Action Required: Record Tournament Results for {game_title}"

        msg = Message(subject, recipients=[user_email])
        msg.html = f'''
                <div style="background-color: #f4f4f4; width: 100%; margin: 0; padding: 10px 0; font-family: 'Inter', sans-serif;">
                    <div style="background-color: #ffffff; max-width: 600px; margin: 0 auto;">
                        <div style="margin: 0; padding: 0;">
                            <img src="https://res.cloudinary.com/dltfdjwzs/image/upload/v1780009089/01235ad8-2454-4a46-98cd-163de62e7fa0.png"
                                 style="width: 100%; display: block; margin: 0; padding: 0;">
                        </div>
                        <div style="padding: 8px 10px 20px 30px;">
                            <br>
                            <p style="text-align: left; font-weight: bold;">Hello, {user_firstname}!</p>
                            <div style="padding-left: 15px;">
                                <p style="font-size: 15px;">This is a reminder to record tournament results for <strong>{game_title}</strong> in the <strong>{season_name}</strong> season.</p>
                                <p style="font-size: 15px;">
                                    <strong>Season End:</strong> {days_until_end} day(s) remaining<br>
                                    <strong>Pending Results:</strong> {pending_count} team(s) need tournament placement recorded.
                                </p>
                                <p style="font-size: 15px;">Please log into the Stockton Esports Management Tool and click the <strong>"Record Tournament Results"</strong> button in your dashboard to get started.</p>
                                <p style="font-size: 15px;"><strong>Tournament placement options:</strong><br>
                                    Winner (1st place)<br>
                                    Finals (2nd place)<br>
                                    Semifinals (3rd–4th place)<br>
                                    Quarterfinals (5th–8th place)<br>
                                    Playoffs (made playoffs)<br>
                                    Did Not Qualify (DNQ)
                                </p>
                                <p style="font-size: 15px;">Thank you for your prompt attention to this matter.</p>
                            </div>
                            <p style="text-align: left;">- EsMT Team</p>
                        </div>
                        {get_email_footer()}
                    </div>
                </div>
            '''

        mail.send(msg)
        return True

    except Exception as e:
        print(f"Error sending reminder email to {user_email}: {str(e)}")
        return False

# Forgot Password Email
def send_password_reset_email(email: str, token: str, user_firstname: str) -> bool:
    """
    Send a password reset link to the user's registered email.
    The link expires after 1 hour.
    """
    try:
        reset_url = url_for('reset_password', token=token, _external=True)
        msg = Message('Reset Your Stockton Esports Password', recipients=[email])
        msg.html = f'''
            <div style="background-color: #f4f4f4; width: 100%; margin: 0; padding: 10px 0; font-family: 'Inter', sans-serif;">
                <div style="background-color: #ffffff; max-width: 600px; margin: 0 auto;">
                    <div style="margin: 0; padding: 0;">
                        <img src="https://res.cloudinary.com/dltfdjwzs/image/upload/v1780009089/01235ad8-2454-4a46-98cd-163de62e7fa0.png"
                             style="width: 100%; display: block; margin: 0; padding: 0;">
                    </div>
                    <div style="padding: 8px 10px 20px 30px;">
                        <br>
                        <p style="text-align: left; font-weight: bold;">Hello, {user_firstname}!</p>
                        <div style="padding-left: 15px;">
                            <p style="font-size: 15px;">We received a request to reset your Stockton Esports Management Tool password.</p>
                            <p style="font-size: 15px;">Click the button below to choose a new password:</p>
                            <a href="{reset_url}"
                               style="display: inline-block; padding: 12px 24px; background-color: #6a0dad; color: #ffffff;
                                      text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 15px;">
                                Reset My Password
                            </a>
                            <br><br>
                            <p style="font-size: 15px;">This link will expire in <strong>1 hour</strong>.</p>
                            <p style="font-size: 15px;">If you did not request a password reset, you can safely ignore this email.</p>
                        </div>
                        <p style="text-align: left;">- EsMT Team</p>
                    </div>
                    {get_email_footer()}
                </div>
            </div>
        '''
        mail.send(msg)
        return True
    except Exception as e:
        print(f"Error sending password reset email to {email}: {e}")
        return False


# =========================================
# UNIVERSAL EMAIL FOOTER
# =========================================
def get_email_footer() -> str:
    return f'''
        <div style="background-color: #1a1a2e; padding: 15px 20px 8px 20px; text-align: center; font-size: 12px;
        color: #aaaaaa; font-family: 'Inter', sans-serif;">
            <a href="https://discord.gg/AGkHpVYfGh" 
               style="color: #5865F2; font-weight: bold; text-decoration: none; 
                      border: 2px solid #5865F2; padding: 4px 10px; border-radius: 4px;">
                Join us on Discord!
            </a>
            <br><br>
            <p style="margin: 0 0 8px 0;">Have a question? Contact <strong>seiberlh@go.stockton.edu</strong> for assistance!</p>
            <p style="margin: 0;">©{datetime.now().year} Stockton Esports Management Tool. All rights reserved.</p>
        </div>
    '''


# =========================================
# ARTIFICIAL TESTING TRIGGERS
# =========================================
# 1. Make sure MAILING_MODE (within init) is set to "testing".
# 2. Run Mailpit within your local terminal.
# 3. Type http://localhost:5000{route} into your browser to send the email.
# 4. Open http://localhost:8025 to view the Mailpit inbox.

def register_test_routes(app):
    if app.config.get('MAIL_SERVER') == 'localhost':

        @app.route('/test-email/verify')
        def test_verification_email():
            send_verify_email("test@go.stockton.edu", "test-token", "testfirstname")
            return "Verification email sent - check localhost:8025"

        @app.route('/test-email/event-notification')
        def test_event_notification_email():
            from datetime import date, time
            send_event_notification("test@go.stockton.edu","testfirstname","Match", datetime.now(),
                {
                    'EventName': 'Test Event Name',
                    'date': date.today(),
                    'location': 'Esports Lab',
                    'description': 'description description description description description description description description'
                }
            )
            return "Event notification email sent - check localhost:8025"

        @app.route('/test-email/gm-reminder')
        def test_reminder_email():
            send_reminder_email(
                "test@go.stockton.edu",
                "testfirstname",
                "Fall 2026",
                "Fortnite Duos",
                1,
                2
            )
            return "GM reminder email sent - check localhost:8025"

        @app.route('/test-email/password-reset')
        def test_password_reset_email():
            send_password_reset_email("test@go.stockton.edu", "test-token", "testfirstname")
            return "Password reset email sent - check localhost:8025"
