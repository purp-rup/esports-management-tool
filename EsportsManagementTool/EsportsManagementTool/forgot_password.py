"""
Esports Management Tool Forgot Password Handler
Handles all routing, token generation, DB operations, and password reset logic
for the forgot password feature.
"""

from flask import request, redirect, url_for, flash, render_template
from datetime import datetime, timedelta
from EsportsManagementTool.email_manager import send_password_reset_email
import MySQLdb.cursors
import secrets
import bcrypt


# =========================================
# FORGOT PASSWORD ROUTE REGISTRATION
# =========================================
def register_forgot_password_routes(app, mysql):

    @app.route('/forgot-password', methods=['POST'])
    def forgot_password():
        """
        Receives the email submitted from the forgot password modal on login.html.
        Looks up the account, generates a secure token, and inserts it into the
        user_password_reset table. Sends the reset email if the account exists.
        """
        email = request.form.get('email', '').strip().lower()
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Look up a verified account matching the submitted email
            cursor.execute(
                '''SELECT u.id, u.firstname, u.email
                   FROM users u
                   JOIN verified_users vu ON u.id = vu.userid
                   WHERE u.email = %s AND vu.is_verified = TRUE''',
                (email,)
            )
            user = cursor.fetchone()

            if user:
                token = secrets.token_urlsafe(32) # Produces a 43 character string
                expiry = datetime.now() + timedelta(hours=1)

                # If a reset token already exists for this user, replace it
                cursor.execute(
                    'SELECT userid FROM user_password_reset WHERE userid = %s',
                    (user['id'],)
                )
                existing = cursor.fetchone()

                if existing:
                    cursor.execute(
                        '''UPDATE user_password_reset
                           SET reset_token = %s, reset_token_expiry = %s
                           WHERE userid = %s''',
                        (token, expiry, user['id'])
                    )
                else:
                    cursor.execute(
                        '''INSERT INTO user_password_reset (userid, reset_token, reset_token_expiry)
                           VALUES (%s, %s, %s)''',
                        (user['id'], token, expiry)
                    )

                mysql.connection.commit()
                send_password_reset_email(user['email'], token, user['firstname'])

        finally:
            cursor.close()

        # Always flashes a generic message to prevent attacks
        flash('If that email is registered, a reset link has been sent. Please check your inbox.', 'success')
        return redirect(url_for('login'))


    @app.route('/reset-password/<token>', methods=['GET', 'POST'])
    def reset_password(token: str):
        """
        GET  — Validates the token, then renders reset_password.html showing the username.
        POST — Validates the new password, hashes it with bcrypt, updates the users table,
               deletes the token row (one-time use), and redirects to login.

        Returns:
            Redirect to login on invalid/expired token.
            Rendered reset_password.html on GET or failed POST validation.
            Redirect to login on successful password reset.
        """
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Validate token on every visit
            cursor.execute(
                '''SELECT upr.userid, upr.reset_token_expiry, u.username
                   FROM user_password_reset upr
                   JOIN users u ON upr.userid = u.id
                   WHERE upr.reset_token = %s AND upr.reset_token_expiry > NOW()''',
                (token,)
            )
            record = cursor.fetchone()

            if not record:
                flash('This password reset link is invalid or has expired.', 'error')
                return redirect(url_for('login'))

            if request.method == 'POST':
                password = request.form.get('password', '')
                confirm  = request.form.get('confirm_password', '')

                errors = _validate_password(password, confirm)

                if errors:
                    return render_template(
                        'reset_password.html',
                        token=token,
                        username=record['username'],
                        errors=errors
                    )

                hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

                # Update the password on the users table
                cursor.execute(
                    'UPDATE users SET password = %s WHERE id = %s',
                    (hashed, record['userid'])
                )

                # Delete the token row
                cursor.execute(
                    'DELETE FROM user_password_reset WHERE userid = %s',
                    (record['userid'],)
                )
                mysql.connection.commit()

                flash('Your password has been reset! You can now log in.', 'success')
                return redirect(url_for('login'))

            # GET — render the form with the username displayed
            return render_template(
                'reset_password.html',
                token=token,
                username=record['username'],
                errors=[]
            )

        finally:
            cursor.close()


# =========================================
# PASSWORD VALIDATION HELPER
# =========================================
def _validate_password(password: str, confirm: str) -> list[str]:
    """
    Validates a new password against the application's requirements.

    Args:
        password: The new password to validate.
        confirm:  The confirmation entry to check against.

    Returns:
        A list of error strings. Empty list means all checks passed.
    """
    errors = []

    if password != confirm:
        errors.append('Passwords do not match.')
    if len(password) < 8:
        errors.append('Password must be at least 8 characters.')

    return errors
