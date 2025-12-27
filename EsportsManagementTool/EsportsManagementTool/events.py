"""
Event Management Routes
Consolidated module for all event-related functionality
"""
from flask import request, jsonify, session, render_template
from datetime import datetime, timedelta
import MySQLdb.cursors
from EsportsManagementTool import get_current_time, localize_datetime, EST

"""
Helper function to determine which season an event will be tied to.
@param - event_date is the date the event takes place. This is used to calculate which season it will be a part of.
"""
def get_season_for_event_date(cursor, event_date):
    """
    Determine which season an event belongs to based on its date.

    Logic:
    1. If event falls within an active or past season's date range, use that season
    2. If event is before all seasons, return None
    3. If event is between seasons, assign to the most recent previous season
    4. If event is after all seasons, assign to the most recent season

    Args:
        cursor: MySQL cursor
        event_date: Date object or string in YYYY-MM-DD format

    Returns:
        int or None: season_id to assign, or None if no seasons exist
    """
    from datetime import datetime

    # Convert string to date if needed
    if isinstance(event_date, str):
        event_date = datetime.strptime(event_date, '%Y-%m-%d').date()

    try:
        # Check if event falls within any season's date range
        cursor.execute("""
            SELECT season_id, season_name, start_date, end_date
            FROM seasons
            WHERE %s BETWEEN start_date AND end_date
            ORDER BY start_date DESC
            LIMIT 1
        """, (event_date,))

        direct_match = cursor.fetchone()
        if direct_match:
            print(f"   📅 Event date {event_date} falls within season '{direct_match['season_name']}'")
            return direct_match['season_id']

        # Event doesn't fall within any season - find the most recent previous season
        cursor.execute("""
            SELECT season_id, season_name, start_date, end_date
            FROM seasons
            WHERE end_date < %s
            ORDER BY end_date DESC
            LIMIT 1
        """, (event_date,))

        previous_season = cursor.fetchone()
        if previous_season:
            print(
                f"   📅 Event date {event_date} is after season '{previous_season['season_name']}' (ended {previous_season['end_date']})")
            return previous_season['season_id']

        # Event is before all seasons - check if there are any future seasons
        cursor.execute("""
            SELECT season_id, season_name, start_date, end_date
            FROM seasons
            WHERE start_date > %s
            ORDER BY start_date ASC
            LIMIT 1
        """, (event_date,))

        future_season = cursor.fetchone()
        if future_season:
            print(
                f"   📅 Event date {event_date} is before all seasons (next season: '{future_season['season_name']}' starts {future_season['start_date']})")
            return None  # Event is before any season exists

        # No seasons exist at all
        print(f"   📅 No seasons defined in system")
        return None

    except Exception as e:
        print(f"   ❌ Error determining season for event date {event_date}: {str(e)}")
        return None


def can_delete_event(cursor, event_id, user_id, is_developer, is_admin):
    """
    Determine if a user can delete an event based on time-based rules.

    Rules:
    1. Developers can ALWAYS delete any event
    2. Admins can delete ANY event within 24 hours of creation
    3. GMs can delete their OWN events within 24 hours of creation
    4. After 24 hours, only developers can delete

    Args:
        cursor: MySQL cursor
        event_id: ID of the event
        user_id: ID of the user attempting deletion
        is_developer: Whether user is a developer
        is_admin: Whether user is an admin

    Returns:
        tuple: (can_delete: bool, reason: str)
    """
    # Developers can always delete
    if is_developer:
        return (True, "Developer privileges")

    # Fetch event creation info
    cursor.execute("""
        SELECT created_by, created_at
        FROM generalevents
        WHERE EventID = %s
    """, (event_id,))

    event = cursor.fetchone()

    if not event:
        return (False, "Event not found")

    # Check if within 24-hour window
    if not event['created_at']:
        # If no creation timestamp, deny deletion (safety measure)
        return (False, "Event creation time not recorded")

    created_at = event['created_at']
    current_time = get_current_time()

    # Ensure both datetimes are timezone-aware for comparison
    if created_at.tzinfo is None:
        created_at = localize_datetime(created_at)

    time_since_creation = current_time - created_at
    within_24_hours = time_since_creation <= timedelta(hours=24)

    # Admins can delete ANY event within 24 hours
    if is_admin:
        if within_24_hours:
            return (True, "Admin privileges - within 24-hour window")
        else:
            hours_ago = int(time_since_creation.total_seconds() / 3600)
            return (False, f"Admin deletion window expired (created {hours_ago} hours ago)")

    # GMs can only delete events THEY created within 24 hours
    if event['created_by'] != user_id:
        return (False, "Only the event creator, an admin (within 24h), or a developer can delete this event")

    # User is the creator - check time window
    if within_24_hours:
        return (True, "Within 24-hour deletion window")
    else:
        hours_ago = int(time_since_creation.total_seconds() / 3600)
        return (False, f"Deletion window expired (created {hours_ago} hours ago)")

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
    @roles_required('admin', 'gm', 'developer')
    def eventRegister():
        """
        Create a new event
        NOW INCLUDES: created_at timestamp for deletion tracking
        """
        msg = ''
        if request.method == 'POST':
            eventName = request.form.get('eventName', '').strip()
            eventDate = request.form.get('eventDate', '').strip()
            eventType = request.form.get('eventType', '').strip()
            games_json = request.form.get('games', '[]')
            startTime = request.form.get('startTime', '').strip()
            endTime = request.form.get('endTime', '').strip()
            eventDescription = request.form.get('eventDescription', '').strip()
            location = request.form.get('eventLocation', '').strip()

            if eventName and eventDate and eventType and startTime and endTime and eventDescription:
                cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
                try:
                    import json

                    print("\n" + "=" * 60)
                    print(f"🎮 Creating Event: {eventName}")
                    print("=" * 60)

                    selected_games = json.loads(games_json)
                    game_display = ', '.join(selected_games) if selected_games else None

                    # Get primary game_id
                    primary_game_id = None
                    if selected_games:
                        first_game_title = selected_games[0]
                        cursor.execute('SELECT gameID FROM games WHERE GameTitle = %s', (first_game_title,))
                        game_result = cursor.fetchone()
                        if game_result:
                            primary_game_id = game_result['gameID']

                    # Determine season
                    season_id = get_season_for_event_date(cursor, eventDate)

                    # Get current timestamp for created_at
                    created_at = get_current_time()

                    # Insert event with created_at timestamp
                    cursor.execute(
                        'INSERT INTO generalevents (EventName, Date, StartTime, EndTime, Description, EventType, Location, Game, game_id, created_by, season_id, created_at) '
                        'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                        (eventName, eventDate, startTime, endTime, eventDescription, eventType, location, game_display,
                         primary_game_id, session['id'], season_id, created_at))

                    event_id = cursor.lastrowid
                    print(f"   ✅ Created event_id: {event_id} at {created_at}")

                    # Insert games into event_games table
                    if selected_games:
                        for game_title in selected_games:
                            cursor.execute('SELECT gameID FROM games WHERE GameTitle = %s', (game_title,))
                            game_result = cursor.fetchone()
                            if game_result:
                                game_id = game_result['gameID']
                                cursor.execute(
                                    'INSERT IGNORE INTO event_games (event_id, game_id) VALUES (%s, %s)',
                                    (event_id, game_id)
                                )

                    mysql.connection.commit()
                    msg = 'Event Registered!\nYou have 24 hours to delete this event.'

                    if request.headers.get(
                            'X-Requested-With') == 'XMLHttpRequest' or request.accept_mimetypes.accept_json:
                        return jsonify({'success': True, 'message': msg}), 200

                except Exception as e:
                    mysql.connection.rollback()
                    msg = f'Error: {str(e)}'
                    print(f"\n❌ EXCEPTION in eventRegister: {str(e)}")
                    import traceback
                    traceback.print_exc()

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
            is_developer = permissions['is_developer']
            is_gm = permissions['is_gm']

            # Get filter parameters
            event_filter = request.args.get('filter', 'all')
            event_type_filter = request.args.get('event_type', '').lower()
            game_filter = request.args.get('game', '')
            season_id = request.args.get('season_id', '')

            # Get current date and time
            now = get_current_time()
            current_date = now.date()
            current_time = now.time()

            # If no season specified, default to active season for ALL users
            if not season_id:
                cursor.execute("""
                    SELECT season_id 
                    FROM seasons 
                    WHERE is_active = 1 
                    LIMIT 1
                """)
                active_season = cursor.fetchone()
                if active_season:
                    season_id = active_season['season_id']
                    print(f"   📅 No season specified, defaulting to active season: {season_id}")

            # Build base conditions
            conditions = []
            params = []

            # Date filter
            if season_id:
                conditions.append("ge.season_id = %s")
                params.append(season_id)

            if event_filter == 'upcoming':
                end_date = current_date + timedelta(days=7)
                conditions.append("ge.Date >= %s AND ge.Date <= %s")
                params.extend([current_date, end_date])
            elif event_filter == 'upcoming14':
                end_date = current_date + timedelta(days=14)
                conditions.append("ge.Date >= %s AND ge.Date <= %s")
                params.extend([current_date, end_date])
            elif event_filter == 'past30':
                start_date = current_date - timedelta(days=30)
                conditions.append("ge.Date >= %s AND ge.Date < %s")
                params.extend([start_date, current_date])
            elif event_filter == 'created_by_me':
                # Only allow this filter for admins, GMs, and Developers
                if not (is_admin or is_gm or is_developer):
                    return jsonify({'success': False, 'message': 'Unauthorized filter'}), 403
                conditions.append("ge.created_by = %s")
                params.append(user_id)
            elif event_filter == 'type' and event_type_filter:
                conditions.append("LOWER(ge.EventType) = %s")
                params.append(event_type_filter)
            elif event_filter == 'game' and game_filter:
                # Get game_id from game title
                cursor.execute('SELECT gameID FROM games WHERE GameTitle = %s', (game_filter,))
                game_result = cursor.fetchone()

                if game_result:
                    game_id = game_result['gameID']
                    conditions.append("""
                        ge.EventID IN (
                            SELECT eg.event_id 
                            FROM event_games eg 
                            WHERE eg.game_id = %s
                        )
                    """)
                    params.append(game_id)

            # Build WHERE clause
            where_clause = " AND ".join(conditions) if conditions else "1=1"

            # Determine sort order (upcoming filters should sort ascending, others descending)
            is_upcoming_filter = event_filter in ['upcoming', 'upcoming14']

            # Add visibility filtering - UPDATED TO INCLUDE GM CREATOR ACCESS
            visibility_clause = """
                (
                    ge.schedule_id IS NULL
                    OR se.created_by = %s
                    OR se.visibility = 'all_members'
                    OR (se.visibility = 'team' AND EXISTS (
                        SELECT 1 FROM team_members tm 
                        WHERE tm.team_id = se.team_id AND tm.user_id = %s
                    ))
                    OR (se.visibility = 'game_players' AND EXISTS (
                        SELECT 1 FROM team_members tm
                        JOIN teams t ON tm.team_id = t.TeamID
                        WHERE t.gameID = se.game_id AND tm.user_id = %s
                    ))
                    OR (se.visibility = 'game_community' AND EXISTS (
                        SELECT 1 FROM in_communities ic
                        WHERE ic.game_id = se.game_id AND ic.user_id = %s
                    ))
                )
            """

            # Handle "subscribed" filter - applies to all users
            if event_filter == 'subscribed':
                query = f"""
                    SELECT 
                        ge.EventID, ge.EventName, ge.Date, ge.StartTime, ge.EndTime,
                        ge.EventType, ge.Game, ge.Location, ge.Description, ge.created_by,
                        ge.is_scheduled, ge.schedule_id, ge.created_at,
                        s.season_name, s.is_active as season_is_active
                    FROM generalevents ge
                    LEFT JOIN scheduled_events se ON ge.schedule_id = se.schedule_id
                    LEFT JOIN seasons s ON ge.season_id = s.season_id
                    INNER JOIN event_subscriptions es ON ge.EventID = es.event_id
                    WHERE {where_clause} AND es.user_id = %s
                    AND {visibility_clause}
                    ORDER BY ge.Date DESC, ge.StartTime DESC
                """
                params.append(user_id)
                params.extend([user_id, user_id, user_id, user_id])  # For visibility clause
                cursor.execute(query, tuple(params))

            # Build query based on user role
            elif is_admin or is_developer:
                query = f"""
                    SELECT 
                        ge.EventID, ge.EventName, ge.Date, ge.StartTime, ge.EndTime,
                        ge.EventType, ge.Game, ge.Location, ge.Description, ge.created_by,
                        ge.is_scheduled, ge.schedule_id, ge.created_at,
                        s.season_name, s.is_active as season_is_active
                    FROM generalevents ge
                    LEFT JOIN scheduled_events se ON ge.schedule_id = se.schedule_id
                    LEFT JOIN seasons s ON ge.season_id = s.season_id
                    WHERE {where_clause}
                    AND {visibility_clause}
                    ORDER BY ge.Date {'ASC' if is_upcoming_filter else 'DESC'}, 
                             ge.StartTime {'ASC' if is_upcoming_filter else 'DESC'}
                """
                params.extend([user_id, user_id, user_id, user_id])  # For visibility clause
                cursor.execute(query, tuple(params))

            elif is_gm:
                query = f"""
                    SELECT 
                        ge.EventID, ge.EventName, ge.Date, ge.StartTime, ge.EndTime,
                        ge.EventType, ge.Game, ge.Location, ge.Description, ge.created_by,
                        ge.is_scheduled, ge.schedule_id, ge.created_at,
                        s.season_name, s.is_active as season_is_active
                    FROM generalevents ge
                    LEFT JOIN scheduled_events se ON ge.schedule_id = se.schedule_id
                    LEFT JOIN seasons s ON ge.season_id = s.season_id
                    WHERE {where_clause}
                    AND {visibility_clause}
                    ORDER BY ge.Date {'ASC' if is_upcoming_filter else 'DESC'}, 
                             ge.StartTime {'ASC' if is_upcoming_filter else 'DESC'}
                """
                params.extend([user_id, user_id, user_id, user_id])  # For visibility clause
                cursor.execute(query, tuple(params))

            else:
                # Regular users see ALL events (with visibility filtering)
                query = f"""
                    SELECT 
                        ge.EventID, ge.EventName, ge.Date, ge.StartTime, ge.EndTime,
                        ge.EventType, ge.Game, ge.Location, ge.Description, ge.created_by,
                        ge.is_scheduled, ge.schedule_id, ge.created_at,
                        s.season_name, s.is_active as season_is_active
                    FROM generalevents ge
                    LEFT JOIN scheduled_events se ON ge.schedule_id = se.schedule_id
                    LEFT JOIN seasons s ON ge.season_id = s.season_id
                    WHERE {where_clause}
                    AND {visibility_clause}
                    ORDER BY ge.Date {'ASC' if is_upcoming_filter else 'DESC'}, 
                             ge.StartTime {'ASC' if is_upcoming_filter else 'DESC'}
                """
                params.extend([user_id, user_id, user_id, user_id])  # For visibility clause
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
                    'created_at': event['created_at'].isoformat() if event['created_at'] else None,
                    'is_scheduled': event.get('is_scheduled', False),
                    'schedule_id': event.get('schedule_id'),
                    'season_id': event.get('season_id'),
                    'season_name': event.get('season_name'),
                    'season_is_active': event.get('season_is_active', 0),
                    'league_id': event.get('league_id') 
                }
                events_list.append(event_data)

            return jsonify({
                'success': True,
                'events': events_list,
                'is_admin': is_admin,
                'is_gm': is_gm,
                'is_developer': is_developer
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
            # Gather event and season data
            cursor.execute("""
                SELECT ge.*, s.season_name, s.is_active as season_is_active
                FROM generalevents ge
                LEFT JOIN seasons s ON ge.season_id = s.season_id
                WHERE ge.EventID = %s
            """, (event_id,))

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
                'created_by': event.get('created_by'),
                'created_at': event['created_at'].isoformat() if event.get('created_at') else None,
                'season_id': event.get('season_id'),
                'season_name': event.get('season_name'),
                'season_is_active': event.get('season_is_active', 0)
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
        Edit an existing event with multi-game support
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
            is_developer = permissions['is_developer']
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
            elif is_developer:
                can_edit = True
            elif is_gm and event['created_by'] == user_id:
                can_edit = True
            else:
                can_edit = False

            if not can_edit:
                cursor.close()
                return jsonify({'success': False, 'message': 'You do not have permission to edit this event'}), 403

            # Parse games JSON
            import json
            games_json = data.get('games', '[]')
            selected_games = json.loads(games_json) if isinstance(games_json, str) else games_json

            # Build game display string
            game_display = ', '.join(selected_games) if selected_games else None

            # Get primary game_id (first selected game)
            primary_game_id = None
            if selected_games:
                first_game_title = selected_games[0]
                cursor.execute('SELECT gameID FROM games WHERE GameTitle = %s', (first_game_title,))
                game_result = cursor.fetchone()
                if game_result:
                    primary_game_id = game_result['gameID']
            league_id = data.get('league_id')

            # ============================================
            # RECALCULATE SEASON BASED ON NEW DATE
            # ============================================
            new_event_date = data['event_date']
            season_id = get_season_for_event_date(cursor, new_event_date)

            if season_id:
                print(f"   📅 Updated event date {new_event_date} assigned to season_id: {season_id}")
            else:
                print(f"   📅 Updated event date {new_event_date} has no season assignment")

            # Update the event
            cursor.execute("""
                UPDATE generalevents
                SET EventName = %s, EventType = %s, Game = %s, game_id = %s, Date = %s,
                    StartTime = %s, EndTime = %s, Location = %s, Description = %s, 
                    season_id = %s, league_id = %s
                WHERE EventID = %s
            """, (
                data['event_name'],
                data['event_type'],
                game_display,
                primary_game_id,
                data['event_date'],
                data['start_time'],
                data['end_time'],
                data['location'],
                data['description'],
                season_id,
                int(league_id) if league_id else None, 
                event_id
            ))

            # Delete existing game associations
            cursor.execute('DELETE FROM event_games WHERE event_id = %s', (event_id,))

            # Insert new game associations
            if selected_games:
                for game_title in selected_games:
                    cursor.execute('SELECT gameID FROM games WHERE GameTitle = %s', (game_title,))
                    game_result = cursor.fetchone()
                    if game_result:
                        game_id = game_result['gameID']
                        cursor.execute(
                            'INSERT IGNORE INTO event_games (event_id, game_id) VALUES (%s, %s)',
                            (event_id, game_id)
                        )

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
        Delete an event with time-based permissions
        REFACTORED: 24-hour window for creators, always for developers
        NOW INCLUDES: Automatic schedule cleanup when last event is deleted
        """
        try:
            user_id = session['id']
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            permissions = get_user_permissions(user_id)
            is_developer = permissions['is_developer']
            is_admin = permissions['is_admin']

            # Check deletion permissions
            can_delete, reason = can_delete_event(cursor, event_id, user_id, is_developer, is_admin)

            if not can_delete:
                cursor.close()
                return jsonify({'success': False, 'message': reason}), 403

            # Get event details (including schedule_id)
            cursor.execute("""
                SELECT EventName, schedule_id 
                FROM generalevents 
                WHERE EventID = %s
            """, (event_id,))
            event = cursor.fetchone()

            if not event:
                cursor.close()
                return jsonify({'success': False, 'message': 'Event not found'}), 404

            event_name = event['EventName']
            schedule_id = event.get('schedule_id')

            # Delete the event
            cursor.execute("DELETE FROM generalevents WHERE EventID = %s", (event_id,))
            mysql.connection.commit()

            # If event was from a schedule, check if schedule should be cleaned up
            if schedule_id:
                cursor.execute("""
                    SELECT COUNT(*) as event_count
                    FROM generalevents
                    WHERE schedule_id = %s
                """, (schedule_id,))

                result = cursor.fetchone()
                event_count = result['event_count'] if result else 0

                # If no events remain, delete the schedule
                if event_count == 0:
                    cursor.execute("""
                        SELECT event_name
                        FROM scheduled_events
                        WHERE schedule_id = %s
                    """, (schedule_id,))

                    schedule = cursor.fetchone()
                    schedule_name = schedule['event_name'] if schedule else 'Unknown'

                    cursor.execute("""
                        DELETE FROM scheduled_events
                        WHERE schedule_id = %s
                    """, (schedule_id,))

                    mysql.connection.commit()
                    cursor.close()

                    return jsonify({
                        'success': True,
                        'message': f'Event "{event_name}" deleted successfully.',
                        'schedule_deleted': True,
                        'schedule_name': schedule_name
                    }), 200

            cursor.close()
            return jsonify({
                'success': True,
                'message': f'Event "{event_name}" deleted successfully',
                'schedule_deleted': False
            }), 200

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
        Delete an event from the modal view with time-based permissions
        REFACTORED: 24-hour window for creators, always for developers
        NOW INCLUDES: Automatic schedule cleanup when last event is deleted
        """
        try:
            user_id = session['id']
            data = request.get_json()
            event_id = data.get('event_id')

            if not event_id:
                return jsonify({'success': False, 'message': 'Event ID is required'}), 400

            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            permissions = get_user_permissions(user_id)
            is_developer = permissions['is_developer']
            is_admin = permissions['is_admin']

            # Check deletion permissions
            can_delete, reason = can_delete_event(cursor, event_id, user_id, is_developer, is_admin)

            if not can_delete:
                cursor.close()
                return jsonify({'success': False, 'message': reason}), 403

            # Get event details (including schedule_id)
            cursor.execute("""
                SELECT EventName, schedule_id 
                FROM generalevents 
                WHERE EventID = %s
            """, (event_id,))
            event = cursor.fetchone()

            if not event:
                cursor.close()
                return jsonify({'success': False, 'message': 'Event not found'}), 404

            event_name = event['EventName']
            schedule_id = event.get('schedule_id')

            # Delete the event
            cursor.execute("DELETE FROM generalevents WHERE EventID = %s", (event_id,))
            mysql.connection.commit()

            # If event was from a schedule, check if schedule should be cleaned up
            if schedule_id:
                cursor.execute("""
                    SELECT COUNT(*) as event_count
                    FROM generalevents
                    WHERE schedule_id = %s
                """, (schedule_id,))

                result = cursor.fetchone()
                event_count = result['event_count'] if result else 0

                # If no events remain, delete the schedule
                if event_count == 0:
                    cursor.execute("""
                        SELECT event_name
                        FROM scheduled_events
                        WHERE schedule_id = %s
                    """, (schedule_id,))

                    schedule = cursor.fetchone()
                    schedule_name = schedule['event_name'] if schedule else 'Unknown'

                    cursor.execute("""
                        DELETE FROM scheduled_events
                        WHERE schedule_id = %s
                    """, (schedule_id,))

                    mysql.connection.commit()
                    cursor.close()

                    return jsonify({
                        'success': True,
                        'message': f'Event "{event_name}" deleted successfully.',
                        'schedule_deleted': True,
                        'schedule_name': schedule_name
                    }), 200

            cursor.close()
            return jsonify({
                'success': True,
                'message': f'Event "{event_name}" deleted successfully',
                'schedule_deleted': False
            }), 200

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
                """, (user_id, event_id, get_current_time()))
                status = 'subscribed'

            mysql.connection.commit()
            return jsonify({'status': status})

        except Exception as e:
            print("Error in toggle_subscription:", e)
            mysql.connection.rollback()
            return jsonify({'error': str(e)}), 500
        finally:
            cursor.close()

    @app.route('/api/seasons/past', methods=['GET'])
    @login_required
    @roles_required('admin', 'developer')
    def get_past_seasons():
        """
        Get list of past (inactive) seasons for filtering
        Only accessible to admins and developers
        """
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("""
                SELECT season_id, season_name, start_date, end_date, is_active
                FROM seasons
                WHERE is_active = 0
                ORDER BY end_date DESC
            """)

            seasons = cursor.fetchall()

            # Format dates
            formatted_seasons = []
            for season in seasons:
                formatted_seasons.append({
                    'season_id': season['season_id'],
                    'season_name': season['season_name'],
                    'start_date': season['start_date'].strftime('%Y-%m-%d'),
                    'end_date': season['end_date'].strftime('%Y-%m-%d'),
                    'is_active': season['is_active']
                })

            return jsonify({
                'success': True,
                'seasons': formatted_seasons
            })

        except Exception as e:
            print(f"Error fetching past seasons: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to fetch past seasons'
            }), 500
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