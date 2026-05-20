"""
Tournament Results Management Module
Handles recording and tracking of tournament placements for teams
"""
from flask import jsonify, request, session
from datetime import datetime, timedelta
import MySQLdb.cursors


# Placement options matching the statistics page
PLACEMENT_OPTIONS = [
    'Winner',
    'Finals',
    'Semifinals', 
    'Quarterfinals',
    'Playoffs',
    'Regular Season'
]


def register_tournament_results_routes(app, mysql, login_required, roles_required, get_user_permissions):
    """
    Register tournament results routes with the Flask app
    """
    
    @app.route('/api/tournament-results/pending-teams', methods=['GET'])
    @login_required
    @roles_required('gm')
    def get_pending_teams():
        """
        Get teams that need tournament results recorded for current GM
        Returns teams from active season that GM manages and haven't recorded results yet
        """
        gm_id = session.get('id')
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        
        try:
            # Get active season
            cursor.execute("""
                SELECT season_id, season_name, end_date
                FROM seasons 
                WHERE is_active = 1
                LIMIT 1
            """)
            active_season = cursor.fetchone()
            
            if not active_season:
                return jsonify({
                    'success': True,
                    'teams': [],
                    'season': None,
                    'placement_options': PLACEMENT_OPTIONS,
                    'message': 'No active season'
                }), 200
            
            season_id = active_season['season_id']
            
            # Get teams managed by this GM that need results recorded
            # Only include teams that are in leagues
            cursor.execute("""
                SELECT 
                    t.teamID,
                    t.teamName as TeamTitle,
                    g.GameTitle,
                    g.GameID,
                    l.id as league_id,
                    l.name as league_name,
                    COALESCE(COUNT(tr.result_id), 0) as has_result
                FROM teams t
                JOIN games g ON t.gameID = g.GameID
                JOIN team_leagues tl ON t.teamID = tl.team_id
                JOIN league l ON tl.league_id = l.id
                LEFT JOIN tournament_results tr ON (
                    tr.team_id = t.teamID 
                    AND tr.league_id = l.id 
                    AND tr.season_id = %s
                )
                WHERE t.season_id = %s
                AND g.gm_id = %s
                GROUP BY t.teamID, t.teamName, g.GameTitle, g.GameID, l.id, l.name
                HAVING has_result = 0
                ORDER BY g.GameTitle, l.name, t.teamName
            """, (season_id, season_id, gm_id))
            
            teams = cursor.fetchall()
            
            # Convert to list to ensure JSON serialization
            teams_list = []
            for team in teams:
                teams_list.append({
                    'teamID': team['teamID'],
                    'TeamTitle': team['TeamTitle'],
                    'GameTitle': team['GameTitle'],
                    'GameID': team['GameID'],
                    'league_id': team['league_id'],
                    'league_name': team['league_name']
                })
            
            return jsonify({
                'success': True,
                'teams': teams_list,
                'season': {
                    'season_id': active_season['season_id'],
                    'season_name': active_season['season_name'],
                    'end_date': active_season['end_date'].strftime('%Y-%m-%d')
                },
                'placement_options': PLACEMENT_OPTIONS
            }), 200
            
        except Exception as e:
            print(f"Error fetching pending teams: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'message': f'Failed to fetch pending teams: {str(e)}'
            }), 500
        finally:
            cursor.close()
    
    
    @app.route('/api/tournament-results/record', methods=['POST'])
    @login_required
    @roles_required('gm')
    def record_tournament_result():
        """
        Record tournament result for a team
        """
        gm_id = session.get('id')
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['team_id', 'league_id', 'season_id', 'placement']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'message': 'Missing required fields'
            }), 400
        
        team_id = data['team_id']
        league_id = data['league_id']
        season_id = data['season_id']
        placement = data['placement']
        notes = data.get('notes', '')
        
        # Validate placement option
        if placement not in PLACEMENT_OPTIONS:
            return jsonify({
                'success': False,
                'message': 'Invalid placement option'
            }), 400
        
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        
        try:
            # Verify GM manages this team's game
            cursor.execute("""
                SELECT g.GameID 
                FROM teams t
                JOIN games g ON t.gameID = g.GameID
                WHERE t.teamID = %s AND g.gm_id = %s
            """, (team_id, gm_id))
            
            if not cursor.fetchone():
                return jsonify({
                    'success': False,
                    'message': 'You do not manage this team'
                }), 403
            
            # Insert or update tournament result
            cursor.execute("""
                INSERT INTO tournament_results 
                (team_id, league_id, season_id, placement, notes, recorded_by)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    placement = VALUES(placement),
                    notes = VALUES(notes),
                    recorded_by = VALUES(recorded_by),
                    updated_at = CURRENT_TIMESTAMP
            """, (team_id, league_id, season_id, placement, notes, gm_id))
            
            mysql.connection.commit()
            
            # Check if GM has completed all their results
            check_gm_completion(mysql, gm_id, season_id)
            
            return jsonify({
                'success': True,
                'message': 'Tournament result recorded successfully'
            }), 200
            
        except Exception as e:
            mysql.connection.rollback()
            print(f"Error recording tournament result: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to record tournament result'
            }), 500
        finally:
            cursor.close()
    
    
    @app.route('/api/tournament-results/check-pending', methods=['GET'])
    @login_required
    @roles_required('gm')
    def check_pending_results():
        """
        Check if current GM has pending tournament results to record
        Returns count and whether to show notification banner
        """
        gm_id = session.get('id')
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        
        try:
            # Get active season
            cursor.execute("""
                SELECT season_id, season_name, end_date
                FROM seasons 
                WHERE is_active = 1
                LIMIT 1
            """)
            active_season = cursor.fetchone()
            
            if not active_season:
                return jsonify({
                    'success': True,
                    'has_pending': False,
                    'pending_count': 0
                }), 200
            
            season_id = active_season['season_id']
            end_date = active_season['end_date']
            
            # Calculate days until season end
            days_until_end = (end_date - datetime.now().date()).days
            
            # Only show notification if within 30 days of season end
            if days_until_end > 30 or days_until_end < 0:
                return jsonify({
                    'success': True,
                    'has_pending': False,
                    'pending_count': 0
                }), 200
            
            # Count pending results
            cursor.execute("""
                SELECT COUNT(DISTINCT t.teamID) as pending_count
                FROM teams t
                JOIN games g ON t.gameID = g.GameID
                JOIN team_leagues tl ON t.teamID = tl.team_id
                LEFT JOIN tournament_results tr ON (
                    tr.team_id = t.teamID 
                    AND tr.league_id = tl.league_id 
                    AND tr.season_id = %s
                )
                WHERE t.season_id = %s
                AND g.gm_id = %s
                AND tr.result_id IS NULL
            """, (season_id, season_id, gm_id))
            
            result = cursor.fetchone()
            pending_count = result['pending_count']
            
            return jsonify({
                'success': True,
                'has_pending': pending_count > 0,
                'pending_count': pending_count,
                'days_until_end': days_until_end,
                'season_name': active_season['season_name']
            }), 200
            
        except Exception as e:
            print(f"Error checking pending results: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to check pending results'
            }), 500
        finally:
            cursor.close()


def check_gm_completion(mysql, gm_id, season_id):
    """
    Check if GM has completed all tournament results and update notification status
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    
    try:
        # Check if GM has any pending results
        cursor.execute("""
            SELECT COUNT(*) as pending_count
            FROM teams t
            JOIN games g ON t.gameID = g.GameID
            JOIN team_leagues tl ON t.teamID = tl.team_id
            LEFT JOIN tournament_results tr ON (
                tr.team_id = t.teamID 
                AND tr.league_id = tl.league_id 
                AND tr.season_id = %s
            )
            WHERE t.season_id = %s
            AND g.gm_id = %s
            AND tr.result_id IS NULL
        """, (season_id, season_id, gm_id))
        
        result = cursor.fetchone()
        
        if result['pending_count'] == 0:
            # Mark notification as completed
            cursor.execute("""
                UPDATE tournament_result_notifications
                SET is_completed = TRUE
                WHERE gm_id = %s AND season_id = %s
            """, (gm_id, season_id))
            
            mysql.connection.commit()
            
    except Exception as e:
        print(f"Error checking GM completion: {str(e)}")
    finally:
        cursor.close()


def get_tournament_results_for_season(mysql, season_id=None):
    """
    Get tournament results aggregated for statistics page
    Returns counts for each placement category
    
    This function is used by the statistics module to populate the 
    Tournament Performance section of the admin statistics page
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    
    try:
        query = """
            SELECT 
                placement,
                COUNT(*) as count
            FROM tournament_results
        """
        
        if season_id:
            query += " WHERE season_id = %s"
            cursor.execute(query + " GROUP BY placement", (season_id,))
        else:
            cursor.execute(query + " GROUP BY placement")
        
        results = cursor.fetchall()
        
        # Initialize counts
        placements = {
            'winners': 0,
            'finals': 0,
            'semifinals': 0,
            'quarterfinals': 0,
            'playoffs': 0,
            'regular_season': 0,
            'in_progress': 0  # Added for completeness
        }
        
        # Map results to placement categories
        placement_map = {
            'Winner': 'winners',
            'Finals': 'finals',
            'Semifinals': 'semifinals',
            'Quarterfinals': 'quarterfinals',
            'Playoffs': 'playoffs',
            'Regular Season': 'regular_season'
        }
        
        for result in results:
            key = placement_map.get(result['placement'])
            if key:
                placements[key] = result['count']
        
        # Count teams with leagues but no recorded results as "in_progress"
        # Only for active season
        if season_id:
            cursor.execute("""
                SELECT COUNT(DISTINCT t.teamID) as count
                FROM teams t
                JOIN team_leagues tl ON t.teamID = tl.team_id
                LEFT JOIN tournament_results tr ON (
                    tr.team_id = t.teamID 
                    AND tr.league_id = tl.league_id 
                    AND tr.season_id = %s
                )
                WHERE t.season_id = %s
                AND tr.result_id IS NULL
            """, (season_id, season_id))
            
            in_progress = cursor.fetchone()
            if in_progress:
                placements['in_progress'] = in_progress['count']
        
        return placements
        
    except Exception as e:
        print(f"Error getting tournament results: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'winners': 0,
            'finals': 0,
            'semifinals': 0,
            'quarterfinals': 0,
            'playoffs': 0,
            'regular_season': 0,
            'in_progress': 0
        }
    finally:
        cursor.close()