"""
Scheduled Events Management
Handles creation, generation, and management of recurring team events
"""

from flask import request, jsonify, session
from datetime import datetime, timedelta
import MySQLdb.cursors
from dateutil.relativedelta import relativedelta
import calendar
from EsportsManagementTool import get_current_time, localize_datetime, EST
from EsportsManagementTool.events import get_season_for_event_date

"""
Method to determine if a user is eligible to delete a schedule.
"""


def can_delete_schedule(cursor, schedule_id, user_id, is_developer):
    """
    Determine if a user can delete a scheduled event based on time-based rules.

    Rules:
    1. Developers can ALWAYS delete any schedule
    2. Game Managers for the schedule's game can delete within 24 hours of creation
    3. After 24 hours, only developers can delete

    Args:
        cursor: MySQL cursor
        schedule_id: ID of the schedule
        user_id: ID of the user attempting deletion
        is_developer: Whether user is a developer

    Returns:
        tuple: (can_delete: bool, reason: str)
    """
    from datetime import timedelta
    from EsportsManagementTool import get_current_time, localize_datetime

    # Developers can always delete
    if is_developer:
        return (True, "Developer privileges")

    # Fetch schedule creation info AND the game's GM
    cursor.execute("""
        SELECT se.created_at, g.gm_id, g.GameTitle
        FROM scheduled_events se
        JOIN games g ON se.game_id = g.gameID
        WHERE se.schedule_id = %s
    """, (schedule_id,))

    schedule = cursor.fetchone()

    if not schedule:
        return (False, "Schedule not found")

    # Check if user is the GM for this game
    if schedule['gm_id'] != user_id:
        return (False, f"Only the Game Manager for {schedule['GameTitle']} or a developer can delete this schedule")

    # Check if within 24-hour window
    if not schedule['created_at']:
        # If no creation timestamp, deny deletion (safety measure)
        return (False, "Schedule creation time not recorded")

    created_at = schedule['created_at']
    current_time = get_current_time()

    # Ensure both datetimes are timezone-aware for comparison
    if created_at.tzinfo is None:
        created_at = localize_datetime(created_at)

    time_since_creation = current_time - created_at
    within_24_hours = time_since_creation <= timedelta(hours=24)

    # GM can delete within 24 hours
    if within_24_hours:
        return (True, "Within 24-hour deletion window")
    else:
        hours_ago = int(time_since_creation.total_seconds() / 3600)
        return (False, f"Deletion window expired (created {hours_ago} hours ago)")


def get_schedule_deletion_time_remaining(created_at):
    """
    Get time remaining for deletion window

    Args:
        created_at: ISO timestamp of creation

    Returns:
        str: Human-readable time remaining or None if expired
    """
    from datetime import timedelta
    from EsportsManagementTool import get_current_time, localize_datetime

    if not created_at:
        return None

    if isinstance(created_at, str):
        from datetime import datetime
        created_at = datetime.fromisoformat(created_at)

    if created_at.tzinfo is None:
        created_at = localize_datetime(created_at)

    now = get_current_time()
    deletion_deadline = created_at + timedelta(hours=24)

    if now >= deletion_deadline:
        return None  # Window expired

    ms_remaining = (deletion_deadline - now).total_seconds() * 1000
    hours_remaining = int(ms_remaining / (1000 * 60 * 60))
    minutes_remaining = int((ms_remaining % (1000 * 60 * 60)) / (1000 * 60))

    if hours_remaining > 0:
        return f"{hours_remaining}h {minutes_remaining}m remaining"
    else:
        return f"{minutes_remaining}m remaining"

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
        NOW SUPPORTS: League association for Match events
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

            if data['event_type'] == 'Match':
                league_id = data.get('league_id')
                if not league_id:
                    return jsonify({
                        'success': False,
                        'message': 'League selection is required for Match events'
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

            # Validate league_id if provided for Match events
            league_id = data.get('league_id')
            if data['event_type'] == 'Match' and league_id:
                cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
                try:
                    # Verify the team is associated with this league
                    cursor.execute("""
                        SELECT 1 FROM team_leagues 
                        WHERE team_id = %s AND league_id = %s
                    """, (data['team_id'], league_id))
                    
                    if not cursor.fetchone():
                        return jsonify({
                            'success': False,
                            'message': 'Invalid league selection for this team'
                        }), 400
                finally:
                    cursor.close()

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

                # Only store team_id for team-specific schedules
                schedule_team_id = data['team_id'] if data['visibility'] == 'team' else None
                created_at = get_current_time()

                # Check if scheduled_events table has league_id column
                # If not, you need to add it with: ALTER TABLE scheduled_events ADD COLUMN league_id INT NULL;
                
                # Insert scheduled event WITH league_id support
                cursor.execute("""
                    INSERT INTO scheduled_events 
                    (team_id, game_id, event_name, event_type, day_of_week, specific_date,

                    start_time, end_time, frequency, visibility, description, 
                    location, schedule_end_date, created_by, league_id, created_at)

                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    schedule_team_id,
                    game_id,
                    data['event_name'],
                    data['event_type'],
                    data.get('day_of_week'),
                    data.get('specific_date'),
                    data['start_time'],
                    data['end_time'],
                    data['frequency'],
                    data['visibility'],
                    data.get('description', ''),
                    data.get('location', 'TBD'),
                    data['end_date'],
                    user_id,
                    league_id,  # NEW FIELD
                    created_at
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
            traceback.print_exc()
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
                        u.lastname,
                        l.name as league_name,
                        l.id as league_id  
                    FROM scheduled_events se
                    JOIN games g ON se.game_id = g.GameID
                    JOIN users u ON se.created_by = u.id
                    LEFT JOIN league l ON se.league_id = l.id 
                    WHERE se.is_active = TRUE
                    AND se.game_id = %s
                    AND (
                        -- Team-specific events: match team_id
                        (se.visibility = 'team' AND se.team_id = %s)
                        -- Broad visibility: show for ALL teams in this game
                        OR se.visibility IN ('game_players', 'game_community')
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
                        'league_id': schedule.get('league_id'),      
                        'league_name': schedule.get('league_name'),   
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
                        'game_id': schedule['game_id'],
                        'team_name': team_name,
                        'created_by': schedule['created_by'],
                        'created_by_name': f"{schedule['firstname']} {schedule['lastname']}",
                        'created_at': schedule['created_at'].isoformat() if schedule.get('created_at') else None,
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
        NOW WITH: Time-based deletion permissions (24-hour window)
        """
        try:
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
            user_id = session['id']

            try:
                # Get user permissions
                permissions = get_user_permissions(user_id)
                is_developer = permissions['is_developer']

                # Check deletion permissions using the new helper function
                can_delete, reason = can_delete_schedule(cursor, schedule_id, user_id, is_developer)

                if not can_delete:
                    cursor.close()
                    return jsonify({
                        'success': False,
                        'message': reason
                    }), 403

                # Get schedule name for confirmation message
                cursor.execute("""
                    SELECT event_name
                    FROM scheduled_events
                    WHERE schedule_id = %s
                """, (schedule_id,))

                schedule = cursor.fetchone()

                if not schedule:
                    cursor.close()
                    return jsonify({
                        'success': False,
                        'message': 'Schedule not found'
                    }), 404

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
                    'message': f'Schedule "{schedule["event_name"]}" deleted successfully. {deleted_events_count} associated event(s) removed.'
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
    # In scheduled_events.py - Update the update_scheduled_event route

    @app.route('/api/scheduled-events/update', methods=['POST'])
    @login_required
    @roles_required('gm')
    def update_scheduled_event():
        """
        Update a scheduled event and all its generated events
        Cannot change frequency/timing - only metadata
        NOW SUPPORTS: Updating league_id for Match events
        """
        try:
            data = request.get_json()
            user_id = session['id']
            schedule_id = data.get('schedule_id')

            # NEW: Validate league for Match events
            if data.get('event_type') == 'Match':
                league_id = data.get('league_id')
                if not league_id:
                    return jsonify({
                        'success': False,
                        'message': 'League selection is required for Match events'
                    }), 400

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

                # NEW: Validate league if provided
                league_id = data.get('league_id')
                if league_id and data.get('event_type') == 'Match':
                    cursor.execute("""
                        SELECT 1 FROM team_leagues 
                        WHERE team_id = %s AND league_id = %s
                    """, (schedule['team_id'], league_id))
                    
                    if not cursor.fetchone():
                        return jsonify({
                            'success': False,
                            'message': 'Selected league is not assigned to this team'
                        }), 400

                # Update the schedule WITH league_id
                cursor.execute("""
                    UPDATE scheduled_events 
                    SET event_name = %s,
                        event_type = %s,
                        visibility = %s,
                        location = %s,
                        description = %s,
                        league_id = %s
                    WHERE schedule_id = %s
                """, (
                    data['event_name'],
                    data['event_type'],
                    data['visibility'],
                    data['location'],
                    data.get('description', ''),
                    league_id,  # NEW: Update league_id
                    schedule_id
                ))

                # Update all associated events in generalevents table WITH league_id
                cursor.execute("""
                    UPDATE generalevents
                    SET EventName = %s,
                        EventType = %s,
                        Location = %s,
                        Description = %s,
                        league_id = %s
                    WHERE schedule_id = %s
                """, (
                    data['event_name'],
                    data['event_type'],
                    data['location'],
                    data.get('description', ''),
                    league_id,  # NEW: Update league_id for all events
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
    # Get team leagues for modal
    # ============================================
    @app.route('/api/teams/<team_id>/leagues', methods=['GET'])
    @login_required
    def get_team_leagues_for_schedule(team_id):
        """
        Get all leagues associated with a specific team
        """
        try:
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
            
            try:
                # Get leagues for this team
                cursor.execute("""
                    SELECT 
                        l.id,
                        l.name,
                        l.logo,
                        l.logo_mime_type
                    FROM league l
                    INNER JOIN team_leagues tl ON l.id = tl.league_id
                    WHERE tl.team_id = %s
                    ORDER BY l.name
                """, (team_id,))
                
                leagues = cursor.fetchall()
                
                # Format the response
                formatted_leagues = []
                for league in leagues:
                    formatted_leagues.append({
                        'id': league['id'],
                        'name': league['name'],
                        'has_logo': league['logo'] is not None
                    })
                
                return jsonify({
                    'success': True,
                    'leagues': formatted_leagues
                }), 200
                
            finally:
                cursor.close()
                
        except Exception as e:
            print(f"Error getting team leagues: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to load team leagues'
            }), 500

    @app.route('/api/scheduled-events/<int:schedule_id>/event-count', methods=['GET'])
    @login_required
    def get_schedule_event_count(schedule_id):
        """
        Get the count of events generated by a schedule
        """
        try:
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # Count events associated with this schedule
                cursor.execute("""
                    SELECT COUNT(*) as count
                    FROM generalevents
                    WHERE schedule_id = %s
                """, (schedule_id,))

                result = cursor.fetchone()
                count = result['count'] if result else 0

                return jsonify({
                    'success': True,
                    'count': count
                }), 200

            finally:
                cursor.close()

        except Exception as e:
            print(f"Error getting schedule event count: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to get event count',
                'count': 0
            }), 500

    @app.route('/api/scheduled-events/<int:schedule_id>/check-and-cleanup', methods=['POST'])
    @login_required
    def check_and_cleanup_schedule(schedule_id):
        """
        Check if a schedule has any remaining events and delete it if empty
        Returns info about whether cleanup occurred
        """
        try:
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # Check how many events are associated with this schedule
                cursor.execute("""
                    SELECT COUNT(*) as event_count
                    FROM generalevents
                    WHERE schedule_id = %s
                """, (schedule_id,))

                result = cursor.fetchone()
                event_count = result['event_count'] if result else 0

                # If no events remain, delete the schedule
                if event_count == 0:
                    # Get schedule name for response message
                    cursor.execute("""
                        SELECT event_name
                        FROM scheduled_events
                        WHERE schedule_id = %s
                    """, (schedule_id,))

                    schedule = cursor.fetchone()
                    schedule_name = schedule['event_name'] if schedule else 'Unknown'

                    # Delete the schedule
                    cursor.execute("""
                        DELETE FROM scheduled_events
                        WHERE schedule_id = %s
                    """, (schedule_id,))

                    mysql.connection.commit()

                    return jsonify({
                        'success': True,
                        'deleted': True,
                        'message': f'Schedule "{schedule_name}" was automatically deleted (no events remaining)',
                        'schedule_name': schedule_name
                    }), 200
                else:
                    return jsonify({
                        'success': True,
                        'deleted': False,
                        'remaining_events': event_count
                    }), 200

            finally:
                cursor.close()

        except Exception as e:
            print(f"Error in check-and-cleanup: {str(e)}")
            mysql.connection.rollback()
            return jsonify({
                'success': False,
                'message': 'Failed to check schedule'
            }), 500


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
        today = get_current_time().date()
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

            if python_weekday == schedule['day_of_week']:
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
    NOW INCLUDES: League assignment for match events
    """
    try:
        # Get the game title for this schedule
        cursor.execute("""
            SELECT GameTitle FROM games WHERE gameID = %s
        """, (schedule['game_id'],))

        game_result = cursor.fetchone()
        game_title = game_result['GameTitle'] if game_result else None

        # Build event name with team suffix if it's team-specific
        event_name = schedule['event_name']
        if schedule['visibility'] == 'team' and schedule['team_id']:
            cursor.execute("""
                SELECT teamName FROM teams WHERE TeamID = %s
            """, (schedule['team_id'],))

            team_result = cursor.fetchone()
            if team_result:
                team_name = team_result['teamName']
                if team_name not in event_name:
                    event_name = f"{event_name} ({team_name})"

        # Calculate season based on the event_date
        from EsportsManagementTool.events import get_season_for_event_date
        season_id = get_season_for_event_date(cursor, event_date)

        if season_id:
            print(f"   📅 Scheduled event on {event_date} assigned to season_id: {season_id}")
        else:
            print(f"   📅 Scheduled event on {event_date} has no season assignment")

        # Build game display string with team name if team-specific
        game_display = game_title
        if game_title and schedule['visibility'] == 'team' and schedule['team_id']:
            cursor.execute("""
                SELECT teamName FROM teams WHERE TeamID = %s
            """, (schedule['team_id'],))

            team_result = cursor.fetchone()
            if team_result:
                game_display = f"{game_title} ({team_result['teamName']})"

        # Only set team_id for team-specific events
        event_team_id = schedule['team_id'] if schedule['visibility'] == 'team' else None

        # Get league_id from schedule (will be None for non-Match events)
        league_id = schedule.get('league_id')

        # Insert into generalevents WITH league_id
        cursor.execute("""
            INSERT INTO generalevents
            (EventName, Date, StartTime, EndTime, Description, EventType, 
             Game, game_id, Location, created_by, schedule_id, is_scheduled,
             team_id, visibility, season_id, league_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s, %s, %s)
        """, (
            event_name,
            event_date,
            schedule['start_time'],
            schedule['end_time'],
            schedule['description'] or f"Recurring {schedule['event_type']}",
            schedule['event_type'],
            game_display,
            schedule['game_id'],
            schedule['location'] or 'TBD',
            schedule['created_by'],
            schedule['schedule_id'],
            event_team_id,
            schedule['visibility'],
            season_id,
            league_id  # NEW: Pass league_id to event
        ))

        event_id = cursor.lastrowid

        # Insert into event_games using game_id directly
        if schedule['game_id']:
            cursor.execute("""
                INSERT INTO event_games (event_id, game_id)
                VALUES (%s, %s)
            """, (event_id, schedule['game_id']))

            print(f"   ✅ Linked event {event_id} to game_id {schedule['game_id']}")

        # Add team member associations ONLY for team-specific events
        if schedule['team_id'] and schedule['visibility'] == 'team':
            cursor.execute("""
                SELECT user_id 
                FROM team_members 
                WHERE team_id = %s
            """, (schedule['team_id'],))

            team_members = cursor.fetchall()

            for member in team_members:
                cursor.execute("""
                    SELECT * FROM in_communities 
                    WHERE user_id = %s AND game_id = %s
                """, (member['user_id'], schedule['game_id']))

                if not cursor.fetchone():
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