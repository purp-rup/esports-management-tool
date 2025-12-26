"""
Team Statistics Management
Handles match results and team performance tracking
"""

from flask import request, jsonify, session
from datetime import datetime, time
import MySQLdb.cursors


def register_team_stats_routes(app, mysql, login_required, roles_required, get_user_permissions):
    """
    Register all team statistics routes
    """

    # ============================================
    # GET TEAM STATISTICS
    # ============================================
    @app.route('/api/teams/<team_id>/stats', methods=['GET'])
    @login_required
    def get_team_stats(team_id):
        """
        Get statistics for a specific team including:
        - Win/Loss record (optionally filtered by league)
        - Win percentage
        - Match history with results
        - League filter dropdown data
        """
        try:
            # Get optional league filter from query params
            league_id = request.args.get('league_id', type=int)
            
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # Verify team exists and get game_id
                cursor.execute("""
                    SELECT t.gameID, g.GameTitle 
                    FROM teams t
                    JOIN games g ON t.gameID = g.GameID
                    WHERE t.TeamID = %s
                """, (team_id,))

                team = cursor.fetchone()
                if not team:
                    return jsonify({
                        'success': False,
                        'message': 'Team not found'
                    }), 404

                # Get all leagues associated with this team for filter dropdown
                cursor.execute("""
                    SELECT 
                        l.id,
                        l.name
                    FROM league l
                    INNER JOIN team_leagues tl ON l.id = tl.league_id
                    WHERE tl.team_id = %s
                    ORDER BY l.name
                """, (team_id,))
                
                team_leagues = cursor.fetchall()

                # Calculate wins and losses (with optional league filter)
                if league_id:
                    cursor.execute("""
                        SELECT 
                            SUM(CASE WHEN mr.result = 'win' THEN 1 ELSE 0 END) as wins,
                            SUM(CASE WHEN mr.result = 'loss' THEN 1 ELSE 0 END) as losses
                        FROM match_results mr
                        INNER JOIN generalevents ge ON mr.event_id = ge.EventID
                        WHERE mr.team_id = %s
                        AND ge.league_id = %s
                    """, (team_id, league_id))
                else:
                    cursor.execute("""
                        SELECT 
                            SUM(CASE WHEN mr.result = 'win' THEN 1 ELSE 0 END) as wins,
                            SUM(CASE WHEN mr.result = 'loss' THEN 1 ELSE 0 END) as losses
                        FROM match_results mr
                        INNER JOIN generalevents ge ON mr.event_id = ge.EventID
                        WHERE mr.team_id = %s
                    """, (team_id,))

                stats = cursor.fetchone()
                wins = int(stats['wins']) if stats['wins'] is not None else 0
                losses = int(stats['losses']) if stats['losses'] is not None else 0

                # Get match history with results (with optional league filter)
                if league_id:
                    cursor.execute("""
                        SELECT 
                            ge.EventID as event_id,
                            ge.EventName as name,
                            ge.Date as date,
                            ge.StartTime as start_time,
                            ge.Location as location,
                            ge.league_id,
                            l.name as league_name,
                            mr.result,
                            mr.notes,
                            mr.recorded_at,
                            u.firstname,
                            u.lastname
                        FROM generalevents ge
                        LEFT JOIN match_results mr ON ge.EventID = mr.event_id AND mr.team_id = %s
                        LEFT JOIN users u ON mr.recorded_by = u.id
                        LEFT JOIN league l ON ge.league_id = l.id
                        WHERE ge.EventType = 'Match'
                        AND ge.team_id = %s
                        AND ge.league_id = %s
                        AND (
                            ge.Date < CURDATE()
                            OR (ge.Date = CURDATE() AND ge.StartTime <= CURTIME())
                        )
                        ORDER BY ge.Date DESC, ge.StartTime DESC
                        LIMIT 50
                    """, (team_id, team_id, league_id))
                else:
                    cursor.execute("""
                        SELECT 
                            ge.EventID as event_id,
                            ge.EventName as name,
                            ge.Date as date,
                            ge.StartTime as start_time,
                            ge.Location as location,
                            ge.league_id,
                            l.name as league_name,
                            mr.result,
                            mr.notes,
                            mr.recorded_at,
                            u.firstname,
                            u.lastname
                        FROM generalevents ge
                        LEFT JOIN match_results mr ON ge.EventID = mr.event_id AND mr.team_id = %s
                        LEFT JOIN users u ON mr.recorded_by = u.id
                        LEFT JOIN league l ON ge.league_id = l.id
                        WHERE ge.EventType = 'Match'
                        AND ge.team_id = %s
                        AND (
                            ge.Date < CURDATE()
                            OR (ge.Date = CURDATE() AND ge.StartTime <= CURTIME())
                        )
                        ORDER BY ge.Date DESC, ge.StartTime DESC
                        LIMIT 50
                    """, (team_id, team_id))

                match_events = []
                for match in cursor.fetchall():
                    match_events.append({
                        'event_id': match['event_id'],
                        'name': match['name'],
                        'date': match['date'].strftime('%Y-%m-%d') if match['date'] else None,
                        'start_time': str(match['start_time']) if match['start_time'] else None,
                        'location': match['location'],
                        'league_id': match['league_id'],
                        'league_name': match['league_name'],
                        'result': match['result'],
                        'notes': match['notes'],
                        'recorded_at': match['recorded_at'].strftime('%Y-%m-%d %H:%M:%S') if match['recorded_at'] else None,
                        'recorded_by': f"{match['firstname']} {match['lastname']}" if match['firstname'] else None
                    })

                return jsonify({
                    'success': True,
                    'stats': {
                        'wins': wins,
                        'losses': losses,
                        'total_matches': wins + losses
                    },
                    'match_events': match_events,
                    'game_title': team['GameTitle'],
                    'team_leagues': [{'id': l['id'], 'name': l['name']} for l in team_leagues],
                    'current_league_filter': league_id
                }), 200

            finally:
                cursor.close()

        except Exception as e:
            print(f"Error getting team stats: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'message': 'Failed to load statistics'
            }), 500

    # ============================================
    # GET MATCH EVENTS FOR RECORDING
    # ============================================
    @app.route('/api/teams/<team_id>/match-events', methods=['GET'])
    @login_required
    def get_match_events(team_id):
        """
        Get past match events for a team that can have results recorded
        Now includes matches where start time has passed (not just date)
        """
        try:
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # Get match events where start time has passed
                cursor.execute("""
                    SELECT 
                        ge.EventID as event_id,
                        ge.EventName as name,
                        ge.Date as date,
                        ge.StartTime as start_time,
                        mr.result,
                        mr.result_id
                    FROM generalevents ge
                    LEFT JOIN match_results mr ON ge.EventID = mr.event_id AND mr.team_id = %s
                    WHERE ge.EventType = 'Match'
                    AND ge.team_id = %s
                    AND (
                        ge.Date < CURDATE()
                        OR (ge.Date = CURDATE() AND ge.StartTime <= CURTIME())
                    )
                    ORDER BY ge.Date DESC, ge.StartTime DESC
                """, (team_id, team_id))

                events = []
                for event in cursor.fetchall():
                    events.append({
                        'event_id': event['event_id'],
                        'name': event['name'],
                        'date': event['date'].strftime('%Y-%m-%d') if event['date'] else None,
                        'start_time': str(event['start_time']) if event['start_time'] else None,
                        'has_result': event['result'] is not None,
                        'result': event['result']
                    })

                return jsonify({
                    'success': True,
                    'events': events
                }), 200

            finally:
                cursor.close()

        except Exception as e:
            print(f"Error getting match events: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to load match events'
            }), 500

    # ============================================
    # RECORD MATCH RESULT
    # ============================================
    @app.route('/api/teams/record-match-result', methods=['POST'])
    @login_required
    @roles_required('gm')
    def record_match_result():
        """
        Record a win/loss result for a match
        Only GMs for the specific game can record results
        Now allows recording as soon as start time passes
        """
        try:
            data = request.get_json()
            user_id = session['id']

            # Validate required fields
            if not all(k in data for k in ['team_id', 'event_id', 'result']):
                return jsonify({
                    'success': False,
                    'message': 'Missing required fields'
                }), 400

            if data['result'] not in ['win', 'loss']:
                return jsonify({
                    'success': False,
                    'message': 'Invalid result. Must be "win" or "loss"'
                }), 400

            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # Get team's game_id
                cursor.execute("""
                    SELECT gameID FROM teams WHERE TeamID = %s
                """, (data['team_id'],))

                team = cursor.fetchone()
                if not team:
                    return jsonify({
                        'success': False,
                        'message': 'Team not found'
                    }), 404

                # Check if team's season is active
                cursor.execute("""
                    SELECT s.is_active
                    FROM teams t
                    LEFT JOIN seasons s ON t.season_id = s.season_id
                    WHERE t.TeamID = %s
                """, (data['team_id'],))

                season_result = cursor.fetchone()
                season_is_active = season_result['is_active'] == 1 if season_result and season_result[
                    'is_active'] is not None else True

                # Check if user is developer
                cursor.execute("SELECT is_developer FROM permissions WHERE userid = %s", (user_id,))
                perm = cursor.fetchone()
                is_developer = perm['is_developer'] == 1 if perm else False

                if not season_is_active and not is_developer:
                    return jsonify({
                        'success': False,
                        'message': 'Cannot record match results for teams from past seasons'
                    }), 403

                game_id = team['gameID']

                # Verify GM manages this game
                cursor.execute("""
                    SELECT gm_id FROM games WHERE GameID = %s
                """, (game_id,))

                game = cursor.fetchone()
                if not game or game['gm_id'] != user_id:
                    return jsonify({
                        'success': False,
                        'message': 'You do not have permission to record results for this team'
                    }), 403

                # Verify event exists and is a match
                cursor.execute("""
                    SELECT EventType, Date, StartTime 
                    FROM generalevents 
                    WHERE EventID = %s AND team_id = %s
                """, (data['event_id'], data['team_id']))

                event = cursor.fetchone()
                if not event:
                    return jsonify({
                        'success': False,
                        'message': 'Event not found'
                    }), 404

                if event['EventType'] != 'Match':
                    return jsonify({
                        'success': False,
                        'message': 'Can only record results for Match events'
                    }), 400

                # Check if start time has passed
                from datetime import datetime, date, time, timedelta

                current_datetime = datetime.now()
                event_date = event['Date']
                event_start_time = event['StartTime']

                # Ensure event_date is a date object
                if isinstance(event_date, datetime):
                    event_date = event_date.date()

                # If event is on a future date, cannot record
                if event_date > current_datetime.date():
                    return jsonify({
                        'success': False,
                        'message': 'Cannot record results for matches that haven\'t started yet'
                    }), 400

                # If event is today and has a start time, check if it has passed
                if event_date == current_datetime.date() and event_start_time:
                    # Handle timedelta (MySQL TIME field can return as timedelta)
                    if isinstance(event_start_time, timedelta):
                        total_seconds = int(event_start_time.total_seconds())
                        hours = total_seconds // 3600
                        minutes = (total_seconds % 3600) // 60
                        seconds = total_seconds % 60
                        event_start_time = time(hours, minutes, seconds)

                    # Now compare times
                    current_time = current_datetime.time()
                    if event_start_time > current_time:
                        return jsonify({
                            'success': False,
                            'message': 'Cannot record results for matches that haven\'t started yet'
                        }), 400

                # Insert or update match result
                cursor.execute("""
                    INSERT INTO match_results 
                    (event_id, team_id, result, recorded_by, notes)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        result = VALUES(result),
                        recorded_by = VALUES(recorded_by),
                        notes = VALUES(notes),
                        recorded_at = CURRENT_TIMESTAMP
                """, (
                    data['event_id'],
                    data['team_id'],
                    data['result'],
                    user_id,
                    data.get('notes', '')
                ))

                mysql.connection.commit()

                return jsonify({
                    'success': True,
                    'message': f'Match result recorded: {data["result"].upper()}'
                }), 200

            finally:
                cursor.close()

        except Exception as e:
            print(f"Error recording match result: {str(e)}")
            import traceback
            traceback.print_exc()
            mysql.connection.rollback()
            return jsonify({
                'success': False,
                'message': 'Failed to record match result'
            }), 500

    # ============================================
    # DELETE MATCH RESULT
    # ============================================
    @app.route('/api/teams/delete-match-result/<int:result_id>', methods=['DELETE'])
    @login_required
    @roles_required('gm')
    def delete_match_result(result_id):
        """
        Delete a match result
        Only GMs for the specific game can delete results
        """
        try:
            user_id = session['id']
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # Get result details and verify permissions
                cursor.execute("""
                    SELECT mr.team_id, t.gameID, g.gm_id
                    FROM match_results mr
                    JOIN teams t ON mr.team_id = t.TeamID
                    JOIN games g ON t.gameID = g.GameID
                    WHERE mr.result_id = %s
                """, (result_id,))

                result = cursor.fetchone()
                if not result:
                    return jsonify({
                        'success': False,
                        'message': 'Result not found'
                    }), 404

                if result['gm_id'] != user_id:
                    return jsonify({
                        'success': False,
                        'message': 'You do not have permission to delete this result'
                    }), 403

                # Delete the result
                cursor.execute("""
                    DELETE FROM match_results WHERE result_id = %s
                """, (result_id,))

                mysql.connection.commit()

                return jsonify({
                    'success': True,
                    'message': 'Match result deleted successfully'
                }), 200

            finally:
                cursor.close()

        except Exception as e:
            print(f"Error deleting match result: {str(e)}")
            mysql.connection.rollback()
            return jsonify({
                'success': False,
                'message': 'Failed to delete match result'
            }), 500