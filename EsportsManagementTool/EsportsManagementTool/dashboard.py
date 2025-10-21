from EsportsManagementTool import app
from flask import Flask, render_template, request, redirect, url_for, session, flash
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

    if not user:
        session.clear()
        flash('User not found', 'error')
        return redirect(url_for('login'))

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

        return render_template(
            "dashboard.html",
            user=user,
            month_calendar=month_calendar,
            month_name=month_name,
            year=year,
            month=month,
            events_by_date=events_by_date,
            today_str=today_str,
            prev_year=prev_year,
            prev_month=prev_month,
            next_year=next_year,
            next_month=next_month
        )

    finally:
        cursor.close()