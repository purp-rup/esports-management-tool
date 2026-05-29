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
def send_verify_email(email: str, token: str, username: str) -> None:
    """
    Send verification email to newly registered users.
    Constructs and sends an email containing a verification link that
    expires after 24 hours.
    """
    verify_url = url_for('verify_email', token=token, _external=True)
    msg = Message('Verify Your Stockton University Email Account', recipients=[email])
    msg.html = f'''
        <div style="background-color: #f4f4f4; width: 100%; margin: 0; padding: 10px 0;">
            <div style="background-color: #ffffff; max-width: 600px; margin: 0 auto;">
                <div style="margin: 0; padding: 0;">
                    <img src="https://res.cloudinary.com/dltfdjwzs/image/upload/v1780009089/01235ad8-2454-4a46-98cd-163de62e7fa0.png" 
                         style="width: 100%; display: block; margin: 0; padding: 0;">
                </div>
                <div style="padding: 10px 10px 30px 30px;">
                    <br>
                    <p style="text-align: left; font-weight: bold;">Hello, {username}!</p>
                    <div style="padding-left: 15px;">
                        <p style="font-size: 15px;">Welcome to Stockton Esports! We're glad to have you.</p>
                        <p style="font-size: 15px;">Please click the button below to verify your Stockton Esports Management Tool account:</p>
                        <a href="{verify_url}" 
                           style="display: inline-block; padding: 12px 24px; background-color: #6a0dad; color: #ffffff; 
                                  text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 15px;">
                            Verify My Account
                        </a>
                        <br><br>
                        <p>This link will expire after 24 hours.</p>
                        <p>If you did not create this account, please ignore this email.</p>
                    </div>
                    <br>
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


# =========================================
# UNIVERSAL EMAIL FOOTER
# =========================================
def get_email_footer() -> str:
    return f'''
        <div style="background-color: #1a1a2e; padding: 15px 20px 8px 20px; text-align: center; font-size: 12px; color: #aaaaaa;">
            <a href="https://discord.gg/AGkHpVYfGh" 
               style="color: #5865F2; font-weight: bold; text-decoration: none; 
                      border: 2px solid #5865F2; padding: 4px 10px; border-radius: 4px;">
                Join us on Discord!
            </a>
            <hr style="border: 1px solid #2a2a4a; margin: 14px 0 8px 0;">
            <p style="margin: 0;">© {datetime.now().year} Stockton Esports Management Tool. All rights reserved.</p>
        </div>
    '''


# =========================================
# ARTIFICIAL TESTING TRIGGERS
# =========================================
# 1. Make sure MAILING_MODE (within init) is set to "testing".
# 2. Run Mailpit within your local terminal.
# 3. Type http://localhost:5000/{route} into your browser to send the email.
# 4. Open http://localhost:8025 to view the Mailpit inbox.

def register_test_routes(app):
    if app.config.get('MAIL_SERVER') == 'localhost':

        @app.route('/test-email/verify')
        def test_verification_email():
            send_verify_email("test@go.stockton.edu", "test-token", "user")
            return "Verification email sent - check localhost:8025"
