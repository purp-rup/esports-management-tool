"""
Scheduled Events Management
Handles creation, generation, and management of recurring team events
"""

from flask import request, jsonify, session
from datetime import datetime, timedelta
import MySQLdb.cursors
from dateutil.relativedelta import relativedelta
import calendar


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
        Only GMs can create scheduled events
        """
        try:
            data = request.get_json()
            user_id = session['id']

            # Validate required fields
            required_fields = ['team_id', 'event_name', 'event_type', 'day_of_week',
                             'start_time', 'end_time', 'frequency', 'visibility', 'end_date']

            for field in required_fields:
                if field not in data:
                    return jsonify({
                        'success': False,
                        'message': f'Missing required field: {field}'
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
                    (team_id, game_id, event_name, event_type, day_of_week, 
                     start_time, end_time, frequency, visibility, description, 
                     schedule_end_date, created_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    data['team_id'],
                    game_id,
                    data['event_name'],
                    data['event_type'],
                    data['day_of_week'],
                    data['start_time'],
                    data['end_time'],
                    data['frequency'],
                    data['visibility'],
                    data.get('description', ''),
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
            print(f"Error creating scheduled event: {str(e)}")
            import traceback
            traceback.print_exc()
            mysql.connection.rollback()
            return jsonify({
                'success': False,
                'message': 'Failed to create scheduled event'
            }), 500

    # ============================================
    # GET SCHEDULED EVENTS FOR TEAM
    # ============================================
    @app.route('/api/scheduled-events/team/<team_id>', methods=['GET'])
    @login_required
    def get_team_scheduled_events(team_id):
        """
        Get all active scheduled events for a team
        """
        try:
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                cursor.execute("""
                    SELECT 
                        se.*,
                        g.GameTitle,
                        u.firstname,
                        u.lastname
                    FROM scheduled_events se
                    JOIN games g ON se.game_id = g.GameID
                    JOIN users u ON se.created_by = u.id
                    WHERE se.team_id = %s AND se.is_active = TRUE
                    ORDER BY se.created_at DESC
                """, (team_id,))

                schedules = cursor.fetchall()

                # Format the response
                formatted_schedules = []
                for schedule in schedules:
                    formatted_schedules.append({
                        'schedule_id': schedule['schedule_id'],
                        'event_name': schedule['event_name'],
                        'event_type': schedule['event_type'],
                        'day_of_week': schedule['day_of_week'],
                        'day_of_week_name': calendar.day_name[schedule['day_of_week']],
                        'start_time': str(schedule['start_time']),
                        'end_time': str(schedule['end_time']),
                        'frequency': schedule['frequency'],
                        'visibility': schedule['visibility'],
                        'description': schedule['description'],
                        'schedule_end_date': schedule['schedule_end_date'].strftime('%Y-%m-%d'),
                        'game_title': schedule['GameTitle'],
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
        Delete a scheduled event (marks as inactive)
        Does NOT delete already-generated events
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

                # Mark as inactive
                cursor.execute("""
                    UPDATE scheduled_events 
                    SET is_active = FALSE 
                    WHERE schedule_id = %s
                """, (schedule_id,))

                mysql.connection.commit()

                return jsonify({
                    'success': True,
                    'message': 'Scheduled event deleted successfully'
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
    # CRON JOB - GENERATE UPCOMING EVENTS
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
            return 0

        # Determine start date for generation
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
            # Python weekday(): Monday=0, Sunday=6
            # Our day_of_week: Sunday=0, Saturday=6
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
                        # Create the event
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


def create_scheduled_event_instance(cursor, schedule, event_date, connection):
    """
    Create a single event instance from a schedule
    """
    try:
        # Create the event
        cursor.execute("""
            INSERT INTO generalevents
            (EventName, Date, StartTime, EndTime, Description, EventType, 
             Location, created_by, schedule_id, is_scheduled)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
        """, (
            schedule['event_name'],
            event_date,
            schedule['start_time'],
            schedule['end_time'],
            schedule['description'] or f"Recurring {schedule['event_type']}",
            schedule['event_type'],
            'Team Location',  # Default location
            schedule['created_by'],
            schedule['schedule_id']
        ))

        event_id = cursor.lastrowid

        # ============================================
        # ADD ASSOCIATIONS - THIS IS THE FIX!
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
        print(f"✓ Created scheduled event for {event_date}: {schedule['event_name']}")

    except Exception as e:
        print(f"Error creating event instance: {str(e)}")
        connection.rollback()
        raise