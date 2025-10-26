from EsportsManagementTool import app
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_mysqldb import MySQL
from flask_mail import Mail, Message
import MySQLdb.cursors
import re
import bcrypt
import secrets
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta
import calendar as cal

from EsportsManagementTool import mysql

@app.route('/dashboard')
@app.route('/dashboard/<int:year>/<int:month>')
def dashboard(year=None, month=None):
    if 'loggedin' not in session:
        flash('Please log in to access the dashboard', 'error')
        return redirect(url_for('login'))

    # Get user data
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    cursor.execute("SELECT * FROM users WHERE id = %s", (session['id'],))
    user = cursor.fetchone()

    ##Temporary override. Makes all users admins to be able to view admin panel!!
    user['is_admin'] = True

    if not user:
        session.clear()
        flash('User not found', 'error')
        return redirect(url_for('login'))

    # Get notification preferences
    cursor.execute("""
        SELECT * FROM notification_preferences 
        WHERE user_id = %s
    """, (session['id'],))
    preferences = cursor.fetchone()

    # Default to current month/year if not specified
    if year is None or month is None:
        today = datetime.now()
        year = today.year
        month = today.month

    # Validate month and year
    if month < 1 or month > 12:
        flash('Invalid month!')
        return redirect(url_for('dashboard'))
    if year < 1900 or year > 2100:
        flash('Year must be between 1900 and 2100!')
        return redirect(url_for('dashboard'))

    # Get today's date for highlighting
    today = datetime.now()
    today_str = today.strftime('%Y-%m-%d')

    # Get calendar information
    cal.setfirstweekday(cal.SUNDAY)
    month_calendar = cal.monthcalendar(year, month)
    month_name = cal.month_name[month]

    # Calculate previous and next month
    if month == 1:
        prev_month = 12
        prev_year = year - 1
    else:
        prev_month = month - 1
        prev_year = year

    if month == 12:
        next_month = 1
        next_year = year + 1
    else:
        next_month = month + 1
        next_year = year

    # Get events from database for this month
    try:
        cursor.execute(
            'SELECT * FROM generalevents WHERE YEAR(Date) = %s AND MONTH(Date) = %s ORDER BY Date, StartTime',
            (year, month)
        )
        events = cursor.fetchall()

        # Organize events by date
        events_by_date = {}
        for event in events:
            date_str = event['Date'].strftime('%Y-%m-%d')

            # Handle timedelta for StartTime
            if event['StartTime']:
                total_seconds = int(event['StartTime'].total_seconds())
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                time_str = f"{hours:02d}:{minutes:02d}"
            else:
                time_str = None

            event_data = {
                'id': event['EventID'],
                'time': time_str,
                'title': event['EventName'],
                'description': event['Description'] if event['Description'] else ''
            }

            if date_str not in events_by_date:
                events_by_date[date_str] = []
            events_by_date[date_str].append(event_data)

        # --- Admin Panel Stats ---
        total_users = active_users = admins = gms = 0

        if user.get('is_admin', True):  # treat everyone as admin for now
            try:
                # Count all users
                cursor.execute("SELECT COUNT(*) AS total_users FROM users")
                total_users = cursor.fetchone()['total_users']

                # Treat all users as active (no is_active column)
                active_users = total_users

                # Since there’s no is_admin or role column yet
                admins = 1  # yourself
                gms = 0  # none yet
            except Exception as e:
                print("Admin stats error:", e)

        # --- Admin User Management ---
        user_list = []

        if user.get('is_admin', True):  # temporary override: treat all as admin
            try:
                cursor.execute("SELECT firstname, lastname, username, email, date FROM users ORDER BY date DESC")
                user_list = cursor.fetchall()

                ##Temporary (ADD AN ACTIVE/INACTIVE thing)
                for u in user_list:
                    u['active'] = True
                ##Temporary

            except Exception as e:
                print("Error fetching user list:", e)

        return render_template(
            "dashboard.html",
            user=user,
            preferences=preferences,
            month_calendar=month_calendar,
            month_name=month_name,
            year=year,
            month=month,
            events_by_date=events_by_date,
            today_str=today_str,
            prev_year=prev_year,
            prev_month=prev_month,
            next_year=next_year,
            next_month=next_month,
            total_users = total_users,
            active_users = active_users,
            admins = admins,
            gms = gms,
            user_list = user_list
        )

    finally:
        cursor.close()

##Delete Events functionality. Includes deleting from table.
@app.route('/delete-event', methods=['POST'])
def delete_event():
    """
    Delete an event from the generalevents table.
    Only accessible to logged-in admin users.
    """
    # Check if user is logged in
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized - Please log in'}), 401

    # Get user information to check admin status
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("SELECT * FROM users WHERE id = %s", (session['id'],))
        user = cursor.fetchone()

        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404

        # Admin check (temporary override treats all users as admin)
        if not user.get('is_admin', True):  # treat all as admin for now
            return jsonify({'success': False, 'message': 'Permission denied - Admin access required'}), 403

        # Get the event ID from request JSON
        data = request.get_json()
        event_id = data.get('event_id')

        if not event_id:
            return jsonify({'success': False, 'message': 'Missing event ID'}), 400

        # Verify event exists before attempting to delete
        cursor.execute("SELECT EventID FROM generalevents WHERE EventID = %s", (event_id,))
        event = cursor.fetchone()

        if not event:
            return jsonify({'success': False, 'message': 'Event not found'}), 404

        # Delete the event from the database
        cursor.execute("DELETE FROM generalevents WHERE EventID = %s", (event_id,))
        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': 'Event deleted successfully'
        }), 200

    except Exception as e:
        # Log the error for debugging
        print(f"Error deleting event: {str(e)}")
        mysql.connection.rollback()
        return jsonify({
            'success': False,
            'message': 'Database error occurred while deleting event'
        }), 500

    finally:
        cursor.close()