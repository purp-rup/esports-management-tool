"""
Scheduled Events Management
Handles creation, generation, and management of recurring team events
"""

from flask import request, jsonify, session
from datetime import datetime, timedelta
import MySQLdb.cursors
from dateutil.relativedelta import relativedelta
import calendar

"""
Formats schedule-related time to 12Hr format.
"""
def format_time_to_12hr(time_value):
    """
    Convert time object or timedelta to 12-hour format string
    """
    if not time_value:
        return None

    # Handle timedelta (from MySQL TIME type)
    if isinstance(time_value, timedelta):
        total_seconds = int(time_value.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
    else:
        # Handle time object
        hours = time_value.hour
        minutes = time_value.minute

    # Convert to 12-hour format
    period = "AM" if hours < 12 else "PM"
    display_hour = hours % 12
    if display_hour == 0:
        display_hour = 12

    return f"{display_hour}:{minutes:02d} {period}"

"""
Method to create a database element for a newly created schedule.
"""
def register_scheduled_events_routes(app, mysql, login_required, roles_required, get_user_permissions):
    """
    Register all scheduled event routes
    """

    # ============================================
    # CREATE SCHEDULED EVENT
    # ============================================
    @app.route('/api/scheduled-events/create', methods=['POST'])
    @login_required
    @roles_required('gm')
    def create_scheduled_event():
        """
        Create a new scheduled event that generates recurring events
        """
        try:
            data = request.get_json()
            user_id = session['id']

            # Validate required fields
            required_fields = ['team_id', 'event_name', 'event_type',
                               'start_time', 'end_time', 'frequency', 'visibility', 'end_date']

            for field in required_fields:
                if field not in data:
                    return jsonify({
                        'success': False,
                        'message': f'Missing required field: {field}'
                    }), 400

            # Additional validation based on frequency
            if data['frequency'] == 'Once':
                if 'specific_date' not in data or not data['specific_date']:
                    return jsonify({
                        'success': False,
                        'message': 'Specific date is required for one-time events'
                    }), 400
            else:
                if 'day_of_week' not in data or data['day_of_week'] is None:
                    return jsonify({
                        'success': False,
                        'message': 'Day of week is required for recurring events'
                    }), 400

            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # Get game_id from team
                cursor.execute("""
                    SELECT gameID FROM teams WHERE TeamID = %s
                """, (data['team_id'],))
                team = cursor.fetchone()

                if not team:
                    return jsonify({
                        'success': False,
                        'message': 'Team not found'
                    }), 404

                game_id = team['gameID']

                # Verify GM manages this game
                cursor.execute("""
                    SELECT gm_id FROM games WHERE GameID = %s
                """, (game_id,))
                game = cursor.fetchone()

                if not game or game['gm_id'] != user_id:
                    return jsonify({
                        'success': False,
                        'message': 'You do not have permission to create schedules for this team'
                    }), 403

                # Insert scheduled event
                cursor.execute("""
                    INSERT INTO scheduled_events 
                    (team_id, game_id, event_name, event_type, day_of_week, specific_date,
                     start_time, end_time, frequency, visibility, description, 
                     location, schedule_end_date, created_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    data['team_id'],
                    game_id,
                    data['event_name'],
                    data['event_type'],
                    data.get('day_of_week'),  # NULL for "Once"
                    data.get('specific_date'),  # NULL for recurring
                    data['start_time'],
                    data['end_time'],
                    data['frequency'],
                    data['visibility'],
                    data.get('description', ''),
                    data.get('location', 'TBD'),
                    data['end_date'],
                    user_id
                ))

                schedule_id = cursor.lastrowid
                mysql.connection.commit()

                # Generate initial events
                generate_events_for_schedule(cursor, schedule_id, mysql.connection)

                return jsonify({
                    'success': True,
                    'message': 'Scheduled event created successfully',
                    'schedule_id': schedule_id
                }), 201

            finally:
                cursor.close()

        except Exception as e:
            print(f"❌ Error creating scheduled event: {str(e)}")
            print(f"   Error type: {type(e).__name__}")
            import traceback
            traceback.print_exc()  # Print full stack trace
            mysql.connection.rollback()
            return jsonify({
                'success': False,
                'message': f'Failed to create scheduled event: {str(e)}'
            }), 500

    # ============================================
    # GET SCHEDULED EVENTS FOR TEAM
    # ============================================
    @app.route('/api/scheduled-events/team/<team_id>', methods=['GET'])
    @login_required
    def get_team_scheduled_events(team_id):
        """
        Get all active scheduled events for a team
        Includes team-specific, game_players, and game_community schedules
        """
        try:
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # First get the team's game_id
                cursor.execute("""
                    SELECT gameID FROM teams WHERE TeamID = %s
                """, (team_id,))

                team = cursor.fetchone()
                if not team:
                    return jsonify({
                        'success': False,
                        'message': 'Team not found'
                    }), 404

                game_id = team['gameID']

                # Get schedules that are:
                # 1. Team-specific (team_id matches)
                # 2. Game-wide for players (game_players visibility)
                # 3. Game-wide for community (game_community visibility)
                # EXCLUDE: all_members visibility (those should only show in next event card)
                cursor.execute("""
                    SELECT 
                        se.*,
                        g.GameTitle,
                        u.firstname,
                        u.lastname
                    FROM scheduled_events se
                    JOIN games g ON se.game_id = g.GameID
                    JOIN users u ON se.created_by = u.id
                    WHERE se.is_active = TRUE
                    AND se.game_id = %s
                    AND (
                        se.team_id = %s
                        OR se.visibility = 'game_players'
                        OR se.visibility = 'game_community'
                    )
                    AND se.visibility != 'all_members'
                    ORDER BY se.created_at DESC
                """, (game_id, team_id))

                schedules = cursor.fetchall()

                # Format the response
                formatted_schedules = []
                for schedule in schedules:
                    # Get team name if this is a team-specific schedule
                    team_name = None
                    if schedule['visibility'] == 'team' and schedule.get('team_id'):
                        cursor.execute("""
                            SELECT teamName FROM teams WHERE TeamID = %s
                        """, (schedule['team_id'],))
                        team_result = cursor.fetchone()
                        if team_result:
                            team_name = team_result['teamName']

                    formatted_schedules.append({
                        'schedule_id': schedule['schedule_id'],
                        'event_name': schedule['event_name'],
                        'event_type': schedule['event_type'],
                        'frequency': schedule['frequency'],
                        'day_of_week': schedule.get('day_of_week'),
                        'day_of_week_name': calendar.day_name[schedule['day_of_week']] if schedule.get('day_of_week') is not None else None,
                        'specific_date': schedule['specific_date'].strftime('%Y-%m-%d') if schedule.get('specific_date') else None,
                        'start_time': format_time_to_12hr(schedule['start_time']),
                        'end_time': format_time_to_12hr(schedule['end_time']),
                        'visibility': schedule['visibility'],
                        'description': schedule['description'],
                        'location': schedule['location'],
                        'schedule_end_date': schedule['schedule_end_date'].strftime('%Y-%m-%d'),
                        'game_title': schedule['GameTitle'],
                        'game_id': schedule['game_id'],  # ADD THIS LINE
                        'team_name': team_name,
                        'created_by_name': f"{schedule['firstname']} {schedule['lastname']}",
                        'last_generated': schedule['last_generated'].strftime('%Y-%m-%d') if schedule['last_generated'] else None
                    })

                return jsonify({
                    'success': True,
                    'schedules': formatted_schedules
                }), 200

            finally:
                cursor.close()

        except Exception as e:
            print(f"Error getting scheduled events: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to load scheduled events'
            }), 500

    # ============================================
    # DELETE SCHEDULED EVENT
    # ============================================
    @app.route('/api/scheduled-events/<int:schedule_id>', methods=['DELETE'])
    @login_required
    @roles_required('gm')
    def delete_scheduled_event(schedule_id):
        """
        Delete a scheduled event and all associated generated events
        """
        try:
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
            user_id = session['id']

            try:
                # Verify ownership/permission
                cursor.execute("""
                    SELECT se.*, g.gm_id
                    FROM scheduled_events se
                    JOIN games g ON se.game_id = g.GameID
                    WHERE se.schedule_id = %s
                """, (schedule_id,))

                schedule = cursor.fetchone()

                if not schedule:
                    return jsonify({
                        'success': False,
                        'message': 'Scheduled event not found'
                    }), 404

                if schedule['gm_id'] != user_id:
                    return jsonify({
                        'success': False,
                        'message': 'You do not have permission to delete this schedule'
                    }), 403

                # Step 1: Delete all associated events from generalevents
                cursor.execute("""
                    DELETE FROM generalevents 
                    WHERE schedule_id = %s
                """, (schedule_id,))

                deleted_events_count = cursor.rowcount

                # Step 2: Delete the schedule from scheduled_events
                cursor.execute("""
                    DELETE FROM scheduled_events 
                    WHERE schedule_id = %s
                """, (schedule_id,))

                mysql.connection.commit()

                return jsonify({
                    'success': True,
                    'message': f'Schedule deleted successfully. {deleted_events_count} associated event(s) removed.'
                }), 200

            finally:
                cursor.close()

        except Exception as e:
            print(f"Error deleting scheduled event: {str(e)}")
            mysql.connection.rollback()
            return jsonify({
                'success': False,
                'message': 'Failed to delete scheduled event'
            }), 500

    # ============================================
    # UPDATE SCHEDULED EVENT
    # ============================================
    @app.route('/api/scheduled-events/update', methods=['POST'])
    @login_required
    @roles_required('gm')
    def update_scheduled_event():
        """
        Update a scheduled event and all its generated events
        Cannot change frequency/timing - only metadata
        """
        try:
            data = request.get_json()
            user_id = session['id']
            schedule_id = data.get('schedule_id')

            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # Verify ownership/permission
                cursor.execute("""
                    SELECT se.*, g.gm_id
                    FROM scheduled_events se
                    JOIN games g ON se.game_id = g.GameID
                    WHERE se.schedule_id = %s
                """, (schedule_id,))

                schedule = cursor.fetchone()

                if not schedule:
                    return jsonify({
                        'success': False,
                        'message': 'Scheduled event not found'
                    }), 404

                if schedule['gm_id'] != user_id:
                    return jsonify({
                        'success': False,
                        'message': 'You do not have permission to edit this schedule'
                    }), 403

                # Update the schedule
                cursor.execute("""
                    UPDATE scheduled_events 
                    SET event_name = %s,
                        event_type = %s,
                        visibility = %s,
                        location = %s,
                        description = %s
                    WHERE schedule_id = %s
                """, (
                    data['event_name'],
                    data['event_type'],
                    data['visibility'],
                    data['location'],
                    data.get('description', ''),
                    schedule_id
                ))

                # Update all associated events in generalevents table
                cursor.execute("""
                    UPDATE generalevents
                    SET EventName = %s,
                        EventType = %s,
                        Location = %s,
                        Description = %s
                    WHERE schedule_id = %s
                """, (
                    data['event_name'],
                    data['event_type'],
                    data['location'],
                    data.get('description', ''),
                    schedule_id
                ))

                affected_events = cursor.rowcount
                mysql.connection.commit()

                return jsonify({
                    'success': True,
                    'message': f'Schedule updated successfully. {affected_events} event(s) updated.'
                }), 200

            finally:
                cursor.close()

        except Exception as e:
            print(f"Error updating scheduled event: {str(e)}")
            mysql.connection.rollback()
            return jsonify({
                'success': False,
                'message': 'Failed to update scheduled event'
            }), 500

    # ============================================
    # GENERATE UPCOMING EVENTS
    # ============================================
    @app.route('/api/scheduled-events/generate-all', methods=['POST'])
    def generate_all_scheduled_events():
        """
        Cron job endpoint to generate events for all active schedules
        Should be called daily
        """
        # TODO: Add authentication for cron jobs (API key, etc.)

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get all active schedules
            cursor.execute("""
                SELECT schedule_id 
                FROM scheduled_events 
                WHERE is_active = TRUE 
                AND schedule_end_date >= CURDATE()
            """)

            schedules = cursor.fetchall()
            generated_count = 0

            for schedule in schedules:
                count = generate_events_for_schedule(
                    cursor,
                    schedule['schedule_id'],
                    mysql.connection
                )
                generated_count += count

            return jsonify({
                'success': True,
                'message': f'Generated {generated_count} events',
                'schedules_processed': len(schedules)
            }), 200

        except Exception as e:
            print(f"Error in scheduled generation: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to generate events'
            }), 500
        finally:
            cursor.close()


# ============================================
# HELPER FUNCTIONS
# ============================================
"""
Method to build the frontend for scheduled events
@param - cursor is access to the database
@param - schedule_id is the id of the schedule whose events are generated
@param - connection is the conenction between events within a schedule
"""
def generate_events_for_schedule(cursor, schedule_id, connection):
    """
    Generate events for a schedule up to 2 months in advance
    Returns number of events created
    """
    try:
        # Get schedule details
        cursor.execute("""
            SELECT * FROM scheduled_events WHERE schedule_id = %s
        """, (schedule_id,))

        schedule = cursor.fetchone()

        # ADD THIS DEBUG
        print(f"🔍 DEBUG generate_events_for_schedule:")
        print(f"   schedule_id: {schedule_id}")
        print(f"   schedule found: {schedule is not None}")
        if schedule:
            print(f"   frequency: {schedule['frequency']}")
            print(f"   is_active: {schedule['is_active']}")
            print(f"   specific_date: {schedule.get('specific_date')}")

        if not schedule or not schedule['is_active']:
            print(f"   ❌ Schedule not found or not active")
            return 0

        # Handle "Once" frequency differently
        if schedule['frequency'] == 'Once':
            print(f"   ✅ Processing 'Once' event")
            event_date = schedule['specific_date']
            print(f"   event_date: {event_date}")

            # Check if event already exists
            cursor.execute("""
                SELECT EventID FROM generalevents
                WHERE schedule_id = %s AND Date = %s
            """, (schedule_id, event_date))

            existing = cursor.fetchone()
            print(f"   existing event: {existing}")

            if not existing:
                print(f"   📝 Creating event instance...")
                create_scheduled_event_instance(cursor, schedule, event_date, connection)

                # Update last_generated
                cursor.execute("""
                    UPDATE scheduled_events 
                    SET last_generated = %s 
                    WHERE schedule_id = %s
                """, (event_date, schedule_id))

                connection.commit()
                print(f"   ✅ Event created successfully")
                return 1
            else:
                print(f"   ⚠️  Event already exists")
            return 0

        # Original recurring logic for Weekly, Biweekly, Monthly
        today = datetime.now().date()
        last_generated = schedule['last_generated'] or today
        start_date = max(today, last_generated)

        # Generate up to 2 months ahead
        end_generation_date = min(
            today + timedelta(days=60),
            schedule['schedule_end_date']
        )

        # Find next occurrence
        current_date = start_date
        events_created = 0

        while current_date <= end_generation_date:
            # Check if this date matches the schedule's day of week
            python_weekday = current_date.weekday()
            our_day_of_week = (python_weekday + 1) % 7

            if our_day_of_week == schedule['day_of_week']:
                # Check frequency
                should_generate = check_frequency_match(
                    current_date,
                    start_date,
                    schedule['frequency']
                )

                if should_generate:
                    # Check if event already exists
                    cursor.execute("""
                        SELECT EventID FROM generalevents
                        WHERE schedule_id = %s AND Date = %s
                    """, (schedule_id, current_date))

                    if not cursor.fetchone():
                        create_scheduled_event_instance(
                            cursor,
                            schedule,
                            current_date,
                            connection
                        )
                        events_created += 1

            current_date += timedelta(days=1)

        # Update last_generated date
        cursor.execute("""
            UPDATE scheduled_events 
            SET last_generated = %s 
            WHERE schedule_id = %s
        """, (end_generation_date, schedule_id))

        connection.commit()
        return events_created

    except Exception as e:
        print(f"Error generating events for schedule {schedule_id}: {str(e)}")
        connection.rollback()
        return 0


def check_frequency_match(current_date, start_date, frequency):
    """
    Check if current date matches the frequency pattern
    """
    if frequency == 'Weekly':
        return True
    elif frequency == 'Biweekly':
        weeks_diff = (current_date - start_date).days // 7
        return weeks_diff % 2 == 0
    elif frequency == 'Monthly':
        # Same week of month
        return current_date.day // 7 == start_date.day // 7

    return False

"""
Method to create one scheduled event within a set list of scheduled events based on date and duration selected.
@param - cursor is the mysql selection
@param - schedule is the schedule for which an event is being made
@param - event_date is the date of the event if it has one
@param - connection is the connection between different scheduled events.
"""
def create_scheduled_event_instance(cursor, schedule, event_date, connection):
    """
    Create a single event instance from a schedule
    """
    try:
        # Get the game title for this schedule
        cursor.execute("""
            SELECT GameTitle FROM games WHERE GameID = %s
        """, (schedule['game_id'],))

        game_result = cursor.fetchone()
        game_title = game_result['GameTitle'] if game_result else None

        # Build event name with team suffix if it's team-specific
        event_name = schedule['event_name']
        if schedule['visibility'] == 'team' and schedule['team_id']:
            # Get team name
            cursor.execute("""
                SELECT teamName FROM teams WHERE TeamID = %s
            """, (schedule['team_id'],))

            team_result = cursor.fetchone()
            if team_result:
                # Append team name to event name if not already there
                team_name = team_result['teamName']
                if team_name not in event_name:
                    event_name = f"{event_name} ({team_name})"

        # Build game display string with team name if team-specific
        game_display = game_title
        if game_title and schedule['visibility'] == 'team' and schedule['team_id']:
            cursor.execute("""
                SELECT teamName FROM teams WHERE TeamID = %s
            """, (schedule['team_id'],))

            team_result = cursor.fetchone()
            if team_result:
                game_display = f"{game_title} ({team_result['teamName']})"

        # Create the event
        cursor.execute("""
            INSERT INTO generalevents
            (EventName, Date, StartTime, EndTime, Description, EventType, 
             Game, Location, created_by, schedule_id, is_scheduled)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
        """, (
            event_name,
            event_date,
            schedule['start_time'],
            schedule['end_time'],
            schedule['description'] or f"Recurring {schedule['event_type']}",
            schedule['event_type'],
            game_display,  # Now includes game title and optionally team name
            schedule['location'] or 'TBD',
            schedule['created_by'],
            schedule['schedule_id']
        ))

        event_id = cursor.lastrowid

        # ============================================
        # ADD ASSOCIATIONS
        # ============================================

        # Get all members of the team
        cursor.execute("""
            SELECT user_id 
            FROM team_members 
            WHERE team_id = %s
        """, (schedule['team_id'],))

        team_members = cursor.fetchall()

        # Associate event with each team member's game community
        for member in team_members:
            # Check if user is in the game's community
            cursor.execute("""
                SELECT * FROM in_communities 
                WHERE user_id = %s AND game_id = %s
            """, (member['user_id'], schedule['game_id']))

            if not cursor.fetchone():
                # Add them to the game community if not already there
                cursor.execute("""
                    INSERT INTO in_communities (user_id, game_id, joined_at)
                    VALUES (%s, %s, NOW())
                """, (member['user_id'], schedule['game_id']))

        connection.commit()
        print(f"✅ Created scheduled event for {event_date}: {event_name}")

    except Exception as e:
        print(f"Error creating event instance: {str(e)}")
        connection.rollback()
        raise