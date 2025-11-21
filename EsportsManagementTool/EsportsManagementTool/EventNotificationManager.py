from EsportsManagementTool import app
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
import os

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

        # Get event type preferences
        notify_events = request.form.get('notify_events') == 'on'
        notify_matches = request.form.get('notify_matches') == 'on'
        notify_tournaments = request.form.get('notify_tournaments') == 'on'
        notify_practices = request.form.get('notify_practices') == 'on'
        notify_misc = request.form.get('notify_misc') == 'on'  # NEW: Added misc

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
                                   notify_misc          = %s,
                                   updated_at           = NOW()
                               WHERE user_id = %s
                               """, (enable_notifications, advance_notice_days,
                                     advance_notice_hours, notify_events,
                                     notify_matches, notify_tournaments,
                                     notify_practices, notify_misc, user_id))
            else:
                # Insert new preferences
                cursor.execute("""
                               INSERT INTO notification_preferences
                               (user_id, enable_notifications, advance_notice_days,
                                advance_notice_hours, notify_events, notify_matches,
                                notify_tournaments, notify_practices, notify_misc, 
                                created_at, updated_at)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                               """, (user_id, enable_notifications, advance_notice_days,
                                     advance_notice_hours, notify_events,
                                     notify_matches, notify_tournaments, notify_practices,
                                     notify_misc))

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
    Background task to check for upcoming events and send notifications
    to users based on their notification preferences, memberships, event visibility,
    and manual event subscriptions
    """

    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Get all users with notifications enabled
        cursor.execute("""
                       SELECT u.id as user_id,
                              u.email,
                              u.firstname,
                              np.advance_notice_days,
                              np.advance_notice_hours,
                              np.notify_events,
                              np.notify_matches,
                              np.notify_practices,
                              np.notify_tournaments,
                              np.notify_misc
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

            # Get user's team memberships
            cursor.execute("""
                           SELECT team_id
                           FROM team_members
                           WHERE user_id = %s
                           """, (user['user_id'],))
            user_teams = [row['team_id'] for row in cursor.fetchall()]

            # Get ALL games user is associated with (both from communities AND teams)
            cursor.execute("""
                           SELECT DISTINCT game_id
                           FROM (SELECT game_id
                                 FROM in_communities
                                 WHERE user_id = %s
                                 UNION
                                 SELECT t.gameID as game_id
                                 FROM team_members tm
                                          JOIN teams t ON tm.team_id = t.teamID
                                 WHERE tm.user_id = %s) AS user_games
                           """, (user['user_id'], user['user_id']))
            user_games = [row['game_id'] for row in cursor.fetchall()]

            # Build dynamic query based on user preferences and memberships
            event_conditions = []

            # Helper to build visibility check
            def build_visibility_check(user_teams, user_games, user_id):
                """Returns SQL condition for checking if user should see event based on visibility"""
                conditions = ["ge.visibility = 'all_members'"]

                if user_games:
                    game_ids = ','.join([str(gid) for gid in user_games])
                    conditions.append(f"(ge.visibility = 'game_community' AND ge.game_id IN ({game_ids}))")

                if user_teams:
                    # For game_players: user must be on a team in that game
                    conditions.append(f"""(ge.visibility = 'game_players' AND ge.game_id IN (
                        SELECT t.gameID FROM team_members tm 
                        JOIN teams t ON tm.team_id = t.teamID 
                        WHERE tm.user_id = {user_id}
                    ))""")

                    # For team: user must be on that specific team
                    team_ids = ','.join([f"'{tid}'" for tid in user_teams])
                    conditions.append(f"(ge.visibility = 'team' AND ge.team_id IN ({team_ids}))")

                return ' OR '.join(conditions)

            visibility_check = build_visibility_check(user_teams, user_games, user['user_id'])

            # 1. General Events - check notification preference and visibility
            if user['notify_events']:
                event_conditions.append(f"(ge.EventType = 'Event' AND ({visibility_check}))")

            # 2. Matches - check notification preference and visibility
            if user['notify_matches']:
                event_conditions.append(f"(ge.EventType = 'Match' AND ({visibility_check}))")

            # 3. Practices - check notification preference and visibility
            if user['notify_practices']:
                event_conditions.append(f"(ge.EventType = 'Practice' AND ({visibility_check}))")

            # 4. Tournaments - for all games user is associated with
            if user['notify_tournaments'] and user_games:
                game_ids = ','.join([str(gid) for gid in user_games])
                # Tournaments should reach game community and players
                event_conditions.append(f"""
                    (ge.EventType = 'Tournament' AND ge.game_id IN ({game_ids}) AND (
                        ge.visibility IN ('game_community', 'game_players', 'all_members')
                    ))
                """)

            # 5. Misc - check notification preference and visibility
            if user['notify_misc']:
                event_conditions.append(f"(ge.EventType = 'Misc' AND ({visibility_check}))")

            # 6. Manual Subscriptions - ALWAYS include events user manually subscribed to
            # Manual subscriptions override category preferences but still respect visibility
            event_conditions.append(f"""
                (ge.EventID IN (
                    SELECT event_id 
                    FROM event_subscriptions 
                    WHERE user_id = {user['user_id']}
                ) AND ({visibility_check}))
            """)

            # Skip if user has no applicable preferences or memberships
            if not event_conditions:
                continue

            # Combine all conditions with OR
            where_clause = ' OR '.join(event_conditions)

            # Get all upcoming events that match user's preferences and memberships
            query = f"""
                SELECT ge.EventID,
                       ge.EventName,
                       ge.Date as date,
                       ge.StartTime,
                       ge.location,
                       ge.description,
                       ge.EventType as event_type
                FROM generalevents ge
                WHERE ge.Date = DATE(%s)
                  AND ge.StartTime BETWEEN %s AND %s
                  AND ({where_clause})
                  AND NOT EXISTS (
                      SELECT 1 FROM sent_notifications sn
                      WHERE sn.user_id = %s
                        AND sn.event_id = ge.EventID
                        AND sn.event_type = ge.EventType
                        AND sn.sent_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
                  )
            """

            cursor.execute(query, (
                notification_time.date(),
                notification_time.time(),
                (notification_time + timedelta(hours=1)).time(),
                user['user_id']
            ))

            events = cursor.fetchall()

            # Send notifications for all matched events
            for event in events:
                # Convert timedelta to time object if needed
                if isinstance(event['StartTime'], timedelta):
                    total_seconds = int(event['StartTime'].total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60
                    event['StartTime'] = datetime.min.time().replace(
                        hour=hours, minute=minutes, second=seconds
                    )

                # Capitalize event type for display
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

# ========================================================================
# Initialize scheduler for background notifications (UC-14)
# ========================================================================

def scheduled_check_wrapper():
    """Wrapper ensures the scheduler runs safely within the Flask app context"""
    print(f"[{datetime.now()}] ===== SCHEDULER TRIGGERED =====")
    with app.app_context():
        try:
            print(f"[{datetime.now()}] Starting notification check...")
            check_and_send_notifications()
            print(f"[{datetime.now()}] Notification check completed successfully")
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[{datetime.now()}] Error in notification scheduler: {str(e)}")


# Only start scheduler in the main process (not the reloader)
if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
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