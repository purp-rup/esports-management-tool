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
                           SELECT user_id
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
    to users who have subscribed to specific events.

    Notifications are only sent to users who:
    1. Have enable_notifications = TRUE in their preferences
    2. Have specifically subscribed to the event via event_subscriptions table
    """

    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # ========================================================================
        # EVENT-SPECIFIC SUBSCRIPTIONS
        # Send to users who subscribed to specific events
        # ========================================================================

        current_time = datetime.now()

        # Get all active subscriptions with event details and user notification preferences
        cursor.execute("""
                       SELECT es.user_id,
                              es.event_id,
                              ge.EventID,
                              ge.EventName,
                              ge.Date,
                              ge.StartTime,
                              ge.EndTime,
                              ge.location,
                              ge.description,
                              ge.EventType,
                              u.email,
                              u.firstname,
                              u.lastname,
                              np.advance_notice_days,
                              np.advance_notice_hours
                       FROM event_subscriptions es
                                JOIN generalevents ge ON es.event_id = ge.EventID
                                JOIN users u ON es.user_id = u.id
                                LEFT JOIN notification_preferences np ON np.user_id = u.id
                       WHERE ge.Date >= CURDATE()
                         AND np.enable_notifications = TRUE
                       ORDER BY ge.Date, ge.StartTime
                       """)

        subscriptions = cursor.fetchall()

        for sub in subscriptions:
            event_date = sub['Date']
            event_datetime = datetime.combine(event_date, datetime.min.time())

            # Add start time if available
            if sub['StartTime']:
                if isinstance(sub['StartTime'], timedelta):
                    total_seconds = int(sub['StartTime'].total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60
                    event_datetime = event_datetime.replace(hour=hours, minute=minutes, second=seconds)
                    time_obj = datetime.min.time().replace(hour=hours, minute=minutes, second=seconds)
                else:
                    event_datetime = datetime.combine(event_date, sub['StartTime'])
                    time_obj = sub['StartTime']
            else:
                time_obj = None

            # Get user's advance notice preferences
            advance_notice = timedelta(
                days=sub.get('advance_notice_days', 1),
                hours=sub.get('advance_notice_hours', 0)
            )

            # Calculate notification window (30-minute window centered on notification time)
            target_notification_time = event_datetime - advance_notice
            notification_start = target_notification_time - timedelta(minutes=15)
            notification_end = target_notification_time + timedelta(minutes=15)

            # Check if current time falls within notification window
            if notification_start <= current_time <= notification_end:
                # Check if notification already sent for this subscription
                cursor.execute("""
                               SELECT sn.notification_id
                               FROM sent_notifications sn
                               WHERE sn.user_id = %s
                                 AND sn.event_id = %s
                                 AND sn.event_type = %s
                                 AND sn.sent_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
                               """, (sub['user_id'], sub['EventID'], sub['EventType']))

                if not cursor.fetchone():
                    # Prepare event details for email
                    event_details = {
                        'EventName': sub['EventName'],
                        'date': sub['Date'],
                        'StartTime': time_obj if time_obj else datetime.min.time(),
                        'location': sub['location'] if sub['location'] else 'TBA',
                        'description': sub['description'] if sub['description'] else 'No additional details'
                    }

                    user_email = sub['email']
                    user_name = sub['firstname']
                    event_type = sub['EventType'].capitalize() if sub['EventType'] else 'Event'

                    # Send notification
                    if send_event_notification(user_email, user_name, event_type, event_details):
                        # Log sent notification
                        cursor.execute("""
                                       INSERT INTO sent_notifications
                                           (user_id, event_id, event_type, sent_at)
                                       VALUES (%s, %s, %s, NOW())
                                       """, (sub['user_id'], sub['EventID'], sub['EventType']))

                        print(f"Sent subscription notification to {user_email} for {sub['EventName']}")

        mysql.connection.commit()
        print(f"Notification check completed at {datetime.now()}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in notification scheduler: {str(e)}")
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