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

@app.route('/admin/suspend-user', methods=['POST'])
def suspend_user():
    """Suspend a user for a specified duration"""
    if 'loggedin' not in session or not session.get('is_admin'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        data = request.get_json()
        user_id = data.get('user_id')
        duration_days = int(data.get('duration_days', 0))
        duration_hours = int(data.get('duration_hours', 0))
        reason = data.get('reason', 'No reason provided')

        if not user_id:
            return jsonify({'success': False, 'message': 'User ID is required'})

        if duration_days == 0 and duration_hours == 0:
            return jsonify({'success': False, 'message': 'Duration must be greater than 0'})

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Check if user exists
        cursor.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()

        if not user:
            cursor.close()
            return jsonify({'success': False, 'message': 'User not found'})

        # Prevent admins from suspending themselves
        if user_id == session['id']:
            cursor.close()
            return jsonify({'success': False, 'message': 'You cannot suspend yourself'})

        # Calculate suspension end time
        total_hours = (duration_days * 24) + duration_hours
        suspended_until = datetime.now() + timedelta(hours=total_hours)

        # Deactivate any existing active suspensions for this user
        cursor.execute("""
            UPDATE user_suspensions 
            SET is_active = FALSE 
            WHERE user_id = %s AND is_active = TRUE
        """, (user_id,))

        # Create new suspension
        cursor.execute("""
            INSERT INTO user_suspensions 
            (user_id, suspended_until, reason, suspended_by) 
            VALUES (%s, %s, %s, %s)
        """, (user_id, suspended_until, reason, session['id']))

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
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/admin/lift-suspension', methods=['POST'])
def lift_suspension():
    """Lift an active suspension for a user"""
    if 'loggedin' not in session or not session.get('is_admin'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

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


@app.route('/api/user/<int:user_id>/suspension-status')
def get_suspension_status(user_id):
    """Get suspension status for a user"""
    if 'loggedin' not in session or not session.get('is_admin'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Get active suspension
        cursor.execute("""
            SELECT 
                s.id,
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
                    'id': suspension['id'],
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


def check_user_suspension(user_id):
    """
    Helper function to check if user is suspended
    Returns (is_suspended, suspension_info)
    """
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        cursor.execute("""
            SELECT 
                id,
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


# Update your login route to check for suspensions
@app.route('/login', methods=['GET', 'POST'])
def login():
    """Modified login route with suspension check"""
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute('SELECT * FROM users WHERE username = %s', (username,))
        account = cursor.fetchone()
        cursor.close()

        if account and check_password_hash(account['password'], password):
            # Check if user is suspended
            is_suspended, suspension_info = check_user_suspension(account['id'])

            if is_suspended:
                # Format remaining time
                if suspension_info['remaining_days'] > 0:
                    time_remaining = f"{suspension_info['remaining_days']} day(s)"
                    if suspension_info['remaining_hours'] > 0:
                        time_remaining += f" and {suspension_info['remaining_hours']} hour(s)"
                else:
                    time_remaining = f"{suspension_info['remaining_hours']} hour(s)"

                flash(
                    f"Your account has been suspended until {suspension_info['suspended_until']}. "
                    f"Reason: {suspension_info['reason']}. "
                    f"Time remaining: {time_remaining}.",
                    'error'
                )
                return render_template('login.html')

            # Continue with normal login process
            session['loggedin'] = True
            session['id'] = account['id']
            session['username'] = account['username']
            # ... rest of your login logic

        else:
            flash('Incorrect username/password!', 'error')

    return render_template('login.html')