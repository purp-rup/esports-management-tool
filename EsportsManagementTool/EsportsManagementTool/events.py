"""
Event Management Routes
Consolidated module for all event-related functionality
"""
from flask import request, jsonify, session, render_template
from datetime import datetime, timedelta
import MySQLdb.cursors


def register_event_routes(app, mysql, login_required, roles_required, get_user_permissions):
    """
    Register all event-related routes with the Flask app

    Args:
        app: Flask application instance
        mysql: MySQL connection instance
        login_required: Decorator for login protection
        roles_required: Decorator for role-based access
        get_user_permissions: Function to get user permissions
    """

    # ===================================
    # EVENT CREATION
    # ===================================
    @app.route('/event-register', methods=['GET', 'POST'])
    @roles_required('admin', 'gm')
    def eventRegister():
        """
        Create a new event
        Accessible by: Admins and Game Managers
        """
        msg = ''
        if request.method == 'POST':
            eventName = request.form.get('eventName', '').strip()
            eventDate = request.form.get('eventDate', '').strip()
            eventType = request.form.get('eventType', '').strip()
            game = request.form.get('game', '').strip()
            startTime = request.form.get('startTime', '').strip()
            endTime = request.form.get('endTime', '').strip()
            eventDescription = request.form.get('eventDescription', '').strip()
            location = request.form.get('eventLocation', '').strip()

            if eventName and eventDate and eventType and startTime and endTime and eventDescription:
                cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
                try:
                    cursor.execute(
                        'INSERT INTO generalevents (EventName, Date, StartTime, EndTime, Description, EventType, Game, Location, created_by) '
                        'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)',
                        (eventName, eventDate, startTime, endTime, eventDescription, eventType, game, location,
                         session['id']))
                    mysql.connection.commit()
                    msg = 'Event Registered!'

                    # Return JSON for AJAX requests
                    if request.headers.get(
                            'X-Requested-With') == 'XMLHttpRequest' or request.accept_mimetypes.accept_json:
                        return jsonify({'success': True, 'message': msg}), 200

                except Exception as e:
                    msg = f'Error: {str(e)}'
                    if request.headers.get(
                            'X-Requested-With') == 'XMLHttpRequest' or request.accept_mimetypes.accept_json:
                        return jsonify({'success': False, 'message': msg}), 400
                finally:
                    cursor.close()
            else:
                msg = 'Please fill out all fields!'
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.accept_mimetypes.accept_json:
                    return jsonify({'success': False, 'message': msg}), 400

        return render_template('event_register.html', msg=msg)

    # ===================================
    # EVENT RETRIEVAL
    # ===================================
    @app.route('/api/events', methods=['GET'])
    @login_required
    def get_events():
        """
        Get events based on user role and filters
        """
        try:
            user_id = session['id']
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            # Get user permissions
            permissions = get_user_permissions(user_id)
            is_admin = permissions['is_admin']
            is_gm = permissions['is_gm']

            # Get filter parameters
            event_filter = request.args.get('filter', 'all')
            event_type_filter = request.args.get('event_type', '').lower()
            game_filter = request.args.get('game', '')

            # Get current date and time
            now = datetime.now()
            current_date = now.date()
            current_time = now.time()

            # Build base conditions
            conditions = []
            params = []

            # Date filter
            if event_filter == 'upcoming':
                end_date = current_date + timedelta(days=7)
                conditions.append("Date >= %s AND Date <= %s")
                params.extend([current_date, end_date])
            elif event_filter == 'upcoming14':
                end_date = current_date + timedelta(days=14)
                conditions.append("Date >= %s AND Date <= %s")
                params.extend([current_date, end_date])
            elif event_filter == 'past30':
                start_date = current_date - timedelta(days=30)
                conditions.append("Date >= %s AND Date < %s")
                params.extend([start_date, current_date])
            elif event_filter == 'created_by_me':
                # Only allow this filter for admins and GMs
                if not (is_admin or is_gm):
                    return jsonify({'success': False, 'message': 'Unauthorized filter'}), 403
                conditions.append("created_by = %s")
                params.append(user_id)
            elif event_filter == 'type' and event_type_filter:
                conditions.append("LOWER(EventType) = %s")
                params.append(event_type_filter)
            elif event_filter == 'game' and game_filter:
                conditions.append("Game = %s")
                params.append(game_filter)

            # Build WHERE clause
            where_clause = " AND ".join(conditions) if conditions else "1=1"

            # Determine sort order (upcoming filters should sort ascending, others descending)
            is_upcoming_filter = event_filter in ['upcoming', 'upcoming14']

            # Handle "subscribed" filter - applies to all users
            if event_filter == 'subscribed':
                query = f"""
                    SELECT 
                        ge.EventID, ge.EventName, ge.Date, ge.StartTime, ge.EndTime,
                        ge.EventType, ge.Game, ge.Location, ge.Description, ge.created_by,
                        ge.is_scheduled, ge.schedule_id
                    FROM generalevents ge
                    INNER JOIN event_subscriptions es ON ge.EventID = es.event_id
                    WHERE {where_clause} AND es.user_id = %s
                    ORDER BY ge.Date DESC, ge.StartTime DESC
                """
                params.append(user_id)
                cursor.execute(query, tuple(params))

            # Build query based on user role
            elif is_admin:
                query = f"""
                    SELECT 
                        EventID, EventName, Date, StartTime, EndTime,
                        EventType, Game, Location, Description, created_by,
                        is_scheduled, schedule_id
                    FROM generalevents
                    WHERE {where_clause}
                    ORDER BY Date {'ASC' if is_upcoming_filter else 'DESC'}, 
                             StartTime {'ASC' if is_upcoming_filter else 'DESC'}
                """
                cursor.execute(query, tuple(params))

            elif is_gm:
                # For GMs, if not using "created_by_me" filter, still only show their events
                if event_filter != 'created_by_me':
                    conditions.append("created_by = %s")
                    params.append(user_id)
                    where_clause = " AND ".join(conditions) if conditions else "created_by = %s"

                query = f"""
                    SELECT 
                        EventID, EventName, Date, StartTime, EndTime,
                        EventType, Game, Location, Description, created_by,
                        is_scheduled, schedule_id
                    FROM generalevents
                    WHERE {where_clause}
                    ORDER BY Date {'ASC' if is_upcoming_filter else 'DESC'}, 
                             StartTime {'ASC' if is_upcoming_filter else 'DESC'}
                """
                cursor.execute(query, tuple(params))

            else:
                # Regular users see ALL events
                query = f"""
                    SELECT 
                        EventID, EventName, Date, StartTime, EndTime,
                        EventType, Game, Location, Description, created_by,
                        is_scheduled, schedule_id
                    FROM generalevents
                    WHERE {where_clause}
                    ORDER BY Date {'ASC' if is_upcoming_filter else 'DESC'}, 
                             StartTime {'ASC' if is_upcoming_filter else 'DESC'}
                """
                cursor.execute(query, tuple(params))

            events = cursor.fetchall()
            cursor.close()

            # Process events
            events_list = []
            for event in events:
                start_time_str = _format_time(event['StartTime'])
                end_time_str = _format_time(event['EndTime'])
                is_ongoing = _check_if_ongoing(event['Date'], start_time_str, end_time_str, current_date, current_time)

                event_data = {
                    'id': event['EventID'],
                    'name': event['EventName'],
                    'date': event['Date'].strftime('%B %d, %Y'),
                    'date_raw': event['Date'].strftime('%Y-%m-%d'),
                    'start_time': start_time_str,
                    'end_time': end_time_str,
                    'event_type': event['EventType'] or 'Event',
                    'game': event['Game'] or 'N/A',
                    'location': event['Location'] or 'TBD',
                    'description': event['Description'] or 'No description provided',
                    'is_ongoing': is_ongoing,
                    'created_by': event['created_by'],
                    'is_scheduled': event.get('is_scheduled', False),  # ADD THIS
                    'schedule_id': event.get('schedule_id')  # ADD THIS
                }
                events_list.append(event_data)

            return jsonify({
                'success': True,
                'events': events_list,
                'is_admin': is_admin,
                'is_gm': is_gm
            }), 200

        except Exception as e:
            print(f"Error fetching events: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'success': False, 'message': 'Failed to fetch events'}), 500

    @app.route('/api/event/<int:event_id>')
    @login_required
    def api_event_details(event_id):
        """Get detailed information about a specific event"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            cursor.execute('SELECT * FROM generalevents WHERE EventID = %s', (event_id,))
            event = cursor.fetchone()

            if not event:
                return jsonify({'error': 'Event not found'}), 404

            event_data = {
                'id': event['EventID'],
                'name': event['EventName'],
                'date': event['Date'].strftime('%B %d, %Y'),
                'date_raw': event['Date'].strftime('%Y-%m-%d'),
                'start_time': _format_time(event['StartTime']),
                'end_time': _format_time(event['EndTime']),
                'description': event['Description'] if event['Description'] else 'No description provided',
                'event_type': event['EventType'] if event['EventType'] else 'General',
                'game': event['Game'] if event['Game'] else 'N/A',
                'location': event['Location'] if event['Location'] else 'TBD',
                'created_by': event.get('created_by')
            }

            return jsonify(event_data)
        finally:
            cursor.close()

    # ===================================
    # EVENT EDITING
    # ===================================
    @app.route('/api/event/edit', methods=['POST'])
    @login_required
    def edit_event():
        """
        Edit an existing event
        - Admins can edit any event
        - Game Managers can only edit events they created
        """
        try:
            user_id = session['id']
            data = request.get_json()

            # Validate required fields
            required_fields = ['event_id', 'event_name', 'event_type', 'event_date',
                               'start_time', 'end_time', 'location', 'description']
            for field in required_fields:
                if field not in data:
                    return jsonify({'success': False, 'message': f'Missing required field: {field}'}), 400

            event_id = data['event_id']
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            # Get user permissions
            permissions = get_user_permissions(user_id)
            is_admin = permissions['is_admin']
            is_gm = permissions['is_gm']

            # Get the event to check permissions
            cursor.execute("""
                SELECT EventID, EventName, created_by
                FROM generalevents
                WHERE EventID = %s
            """, (event_id,))
            event = cursor.fetchone()

            if not event:
                cursor.close()
                return jsonify({'success': False, 'message': 'Event not found'}), 404

            # Check permissions
            if is_admin:
                can_edit = True
            elif is_gm and event['created_by'] == user_id:
                can_edit = True
            else:
                can_edit = False

            if not can_edit:
                cursor.close()
                return jsonify({'success': False, 'message': 'You do not have permission to edit this event'}), 403

            # Update the event
            cursor.execute("""
                UPDATE generalevents
                SET EventName = %s, EventType = %s, Game = %s, Date = %s,
                    StartTime = %s, EndTime = %s, Location = %s, Description = %s
                WHERE EventID = %s
            """, (
                data['event_name'], data['event_type'], data['game'] if data['game'] else None,
                data['event_date'], data['start_time'], data['end_time'],
                data['location'], data['description'], event_id
            ))

            mysql.connection.commit()
            cursor.close()

            return jsonify({'success': True, 'message': f'Event "{data["event_name"]}" updated successfully'}), 200

        except Exception as e:
            print(f"Error editing event: {str(e)}")
            import traceback
            traceback.print_exc()
            mysql.connection.rollback()
            return jsonify({'success': False, 'message': 'Failed to update event'}), 500

    # ===================================
    # EVENT DELETION
    # ===================================
    @app.route('/api/events/<int:event_id>', methods=['DELETE'])
    @login_required
    def delete_event_from_tab(event_id):
        """
        Delete an event
        - Admins can delete any event
        - Game Managers can only delete events they created
        """
        try:
            user_id = session['id']
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            # Get user permissions
            permissions = get_user_permissions(user_id)
            is_admin = permissions['is_admin']
            is_gm = permissions['is_gm']

            # Get event details
            cursor.execute("""
                SELECT EventID, EventName, created_by
                FROM generalevents
                WHERE EventID = %s
            """, (event_id,))
            event = cursor.fetchone()

            if not event:
                cursor.close()
                return jsonify({'success': False, 'message': 'Event not found'}), 404

            # Check permissions
            if is_admin:
                can_delete = True
            elif is_gm and event['created_by'] == user_id:
                can_delete = True
            else:
                can_delete = False

            if not can_delete:
                cursor.close()
                return jsonify({'success': False, 'message': 'You do not have permission to delete this event'}), 403

            # Delete the event
            cursor.execute("DELETE FROM generalevents WHERE EventID = %s", (event_id,))
            mysql.connection.commit()
            cursor.close()

            return jsonify({'success': True, 'message': f'Event "{event["EventName"]}" deleted successfully'}), 200

        except Exception as e:
            print(f"Error deleting event: {str(e)}")
            import traceback
            traceback.print_exc()
            mysql.connection.rollback()
            return jsonify({'success': False, 'message': 'Failed to delete event'}), 500

    # ===================================
    # EVENT DELETION (MODAL)
    # ===================================
    @app.route('/delete-event', methods=['POST'])
    @login_required
    def delete_event_modal():
        """
        Delete an event from the modal view
        - Admins can delete any event
        - Game Managers can only delete events they created
        """
        try:
            user_id = session['id']
            data = request.get_json()
            event_id = data.get('event_id')

            if not event_id:
                return jsonify({'success': False, 'message': 'Event ID is required'}), 400

            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            # Get user permissions
            permissions = get_user_permissions(user_id)
            is_admin = permissions['is_admin']
            is_gm = permissions['is_gm']

            # Get event details
            cursor.execute("""
                SELECT EventID, EventName, created_by
                FROM generalevents
                WHERE EventID = %s
            """, (event_id,))
            event = cursor.fetchone()

            if not event:
                cursor.close()
                return jsonify({'success': False, 'message': 'Event not found'}), 404

            # Check permissions
            if is_admin:
                can_delete = True
            elif is_gm and event['created_by'] == user_id:
                can_delete = True
            else:
                can_delete = False

            if not can_delete:
                cursor.close()
                return jsonify(
                    {'success': False, 'message': 'You do not have permission to delete this event'}), 403

            # Delete the event
            cursor.execute("DELETE FROM generalevents WHERE EventID = %s", (event_id,))
            mysql.connection.commit()
            cursor.close()

            return jsonify({'success': True, 'message': f'Event "{event["EventName"]}" deleted successfully'}), 200

        except Exception as e:
            print(f"Error deleting event from modal: {str(e)}")
            import traceback
            traceback.print_exc()
            mysql.connection.rollback()
            return jsonify({'success': False, 'message': 'Failed to delete event'}), 500

    # ===================================
    # EVENT SUBSCRIPTIONS
    # ===================================
    @app.route('/api/event/<int:event_id>/subscription-status')
    @login_required
    def subscription_status(event_id):
        """Check if current user is subscribed to an event"""
        user_id = session['id']
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Check if user subscribed to this event
        cursor.execute("""
            SELECT * FROM event_subscriptions
            WHERE user_id=%s AND event_id=%s
        """, (user_id, event_id))
        subscription = cursor.fetchone()

        # Check global notification preference
        cursor.execute("""
            SELECT enable_notifications FROM notification_preferences
            WHERE user_id=%s
        """, (user_id,))
        pref = cursor.fetchone()
        cursor.close()

        return jsonify({
            'subscribed': bool(subscription),
            'notifications_enabled': pref['enable_notifications'] if pref else False
        })

    @app.route('/api/event/<int:event_id>/toggle-subscription', methods=['POST'])
    @login_required
    def toggle_subscription(event_id):
        """Subscribe or unsubscribe from event notifications"""
        user_id = session.get('id')
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Check global notification preference
            cursor.execute("""
                SELECT enable_notifications
                FROM notification_preferences
                WHERE user_id=%s
            """, (user_id,))
            pref = cursor.fetchone()
            notifications_enabled = pref and pref['enable_notifications'] == 1

            if not notifications_enabled:
                return jsonify({
                    'error': 'Global notifications are disabled. Enable them first in your preferences.'
                }), 403

            # Check if already subscribed
            cursor.execute("""
                SELECT * FROM event_subscriptions
                WHERE user_id=%s AND event_id=%s
            """, (user_id, event_id))
            subscription = cursor.fetchone()

            if subscription:
                # Unsubscribe
                cursor.execute("""
                    DELETE FROM event_subscriptions
                    WHERE user_id=%s AND event_id=%s
                """, (user_id, event_id))
                status = 'unsubscribed'
            else:
                # Subscribe
                cursor.execute("""
                    INSERT INTO event_subscriptions (user_id, event_id, subscribed_at)
                    VALUES (%s, %s, %s)
                """, (user_id, event_id, datetime.now()))
                status = 'subscribed'

            mysql.connection.commit()
            return jsonify({'status': status})

        except Exception as e:
            print("Error in toggle_subscription:", e)
            mysql.connection.rollback()
            return jsonify({'error': str(e)}), 500
        finally:
            cursor.close()


# ===================================
# HELPER FUNCTIONS
# ===================================
def _format_time(time_value):
    """Convert timedelta or time object to 12-hour format string with AM/PM"""
    if not time_value:
        return None

    if isinstance(time_value, timedelta):
        total_seconds = int(time_value.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
    else:
        # It's already a time object
        hours = time_value.hour
        minutes = time_value.minute

    # Convert to 12-hour format
    period = "AM" if hours < 12 else "PM"
    display_hour = hours % 12
    if display_hour == 0:
        display_hour = 12

    return f"{display_hour}:{minutes:02d} {period}"


def _check_if_ongoing(event_date, start_time_str, end_time_str, current_date, current_time):
    """Check if an event is currently ongoing"""
    if event_date != current_date or not start_time_str or not end_time_str:
        return False

    try:
        start_hour, start_min = map(int, start_time_str.split(':'))
        end_hour, end_min = map(int, end_time_str.split(':'))

        from datetime import time as dt_time
        start_time = dt_time(start_hour, start_min)
        end_time = dt_time(end_hour, end_min)

        return start_time <= current_time <= end_time
    except Exception as e:
        print(f"Error checking if event is ongoing: {str(e)}")
        return False