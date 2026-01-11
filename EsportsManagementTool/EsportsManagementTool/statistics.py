"""
Esports Program Statistics Module
Calculates comprehensive statistics for the admin statistics page
"""
from datetime import datetime, timedelta
import MySQLdb.cursors


class EsportsStatistics:
    """
    Centralized statistics calculator for Stockton Esports program
    """
    
    def __init__(self, mysql_connection, season_id=None):
        """
        Initialize with MySQL connection and optional season filter
        
        Args:
            mysql_connection: Flask-MySQL connection object
            season_id: Optional season ID to filter statistics
        """
        self.mysql = mysql_connection
        self.season_id = season_id
        self.cursor = None
        
    def __enter__(self):
        """Context manager entry"""
        self.cursor = self.mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        if self.cursor:
            self.cursor.close()
    
    # =====================================
    # PROGRAM-WIDE STATISTICS
    # =====================================
    
    def get_unique_games(self):
        """
        Count unique competitive game titles (games with at least one team)
        Returns: int
        """
        query = """
            SELECT COUNT(DISTINCT gameID) as count 
            FROM teams
        """
        
        if self.season_id:
            query += " WHERE season_id = %s"
            self.cursor.execute(query, (self.season_id,))
        else:
            self.cursor.execute(query)
            
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_unique_leagues(self):
        """
        Count unique leagues teams are competing in
        Returns: int
        """
        query = """
            SELECT COUNT(DISTINCT league_id) as count 
            FROM team_leagues
        """
        
        if self.season_id:
            query += """
                WHERE team_id IN (
                    SELECT TeamID FROM teams WHERE season_id = %s
                )
            """
            self.cursor.execute(query, (self.season_id,))
        else:
            self.cursor.execute(query)
            
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_unique_players(self):
        """
        Count unique players across all teams
        Returns: int
        """
        query = """
            SELECT COUNT(DISTINCT user_id) as count 
            FROM team_members
        """
        
        if self.season_id:
            query += """
                WHERE team_id IN (
                    SELECT TeamID FROM teams WHERE season_id = %s
                )
            """
            self.cursor.execute(query, (self.season_id,))
        else:
            self.cursor.execute(query)
            
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_unique_esports_count(self):
        """
        Count games that have active teams (same as get_unique_games)
        Returns: int
        """
        # Reuse get_unique_games to avoid duplication
        return self.get_unique_games()
    
    def get_total_games_in_database(self):
        """
        Count all games in database (including non-competitive)
        Returns: int
        """
        query = "SELECT COUNT(DISTINCT GameID) as count FROM games"
        self.cursor.execute(query)
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_community_members(self):
        """
        Count unique members in game communities
        Returns: int
        """
        query = """
            SELECT COUNT(DISTINCT user_id) as count 
            FROM in_communities
        """
        self.cursor.execute(query)
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_fielded_players(self):
        """
        Count players who are on at least one team
        Returns: int
        """
        return self.get_unique_players()
    
    def get_unique_teams(self):
        """
        Count total unique teams
        Returns: int
        """
        query = "SELECT COUNT(TeamID) as count FROM teams"
        
        if self.season_id:
            query += " WHERE season_id = %s"
            self.cursor.execute(query, (self.season_id,))
        else:
            self.cursor.execute(query)
            
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    # =====================================
    # PLAYER STATISTICS
    # =====================================
    
    def get_new_players(self, reference_season_id=None):
        """
        Count players who joined in current season (new to program)
        
        Args:
            reference_season_id: Season to check against (defaults to previous season)
        Returns: int
        """
        if not self.season_id:
            return 0
            
        # If no reference season provided, get previous season
        if not reference_season_id:
            self.cursor.execute("""
                SELECT season_id FROM seasons 
                WHERE start_date < (
                    SELECT start_date FROM seasons WHERE season_id = %s
                )
                ORDER BY start_date DESC 
                LIMIT 1
            """, (self.season_id,))
            
            prev_season = self.cursor.fetchone()
            reference_season_id = prev_season['season_id'] if prev_season else None
        
        if not reference_season_id:
            # No previous season, all players are "new"
            return self.get_unique_players()
        
        # Get players in current season who weren't in reference season
        self.cursor.execute("""
            SELECT COUNT(DISTINCT tm.user_id) as count
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.TeamID
            WHERE t.season_id = %s
            AND tm.user_id NOT IN (
                SELECT DISTINCT tm2.user_id
                FROM team_members tm2
                JOIN teams t2 ON tm2.team_id = t2.TeamID
                WHERE t2.season_id = %s
            )
        """, (self.season_id, reference_season_id))
        
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_returning_players(self, reference_season_id=None):
        """
        Count players who returned from previous season
        
        Args:
            reference_season_id: Season to check against
        Returns: int
        """
        if not self.season_id:
            return 0
            
        if not reference_season_id:
            self.cursor.execute("""
                SELECT season_id FROM seasons 
                WHERE start_date < (
                    SELECT start_date FROM seasons WHERE season_id = %s
                )
                ORDER BY start_date DESC 
                LIMIT 1
            """, (self.season_id,))
            
            prev_season = self.cursor.fetchone()
            reference_season_id = prev_season['season_id'] if prev_season else None
        
        if not reference_season_id:
            return 0
        
        # Get players in current season who were also in reference season
        self.cursor.execute("""
            SELECT COUNT(DISTINCT tm.user_id) as count
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.TeamID
            WHERE t.season_id = %s
            AND tm.user_id IN (
                SELECT DISTINCT tm2.user_id
                FROM team_members tm2
                JOIN teams t2 ON tm2.team_id = t2.TeamID
                WHERE t2.season_id = %s
            )
        """, (self.season_id, reference_season_id))
        
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_did_not_return(self, reference_season_id=None):
        """
        Count players from reference season who didn't return to current season
        
        Args:
            reference_season_id: Season to check (defaults to previous season)
        Returns: int
        """
        if not self.season_id:
            return 0
            
        if not reference_season_id:
            self.cursor.execute("""
                SELECT season_id FROM seasons 
                WHERE start_date < (
                    SELECT start_date FROM seasons WHERE season_id = %s
                )
                ORDER BY start_date DESC 
                LIMIT 1
            """, (self.season_id,))
            
            prev_season = self.cursor.fetchone()
            reference_season_id = prev_season['season_id'] if prev_season else None
        
        if not reference_season_id:
            return 0
        
        # Get players from reference season who aren't in current season
        self.cursor.execute("""
            SELECT COUNT(DISTINCT tm.user_id) as count
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.TeamID
            WHERE t.season_id = %s
            AND tm.user_id NOT IN (
                SELECT DISTINCT tm2.user_id
                FROM team_members tm2
                JOIN teams t2 ON tm2.team_id = t2.TeamID
                WHERE t2.season_id = %s
            )
        """, (reference_season_id, self.season_id))
        
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_multi_team_players(self):
        """
        Count players competing in multiple teams
        Returns: int
        """
        query = """
            SELECT COUNT(*) as count
            FROM (
                SELECT user_id, COUNT(DISTINCT team_id) as team_count
                FROM team_members
                WHERE team_id IN (
                    SELECT TeamID FROM teams
        """
        
        if self.season_id:
            query += " WHERE season_id = %s"
            self.cursor.execute(query + """
                )
                GROUP BY user_id
                HAVING team_count > 1
            ) as multi_team
            """, (self.season_id,))
        else:
            self.cursor.execute(query + """
                )
                GROUP BY user_id
                HAVING team_count > 1
            ) as multi_team
            """)
        
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    # =====================================
    # TOURNAMENT PLACEMENT STATISTICS
    # =====================================
    
    def get_tournament_placements(self):
        from EsportsManagementTool import tournament_results
        
        # Actually queries the tournament_results table
        return tournament_results.get_tournament_results_for_season(self.mysql, self.season_id)
    
    # =====================================
    # LEAGUE-SPECIFIC STATISTICS
    # =====================================
    
    def get_league_breakdown(self):
        """
        Get statistics broken down by league
        Returns: list of dicts with league stats
        """
        query = """
            SELECT 
                l.id as league_id,
                l.name as league_name,
                COUNT(DISTINCT tl.team_id) as unique_teams,
                COUNT(DISTINCT t.gameID) as unique_esports,
                COUNT(DISTINCT tm.user_id) as unique_players,
                COUNT(DISTINCT tm.user_id) as fielded_players
            FROM league l
            LEFT JOIN team_leagues tl ON l.id = tl.league_id
            LEFT JOIN teams t ON tl.team_id = t.TeamID
            LEFT JOIN team_members tm ON t.TeamID = tm.team_id
        """
        
        if self.season_id:
            query += " WHERE t.season_id = %s"
            self.cursor.execute(query + " GROUP BY l.id, l.name", (self.season_id,))
        else:
            self.cursor.execute(query + " GROUP BY l.id, l.name")
        
        leagues = self.cursor.fetchall()
        
        # Calculate community members for each league's games
        for league in leagues:
            self.cursor.execute("""
                SELECT COUNT(DISTINCT ic.user_id) as count
                FROM in_communities ic
                WHERE ic.game_id IN (
                    SELECT DISTINCT t.gameID
                    FROM teams t
                    JOIN team_leagues tl ON t.TeamID = tl.team_id
                    WHERE tl.league_id = %s
                )
            """, (league['league_id'],))
            
            community = self.cursor.fetchone()
            league['community_members'] = community['count'] if community else 0
        
        return leagues
    
    # =====================================
    # GAME-SPECIFIC STATISTICS
    # =====================================
    
    def get_game_statistics(self, game_id):
        """
        Get detailed statistics for a specific game
        
        Args:
            game_id: Game ID to get stats for
        Returns: dict with game statistics
        """
        stats = {
            'game_id': game_id,
            'teams': [],
            'total_wins': 0,
            'total_losses': 0,
            'win_percentage': 0
        }
        
        # Get all teams for this game
        query = """
            SELECT 
                t.TeamID,
                t.TeamTitle,
                t.division,
                COUNT(DISTINCT tm.user_id) as player_count
            FROM teams t
            LEFT JOIN team_members tm ON t.TeamID = tm.team_id
            WHERE t.gameID = %s
        """
        
        if self.season_id:
            query += " AND t.season_id = %s GROUP BY t.TeamID"
            self.cursor.execute(query, (game_id, self.season_id))
        else:
            query += " GROUP BY t.TeamID"
            self.cursor.execute(query, (game_id,))
        
        teams = self.cursor.fetchall()
        
        # Get match results for each team
        for team in teams:
            self.cursor.execute("""
                SELECT 
                    SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
                    SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
                FROM match_results
                WHERE team_id = %s
            """, (team['TeamID'],))
            
            results = self.cursor.fetchone()
            wins = int(results['wins']) if results['wins'] else 0
            losses = int(results['losses']) if results['losses'] else 0
            
            team['wins'] = wins
            team['losses'] = losses
            team['total_matches'] = wins + losses
            team['win_percentage'] = (wins / (wins + losses) * 100) if (wins + losses) > 0 else 0
            
            stats['total_wins'] += wins
            stats['total_losses'] += losses
            stats['teams'].append(team)
        
        total_matches = stats['total_wins'] + stats['total_losses']
        stats['win_percentage'] = (stats['total_wins'] / total_matches * 100) if total_matches > 0 else 0
        
        return stats
    
    # =====================================
    # COMPREHENSIVE STATISTICS
    # =====================================
    
    def get_all_statistics(self):
        """
        Get all statistics in one comprehensive dictionary
        Returns: dict with all statistics
        """
        stats = {
            'program_wide': {
                'unique_games': self.get_unique_games(),
                'unique_leagues': self.get_unique_leagues(),
                'unique_players': self.get_unique_players(),
                'unique_esports': self.get_unique_esports_count(),
                'community_members': self.get_community_members(),
                'fielded_players': self.get_fielded_players(),
                'unique_teams': self.get_unique_teams(),
            },
            'player_stats': {
                'new_players': self.get_new_players(),
                'returning_players': self.get_returning_players(),
                'did_not_return': self.get_did_not_return(),
                'multi_team_players': self.get_multi_team_players(),
            },
            'tournament_placements': self.get_tournament_placements(),
            'league_breakdown': self.get_league_breakdown(),
        }
        
        return stats


def register_statistics_routes(app, mysql, login_required, roles_required):
    """
    Register statistics routes with the Flask app
    """
    from flask import render_template, request, jsonify
    
    @app.route('/admin/statistics')
    @login_required
    @roles_required('admin', 'developer')
    def admin_statistics():
        """
        Display comprehensive statistics page
        """
        # Get optional season filter
        season_id = request.args.get('season_id', type=int)
        
        # Calculate statistics
        with EsportsStatistics(mysql, season_id) as stats:
            all_stats = stats.get_all_statistics()
        
        # Get available seasons for filter dropdown
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute("""
            SELECT season_id, season_name, start_date, end_date, is_active
            FROM seasons
            ORDER BY start_date DESC
        """)
        seasons = cursor.fetchall()
        cursor.close()
        
        return render_template(
            'admin_statistics.html',
            statistics=all_stats,
            seasons=seasons,
            selected_season=season_id
        )
    
    @app.route('/api/admin/statistics')
    @login_required
    @roles_required('admin', 'developer')
    def api_statistics():
        """
        API endpoint to get statistics as JSON
        """
        season_id = request.args.get('season_id', type=int)
        
        with EsportsStatistics(mysql, season_id) as stats:
            all_stats = stats.get_all_statistics()
        
        return jsonify({
            'success': True,
            'statistics': all_stats
        }), 200
    
    @app.route('/api/admin/statistics/game/<int:game_id>')
    @login_required
    @roles_required('admin', 'developer')
    def api_game_statistics(game_id):
        """
        Get detailed statistics for a specific game
        """
        season_id = request.args.get('season_id', type=int)
        
        with EsportsStatistics(mysql, season_id) as stats:
            game_stats = stats.get_game_statistics(game_id)
        
        return jsonify({
            'success': True,
            'statistics': game_stats
        }), 200