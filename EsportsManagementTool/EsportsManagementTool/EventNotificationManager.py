from EsportsManagementTool import app
from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_mysqldb import MySQL
from flask_mail import Mail, Message
import MySQLdb.cursors
import bcrypt
from dotenv import load_dotenv
from datetime import datetime, timedelta

mysql = MySQL()
mail = Mail()

"""DISCLAIMER: THIS CODE WAS GENERATED USING CLAUDE AI"""


# UC-13: ChooseEventNotice - User Notification Preferences
@app.route('/eventnotificationsettings', methods=['GET', 'POST'])
def notification_settings():
    """Allow users to configure their event notification preferences"""
    if 'loggedin' not in session:
        # Handle AJAX requests
        if request.method == 'POST' and (
                request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.accept_mimetypes.accept_json):
            return jsonify({'success': False, 'message': 'Not authenticated'}), 401
        flash('Please log in to access notification settings.', 'warning')
        return redirect(url_for('login'))

    user_id = session['id']

    if request.method == 'POST':
        enable_notifications = request.form.get('enable_notifications') == 'on'
        advance_notice_days = int(request.form.get('advance_notice_days', 1))
        advance_notice_hours = int(request.form.get('advance_notice_hours', 0))

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            # Check if preferences exist
            cursor.execute("""
                           SELECT id
                           FROM notification_preferences
                           WHERE user_id = %s
                           """, (user_id,))

            exists = cursor.fetchone()

            if exists:
                # Update existing preferences
                cursor.execute("""
                               UPDATE notification_preferences
                               SET enable_notifications = %s,
                                   advance_notice_days  = %s,
                                   advance_notice_hours = %s,
                                   updated_at           = NOW()
                               WHERE user_id = %s
                               """, (enable_notifications, advance_notice_days,
                                     advance_notice_hours, user_id))
            else:
                # Insert new preferences
                cursor.execute("""
                               INSERT INTO notification_preferences
                               (user_id, enable_notifications, advance_notice_days,
                                advance_notice_hours, created_at, updated_at)
                               VALUES (%s, %s, %s, %s, NOW(), NOW())
                               """, (user_id, enable_notifications, advance_notice_days,
                                     advance_notice_hours))

            mysql.connection.commit()

            # Return JSON for AJAX requests
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.accept_mimetypes.accept_json:
                return jsonify({'success': True, 'message': 'Notification preferences saved successfully!'}), 200

            flash('Notification preferences saved successfully!', 'success')

        except Exception as e:
            # Return error as JSON for AJAX requests
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.accept_mimetypes.accept_json:
                return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 400
            flash(f'Error saving preferences: {str(e)}', 'error')

        finally:
            cursor.close()

        return redirect(url_for('dashboard'))

    # GET request - redirect to dashboard (no standalone page anymore)
    return redirect(url_for('dashboard'))


# UC-14: SendEventNotice - Automated Email Notifications
def send_event_notification(user_email, user_name, event_type, event_details):
    """Send email notification to user about upcoming event"""
    try:
        subject = f"Reminder: Upcoming {event_type}"

        body = f"""
        Hello {user_name},

        This is a reminder about your upcoming {event_type.lower()}:

        Event: {event_details['EventName']}
        Date: {event_details['date'].strftime('%B %d, %Y')}
        Time: {event_details['StartTime'].strftime('%I:%M %p')}
        Location: {event_details['location']}

        {'Match Details:' if event_type == 'Match' else 'Event Details:'}
        {event_details.get('description', 'No additional details')}

        We look forward to seeing you there!

        Best regards,
        Esports Management Tool
        """

        msg = Message(subject=subject, recipients=[user_email], body=body)
        mail.send(msg)

        return True
    except Exception as e:
        print(f"Error sending email to {user_email}: {e}")
        return False


def check_and_send_notifications():
    """
    Background task to check for upcoming events and send notifications
    to all users based on their notification preferences
    """

    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Get all users with notifications enabled
        cursor.execute("""
                       SELECT u.id as user_id,
                              u.email,
                              u.firstname,
                              np.advance_notice_days,
                              np.advance_notice_hours
                       FROM users u
                                JOIN notification_preferences np ON u.id = np.user_id
                       WHERE np.enable_notifications = TRUE
                       """)

        users = cursor.fetchall()

        for user in users:
            # Calculate notification window
            advance_time = timedelta(
                days=user['advance_notice_days'],
                hours=user['advance_notice_hours']
            )
            notification_time = datetime.now() + advance_time

            # Get all upcoming events from generalevents table
            cursor.execute("""
                           SELECT ge.EventID,
                                  ge.EventName,
                                  ge.Date as date,
                                  ge.StartTime,
                                  ge.location,
                                  ge.description,
                                  ge.EventType as event_type
                           FROM generalevents ge
                           WHERE ge.Date = DATE (%s)
                             AND ge.StartTime BETWEEN %s
                             AND %s
                             AND NOT EXISTS (
                               SELECT 1 FROM sent_notifications sn
                               WHERE sn.user_id = %s
                             AND sn.event_id = ge.EventID
                             AND sn.event_type = ge.EventType
                             AND sn.sent_at >= DATE_SUB(NOW()
                               , INTERVAL 1 DAY)
                               )
                           """, (notification_time.date(),
                                 notification_time.time(),
                                 (notification_time + timedelta(hours=1)).time(),
                                 user['user_id']))

            events = cursor.fetchall()

            # Send notifications for all events
            for event in events:
                # Convert timedelta to time object if needed
                if isinstance(event['StartTime'], timedelta):
                    total_seconds = int(event['StartTime'].total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60
                    event['StartTime'] = datetime.min.time().replace(hour=hours, minute=minutes, second=seconds)

                # Capitalize event type for display (e.g., 'match' -> 'Match', 'tournament' -> 'Tournament')
                event_label = event['event_type'].capitalize() if event['event_type'] else 'Event'

                if send_event_notification(
                        user['email'],
                        user['firstname'],
                        event_label,
                        event
                ):
                    # Log sent notification
                    cursor.execute("""
                                   INSERT INTO sent_notifications
                                       (user_id, event_id, event_type, sent_at)
                                   VALUES (%s, %s, %s, NOW())
                                   """, (user['user_id'], event['EventID'], event['event_type']))

        mysql.connection.commit()

    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()


# Initialize scheduler for background notifications
scheduler = BackgroundScheduler()
scheduler.add_job(
    func=check_and_send_notifications,
    trigger="interval",
    minutes=60
)
scheduler.start()

import atexit

atexit.register(lambda: scheduler.shutdown())
"""DISCLAIMER: THIS CODE WAS GENERATED USING CLAUDE AI"""