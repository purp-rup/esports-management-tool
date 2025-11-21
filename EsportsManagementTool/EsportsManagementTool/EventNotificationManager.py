from EsportsManagementTool import app
from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_mysqldb import MySQL
from flask_mail import Mail, Message
import MySQLdb.cursors
import bcrypt
from dotenv import load_dotenv
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
import atexit
from EsportsManagementTool import app, get_current_time, localize_datetime, EST

mysql = MySQL()
mail = Mail()

"""DISCLAIMER: THIS CODE WAS GENERATED USING CLAUDE AI AND CHATGPT"""


# UC-13: ChooseEventNotice - User Notification Preferences (Enhanced with Event Type Filtering)
@app.route('/eventnotificationsettings', methods=['GET', 'POST'])
def notification_settings():
    """Allow users to configure their event notification preferences including event types"""
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

        # NEW: Get event type preferences
        notify_events = request.form.get('notify_events') == 'on'
        notify_matches = request.form.get('notify_matches') == 'on'
        notify_tournaments = request.form.get('notify_tournaments') == 'on'
        notify_practices = request.form.get('notify_practices') == 'on'

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
                                   notify_events        = %s,
                                   notify_matches       = %s,
                                   notify_tournaments   = %s,
                                   notify_practices     = %s,
                                   updated_at           = NOW()
                               WHERE user_id = %s
                               """, (enable_notifications, advance_notice_days,
                                     advance_notice_hours, notify_events,
                                     notify_matches, notify_tournaments,
                                     notify_practices, user_id))
            else:
                # Insert new preferences
                cursor.execute("""
                               INSERT INTO notification_preferences
                               (user_id, enable_notifications, advance_notice_days,
                                advance_notice_hours, notify_events, notify_matches,
                                notify_tournaments, notify_practices, created_at, updated_at)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                               """, (user_id, enable_notifications, advance_notice_days,
                                     advance_notice_hours, notify_events,
                                     notify_matches, notify_tournaments, notify_practices))

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

        Event Details:
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
    Background task to check for upcoming events and send notifications.

    Mechanisms:
    1. Event Subscriptions: Users subscribed to specific events always get notified.
    2. General Reminders: Users who enabled notifications for event types get notified for matching events.
    """
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        current_time = get_current_time()

        # ============================
        # 1️⃣ Event Subscriptions
        # ============================
        cursor.execute("""
            SELECT 
                es.user_id,
                ge.EventID,
                ge.EventName,
                ge.Date,
                ge.StartTime,
                ge.EndTime,
                ge.Location,
                ge.Description,
                ge.EventType,
                u.email,
                u.firstname,
                u.lastname
            FROM event_subscriptions es
            JOIN generalevents ge ON es.event_id = ge.EventID
            JOIN users u ON es.user_id = u.id
            JOIN notification_preferences np ON np.user_id = es.user_id
            WHERE np.enable_notifications = 1
              AND ge.Date >= CURDATE()
        """)
        subscriptions = cursor.fetchall()

        # ============================
        # 2️⃣ General Reminders (by event type)
        # ============================
        cursor.execute("""
            SELECT 
                np.user_id,
                ge.EventID,
                ge.EventName,
                ge.Date,
                ge.StartTime,
                ge.EndTime,
                ge.Location,
                ge.Description,
                ge.EventType,
                u.email,
                u.firstname,
                u.lastname,
                np.notify_events,
                np.notify_matches,
                np.notify_tournaments,
                np.notify_practices
            FROM generalevents ge
            JOIN users u ON u.id = u.id
            JOIN notification_preferences np ON np.user_id = u.id
            WHERE np.enable_notifications = 1
              AND ge.Date >= CURDATE()
        """)
        general_reminders = cursor.fetchall()

        # Combine subscriptions and general reminders into one list
        all_notifications = []

        # Subscriptions: Always notify
        for sub in subscriptions:
            all_notifications.append((sub, True))  # True = ignore event type filtering

        # General reminders: Only notify if preference matches event type
        for gr in general_reminders:
            event_type_lower = gr['EventType'].lower() if gr['EventType'] else 'event'
            should_notify = False
            if event_type_lower == 'event' and gr.get('notify_events', 0):
                should_notify = True
            elif event_type_lower == 'match' and gr.get('notify_matches', 0):
                should_notify = True
            elif event_type_lower == 'tournament' and gr.get('notify_tournaments', 0):
                should_notify = True
            elif event_type_lower == 'practice' and gr.get('notify_practices', 0):
                should_notify = True

            if should_notify:
                all_notifications.append((gr, False))  # False = respect type filtering

        # Process notifications
        for sub, ignore_type in all_notifications:
            # Compute event datetime
            event_date = sub['Date']
            start_time = sub['StartTime']
            if isinstance(start_time, timedelta):
                total_seconds = int(start_time.total_seconds())
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                seconds = total_seconds % 60
                event_datetime = datetime.combine(event_date, datetime.min.time()).replace(hour=hours, minute=minutes, second=seconds)
                event_datetime = localize_datetime(event_datetime)
                time_obj = datetime.min.time().replace(hour=hours, minute=minutes, second=seconds)
            else:
                event_datetime = datetime.combine(event_date, start_time)
                event_datetime = localize_datetime(event_datetime)
                time_obj = start_time

            # Use user's advance notice preferences
            cursor.execute("""
                SELECT advance_notice_days, advance_notice_hours
                FROM notification_preferences
                WHERE user_id = %s
            """, (sub['user_id'],))
            prefs = cursor.fetchone()
            advance_notice = timedelta(days=prefs.get('advance_notice_days', 1),
                                       hours=prefs.get('advance_notice_hours', 0))

            target_notification_time = event_datetime - advance_notice
            notification_start = target_notification_time - timedelta(minutes=15)
            notification_end = target_notification_time + timedelta(minutes=15)

            if notification_start <= current_time <= notification_end:
                # Check if notification was already sent
                cursor.execute("""
                    SELECT id
                    FROM sent_notifications
                    WHERE user_id = %s
                      AND event_id = %s
                      AND sent_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
                """, (sub['user_id'], sub['EventID']))
                if cursor.fetchone():
                    continue  # Already sent

                # Prepare event details for email
                event_details = {
                    'EventName': sub['EventName'],
                    'date': sub['Date'],
                    'StartTime': time_obj,
                    'location': sub['Location'] or 'TBA',
                    'description': sub['Description'] or 'No additional details'
                }
                user_email = sub['email']
                user_name = f"{sub['firstname']} {sub['lastname']}"
                event_type = sub['EventType'].capitalize() if sub['EventType'] else 'Event'

                if send_event_notification(user_email, user_name, event_type, event_details):
                    cursor.execute("""
                        INSERT INTO sent_notifications (user_id, event_id, sent_at)
                        VALUES (%s, %s, NOW())
                    """, (sub['user_id'], sub['EventID']))
                    print(f"Sent notification to {user_email} for {sub['EventName']} ({event_type})")

        mysql.connection.commit()
        print(f"Notification check completed at {get_current_time()}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in notification scheduler: {str(e)}")
    finally:
        cursor.close()

# ========================================================================
# Initialize scheduler for background notifications (UC-14)
# ========================================================================
def scheduled_check_wrapper():
    """Wrapper ensures the scheduler runs safely within the Flask app context"""
    with app.app_context():
        try:
            check_and_send_notifications()
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"Error in notification scheduler: {str(e)}")

# Initialize the background scheduler
scheduler = BackgroundScheduler()

# Add job to run every minute
scheduler.add_job(
    func=scheduled_check_wrapper,
    trigger="interval",
    minutes=1,
    id="event_notification_job",
    replace_existing=True
)

# Start the scheduler
scheduler.start()

# Ensure clean shutdown on app exit
atexit.register(lambda: scheduler.shutdown(wait=False))
"""DISCLAIMER: THIS CODE WAS GENERATED USING CLAUDE AI AND CHATGPT"""