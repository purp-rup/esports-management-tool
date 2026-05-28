"""
Esports Management Tool Automatic Email Handler/Email Testing
This file verifies and sends all automatic emails & can test emails via Mailpit.
"""

from EsportsManagementTool import app, mail
from flask import url_for
from flask_mail import Message


# =========================================
# EMAIL SENDING FUNCTIONS
# =========================================

# Account Verification Email
def send_verify_email(email: str, token: str) -> None:
    """
    Send verification email to newly registered users.
    Constructs and sends an email containing a verification link that
    expires after 24 hours.
    """
    verify_url = url_for('verify_email', token=token, _external=True)
    msg = Message('Verify Your Stockton University Email Account', recipients=[email])
    msg.body = f'''Hello,
Please click the link below to verify your Stockton Esports Management Tool account:

{verify_url}

This link will expire after 24 hours.

If you did not create this account, please ignore this email.

- EsMT Team.
'''
    mail.send(msg)

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
            send_verify_email("test@go.stockton.edu", "test-token")
            return "Verification email sent - check localhost:8025"

