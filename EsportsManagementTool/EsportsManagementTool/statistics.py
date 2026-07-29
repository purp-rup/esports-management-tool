"""
Esports Program Statistics Module
Calculates comprehensive statistics for the admin statistics page
"""
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
        """Count unique competitive game titles (games with at least one team)"""
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
        """Count unique leagues teams are competing in"""
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
        """Count unique players across all teams"""
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
        """Count games that have active teams (same as get_unique_games)"""
        # Reuse get_unique_games to avoid duplication
        return self.get_unique_games()

    def get_active_games(self):
        """
        Get list of games with at least one team for the current season filter
        Used to populate per-game navigation (e.g. bottom game tabs)
        """
        query = """
            SELECT DISTINCT g.GameID as game_id, g.GameTitle as game_title,
                   CASE WHEN g.GameImage IS NOT NULL THEN 1 ELSE 0 END as has_image
            FROM teams t
            JOIN games g ON t.gameID = g.GameID
        """
        params = ()

        if self.season_id:
            query += " WHERE t.season_id = %s"
            params = (self.season_id,)

        query += " ORDER BY g.GameTitle ASC"

        self.cursor.execute(query, params)
        games = self.cursor.fetchall()

        for game in games:
            game['icon_url'] = f"/game-image/{game['game_id']}" if game['has_image'] else None

        return games
    
    def get_total_games_in_database(self):
        """Count all games in database (including non-competitive)"""
        query = "SELECT COUNT(DISTINCT GameID) as count FROM games"
        self.cursor.execute(query)
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_community_members(self):
        """Count unique members in game communities"""
        query = """
            SELECT COUNT(DISTINCT user_id) as count 
            FROM in_communities
        """
        self.cursor.execute(query)
        result = self.cursor.fetchone()
        return result['count'] if result else 0
    
    def get_fielded_players(self):
        """Count players who are on at least one team"""
        return self.get_unique_players()
    
    def get_unique_teams(self):
        """Count total unique teams"""
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
    # PLAYOFFS PLACEMENT STATISTICS
    # =====================================
    def get_playoffs_placements(self):
        from EsportsManagementTool import playoffs_results
        
        # Actually queries the playoffs_results table
        return playoffs_results.get_playoffs_results_for_season(self.mysql, self.season_id)
    
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
        Get per-team statistics for a specific game, formatted for the
        admin statistics page's per-game tab view.

        Returns: dict with game_id, game_manager (display name), and a list
        of per-team dicts (conference, regular season matches/record,
        playoffs matches/status/outcome).
        """
        cursor = self.cursor

        # Game Manager — one per game, pulled via games.gm_id
        cursor.execute("""
            SELECT u.firstname, u.lastname
            FROM games g
            LEFT JOIN users u ON g.gm_id = u.id
            WHERE g.GameID = %s
        """, (game_id,))
        gm_row = cursor.fetchone()
        game_manager = f"{gm_row['firstname']} {gm_row['lastname']}" if gm_row and gm_row['firstname'] else None

        # Teams for this game (optionally filtered by season)
        team_query = "SELECT TeamID, teamName, season_id FROM teams WHERE gameID = %s"
        params = [game_id]
        if self.season_id:
            team_query += " AND season_id = %s"
            params.append(self.season_id)
        team_query += " ORDER BY teamName ASC"

        cursor.execute(team_query, tuple(params))
        teams = cursor.fetchall()

        # All-Time view only: map season_id -> name, and rank seasons so the
        # most recent one sorts first (used below to group rows by season)
        season_names = {}
        season_order = {}
        if not self.season_id:
            cursor.execute("SELECT season_id, season_name FROM seasons ORDER BY start_date DESC")
            all_seasons = cursor.fetchall()
            season_names = {s['season_id']: s['season_name'] for s in all_seasons}
            season_order = {s['season_id']: idx for idx, s in enumerate(all_seasons)}

        result_rows = []
        for team in teams:
            team_id = team['TeamID']

            # A team can compete in more than one league at once — each
            # league gets its own row, with its own matches/record/outcome
            cursor.execute("""
                        SELECT l.id as league_id, l.name as league_name
                        FROM team_leagues tl
                        JOIN league l ON tl.league_id = l.id
                        WHERE tl.team_id = %s
                        ORDER BY l.name
                    """, (team_id,))
            team_leagues = cursor.fetchall()

            # Team isn't in any league yet — still show one row, blank conference
            if not team_leagues:
                team_leagues = [{'league_id': None, 'league_name': None}]

            for tl in team_leagues:
                league_id = tl['league_id']

                match_params = [team_id]
                league_clause = ""
                if league_id is not None:
                    league_clause = " AND ge.league_id = %s"
                    match_params.append(league_id)

                # Regular season matches — scoped to this league only
                cursor.execute(f"""
                            SELECT ge.EventName as label, mr.opponent_school, mr.result,
                                   mr.team_score, mr.opponent_score
                            FROM match_results mr
                            JOIN generalevents ge ON mr.event_id = ge.EventID
                            WHERE mr.team_id = %s AND mr.is_playoffs = 0{league_clause}
                            ORDER BY ge.Date ASC, ge.StartTime ASC
                        """, tuple(match_params))
                regular_matches = self._format_matches(cursor.fetchall())

                wins = sum(1 for m in regular_matches if m['result'] == 'win')
                losses = sum(1 for m in regular_matches if m['result'] == 'loss')
                regular_season_record = f"{wins}-{losses}"

                # Playoffs matches — scoped to this league only
                cursor.execute(f"""
                            SELECT ge.EventName as label, mr.opponent_school, mr.result,
                                   mr.team_score, mr.opponent_score
                            FROM match_results mr
                            JOIN generalevents ge ON mr.event_id = ge.EventID
                            WHERE mr.team_id = %s AND mr.is_playoffs = 1{league_clause}
                            ORDER BY ge.Date ASC, ge.StartTime ASC
                        """, tuple(match_params))
                playoffs_matches = self._format_matches(cursor.fetchall())

                # Playoffs status + outcome — scoped to this league only
                placement = None
                if league_id is not None:
                    placement_query = "SELECT placement FROM playoffs_results WHERE team_id = %s AND league_id = %s"
                    placement_params = [team_id, league_id]
                    if self.season_id:
                        placement_query += " AND season_id = %s"
                        placement_params.append(self.season_id)
                    placement_query += " LIMIT 1"

                    cursor.execute(placement_query, tuple(placement_params))
                    placement_row = cursor.fetchone()
                    placement = placement_row['placement'] if placement_row else None

                if placement is None:
                    playoffs_status, playoffs_outcome = None, None
                elif placement == 'Did Not Qualify':
                    playoffs_status, playoffs_outcome = 'Did Not Qualify', None
                else:
                    playoffs_status, playoffs_outcome = 'Qualified', placement

                result_rows.append({
                    'team_id': team_id,
                    'team_title': team['teamName'],
                    'conference': tl['league_name'],
                    'season_id': team['season_id'],
                    'season_name': None if self.season_id else season_names.get(team['season_id']),
                    'regular_season_matches': regular_matches,
                    'regular_season_record': regular_season_record,
                    'playoffs_matches': playoffs_matches,
                    'playoffs_status': playoffs_status,
                    'playoffs_outcome': playoffs_outcome,
                })

        # Group primarily by league.
        result_rows.sort(key=lambda r: (r['conference'] is None, r['conference'] or '', r['team_title']))

        # Group primarily by league. For the All-Time view (no
        # season filter), group by season first — most recent season on top.
        if self.season_id:
            result_rows.sort(key=lambda r: (r['conference'] is None, r['conference'] or '', r['team_title']))
        else:
            result_rows.sort(key=lambda r: (
                season_order.get(r['season_id'], len(season_order)),
                r['conference'] is None,
                r['conference'] or '',
                r['team_title']
            ))

        return {
            'game_id': game_id,
            'game_manager': game_manager,
            'teams': result_rows,
        }

    def _format_matches(self, rows):
        """
        Format raw match_results rows into the {label, opponent, result, score}
        shape the admin statistics frontend expects.
        Falls back to a plain W/L string when no score was recorded.
        """
        matches = []
        for row in rows:
            team_score = row['team_score']
            opponent_score = row['opponent_score']
            if team_score is not None and opponent_score is not None:
                score_display = f"{team_score}-{opponent_score}"
            else:
                score_display = row['result'].upper() if row['result'] else None

            matches.append({
                'label': row['label'],
                'opponent': row['opponent_school'],
                'result': row['result'],
                'score': score_display,
            })
        return matches
    
    # =====================================
    # COMPREHENSIVE STATISTICS
    # =====================================
    
    def get_playoffs_placements_by_league(self):
        """
        Get playoffs results grouped by league
        Returns: list of dicts with league stats and placements
        """
        cursor = self.cursor
        
        # Get all leagues that have teams with playoffs results
        query = """
            SELECT DISTINCT l.id, l.name
            FROM league l
            JOIN team_leagues tl ON l.id = tl.league_id
            JOIN teams t ON tl.team_id = t.TeamID
        """
        
        if self.season_id:
            query += " WHERE t.season_id = %s"
            cursor.execute(query + " ORDER BY l.name", (self.season_id,))
        else:
            cursor.execute(query + " ORDER BY l.name")
        
        leagues = cursor.fetchall()
        result = []
        
        for league in leagues:
            league_id = league['id']
            league_name = league['name']
            
            # Get placements for this league
            placement_query = """
                SELECT 
                    tr.placement,
                    COUNT(*) as count
                FROM playoffs_results tr
                WHERE tr.league_id = %s
            """
            
            if self.season_id:
                placement_query += " AND tr.season_id = %s"
                cursor.execute(placement_query + " GROUP BY tr.placement", 
                            (league_id, self.season_id))
            else:
                cursor.execute(placement_query + " GROUP BY tr.placement", 
                            (league_id,))
            
            placements_data = cursor.fetchall()
            
            # Initialize placement counts
            placements = {
                'winners': 0,
                'finals': 0,
                'semifinals': 0,
                'quarterfinals': 0,
                'playoffs': 0,
                'regular_season': 0,
                'in_progress': 0
            }
            
            # Map database values to keys
            placement_map = {
                'Winner': 'winners',
                'Finals': 'finals',
                'Semifinals': 'semifinals',
                'Quarterfinals': 'quarterfinals',
                'Playoffs': 'playoffs',
                'Did Not Qualify': 'regular_season'
            }
            
            for row in placements_data:
                key = placement_map.get(row['placement'])
                if key:
                    placements[key] = row['count']
            
            # Count teams in this league with no results (in progress)
            in_progress_query = """
                SELECT COUNT(DISTINCT t.TeamID) as count
                FROM teams t
                JOIN team_leagues tl ON t.TeamID = tl.team_id
                LEFT JOIN playoffs_results tr ON (
                    tr.team_id = t.TeamID 
                    AND tr.league_id = %s
            """
            
            if self.season_id:
                in_progress_query += " AND tr.season_id = %s"
                cursor.execute(in_progress_query + """
                    )
                    WHERE tl.league_id = %s
                    AND t.season_id = %s
                    AND tr.result_id IS NULL
                """, (league_id, self.season_id, league_id, self.season_id))
            else:
                cursor.execute(in_progress_query + """
                    )
                    WHERE tl.league_id = %s
                    AND tr.result_id IS NULL
                """, (league_id, league_id))
            
            in_progress = cursor.fetchone()
            placements['in_progress'] = in_progress['count'] if in_progress else 0
            
            # Get total teams count for this league
            total_teams_query = """
                SELECT COUNT(DISTINCT t.TeamID) as count
                FROM teams t
                JOIN team_leagues tl ON t.TeamID = tl.team_id
                WHERE tl.league_id = %s
            """
            
            if self.season_id:
                cursor.execute(total_teams_query + " AND t.season_id = %s", 
                            (league_id, self.season_id))
            else:
                cursor.execute(total_teams_query, (league_id,))
            
            total_teams = cursor.fetchone()
            total_count = total_teams['count'] if total_teams else 0
            
            # Calculate completed teams
            completed_count = sum([
                placements['winners'],
                placements['finals'],
                placements['semifinals'],
                placements['quarterfinals'],
                placements['playoffs'],
                placements['regular_season']
            ])
            
            result.append({
                'league_id': league_id,
                'league_name': league_name,
                'total_teams': total_count,
                'completed_teams': completed_count,
                **placements
            })
        
        return result

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
            'playoffs_placements': self.get_playoffs_placements(),
            'playoffs_placements_by_league': self.get_playoffs_placements_by_league(),
            'league_breakdown': self.get_league_breakdown(),
            'active_games': self.get_active_games(),
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
        # Get available seasons for filter dropdown (order unchanged)
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute("""
                SELECT season_id, season_name, start_date, end_date, is_active
                FROM seasons
                ORDER BY start_date DESC
            """)
        seasons = cursor.fetchall()
        cursor.close()

        # Season filter: no param on first load = default to the current
        # (active) season; ?season_id=all = explicit "All Time" pick;
        # otherwise use whatever season_id was given
        season_param = request.args.get('season_id')
        if season_param is None:
            active_season = next((s for s in seasons if s['is_active']), None)
            season_id = active_season['season_id'] if active_season else None
        elif season_param == 'all':
            season_id = None
        else:
            season_id = int(season_param)

        # Calculate statistics
        with EsportsStatistics(mysql, season_id) as stats:
            all_stats = stats.get_all_statistics()

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