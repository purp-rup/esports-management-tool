"""
Team Statistics Management
Handles match results and team performance tracking
"""

from flask import request, jsonify, session
from datetime import datetime
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
        - Win/Loss record
        - Win percentage
        - Match history with results
        """
        try:
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

                # Calculate wins and losses
                cursor.execute("""
                    SELECT 
                        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
                        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
                    FROM match_results
                    WHERE team_id = %s
                """, (team_id,))
                
                stats = cursor.fetchone()
                wins = stats['wins'] or 0
                losses = stats['losses'] or 0

                # Get match history with results
                cursor.execute("""
                    SELECT 
                        ge.EventID as event_id,
                        ge.EventName as name,
                        ge.Date as date,
                        ge.StartTime as start_time,
                        ge.Location as location,
                        mr.result,
                        mr.notes,
                        mr.recorded_at,
                        u.firstname,
                        u.lastname
                    FROM generalevents ge
                    LEFT JOIN match_results mr ON ge.EventID = mr.event_id AND mr.team_id = %s
                    LEFT JOIN users u ON mr.recorded_by = u.id
                    WHERE ge.EventType = 'Match'
                    AND ge.team_id = %s
                    AND ge.Date <= CURDATE()
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
                    'game_title': team['GameTitle']
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
        """
        try:
            cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

            try:
                # Get match events (past matches only)
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
                    AND ge.Date <= CURDATE()
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
                    SELECT EventType, Date 
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

                # Check if event is in the past
                if event['Date'] > datetime.now().date():
                    return jsonify({
                        'success': False,
                        'message': 'Cannot record results for future matches'
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