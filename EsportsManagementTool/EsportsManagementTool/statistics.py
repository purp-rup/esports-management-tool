"""
Esports Program Statistics Module
Calculates comprehensive statistics for the admin statistics page
"""
from EsportsManagementTool import playoffs_results
from EsportsManagementTool.universal_helpers import format_time_to_12hr
from flask import render_template, request, jsonify
import MySQLdb.cursors

class EsportsStatistics:
    """Centralized statistics calculator for Stockton Esports program"""
    
    def __init__(self, mysql_connection, season_id=None):
        """Initialize with MySQL connection and optional season filter"""
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

    # ==========================
    # HELPERS
    # ==========================
    def _scalar_count(self, base_query, season_filter_sql=None):
        """
        Run a COUNT query, appending season_filter_sql (a WHERE/AND clause
        with one %s placeholder) only when self.season_id is set.
        """
        if self.season_id and season_filter_sql:
            self.cursor.execute(base_query + season_filter_sql, (self.season_id,))
        else:
            self.cursor.execute(base_query)

        result = self.cursor.fetchone()
        return result['count'] if result else 0


    def _fetch_seasonal(self, base_query, season_where='', suffix='', params=()):
        """
        Run a multi-row query and fetchall(), appending season_where (a
        clause with one %s placeholder) only when self.season_id is set,
        then always appending suffix (GROUP BY/ORDER BY, etc). Mirrors
        _scalar_count() but for list results instead of a single count.
        """
        query = base_query
        all_params = list(params)
        if self.season_id and season_where:
            query += season_where
            all_params.append(self.season_id)
        query += suffix
        self.cursor.execute(query, tuple(all_params))
        return self.cursor.fetchall()


    def _get_previous_season_id(self):
        """Return the season_id immediately before self.season_id, or None."""
        self.cursor.execute("""
            SELECT season_id FROM seasons
            WHERE start_date < (SELECT start_date FROM seasons WHERE season_id = %s)
            ORDER BY start_date DESC
            LIMIT 1
        """, (self.season_id,))
        prev_season = self.cursor.fetchone()
        return prev_season['season_id'] if prev_season else None


    @staticmethod
    def _cumulate_placements(placements):
        """
        Convert exact-bucket placement counts into cumulative "Top N" counts
        — e.g. quarterfinals includes every team that reached quarterfinals
        or further (semis, finals, winner), not just the exact bucket.
        """
        winners = placements.get('winners', 0)
        finals = placements.get('finals', 0)
        semifinals = placements.get('semifinals', 0)
        quarterfinals = placements.get('quarterfinals', 0)

        placements['winners'] = winners
        placements['finals'] = winners + finals
        placements['semifinals'] = winners + finals + semifinals
        placements['quarterfinals'] = winners + finals + semifinals + quarterfinals
        return placements


    def _get_seasons(self):
        """Return all seasons ordered oldest -> newest (season_id, season_name)."""
        self.cursor.execute("SELECT season_id, season_name FROM seasons ORDER BY start_date ASC")
        return self.cursor.fetchall()


    @staticmethod
    def _count_map(rows, key='season_id'):
        """Turn a list of {<key>: ..., 'count': ...} rows into a {key: count} dict."""
        return {row[key]: row['count'] for row in rows}


    def _zero_filled_event_types(self, counts):
        """Merge a partial {EventType: count} dict onto the full zero-filled COMMUNITY_EVENT_TYPES set."""
        events_by_type = {t: 0 for t in self.COMMUNITY_EVENT_TYPES}
        events_by_type.update({k: v for k, v in counts.items() if k in events_by_type})
        return events_by_type


    def _assemble_season_metrics(self, seasons, metric_maps, group_id=None):
        """
        Zip the season list against {metric_name: {season_id: count}} maps
        to build the season_id/season_name + metric-columns shape every
        trends method returns. Pass group_id (a league_id or game_id) when
        the maps are keyed by (group_id, season_id) tuples instead of
        season_id alone — used by the "all leagues"/"all games" variants.
        """

        def _lookup(m, season_id):
            key = (group_id, season_id) if group_id is not None else season_id
            return m.get(key, 0)

        return [
            {
                'season_id': s['season_id'],
                'season_name': s['season_name'],
                **{name: _lookup(m, s['season_id']) for name, m in metric_maps.items()}
            }
            for s in seasons
        ]


    @staticmethod
    def _build_partnership_cards(rows, icon_url_fn):
        """
        Shared row -> card shaping + sort for get_community_partnerships()
        and get_community_partnerships_for_game(). icon_url_fn(row)
        resolves each row's game icon URL.
        """
        partnerships = []
        for row in rows:
            partnerships.append({
                'id': f"{row['event_id']}-{row['partnership_id']}",
                'partnership_name': row['partnership_name'],
                'event_name': row['event_name'],
                'game_icon_url': icon_url_fn(row),
                'season_name': row['season_name'],
                '_start_date': row['start_date'],
            })

        partnerships.sort(key=lambda p: (p['_start_date'] is None,
                                         p['_start_date'].toordinal() * -1 if p['_start_date'] else 0))
        for p in partnerships:
            p.pop('_start_date', None)

        return partnerships


    def _count_players_relative_to_season(self, target_season_id, other_season_id, exclude):
        """
        Count distinct players in target_season_id who either are NOT
        (exclude=True) or ARE (exclude=False) also in other_season_id.
        Shared by get_new_players/get_returning_players/get_did_not_return.
        """
        op = "NOT IN" if exclude else "IN"
        self.cursor.execute(f"""
            SELECT COUNT(DISTINCT tm.user_id) as count
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.TeamID
            WHERE t.season_id = %s
            AND tm.user_id {op} (
                SELECT DISTINCT tm2.user_id
                FROM team_members tm2
                JOIN teams t2 ON tm2.team_id = t2.TeamID
                WHERE t2.season_id = %s
            )
        """, (target_season_id, other_season_id))
        result = self.cursor.fetchone()
        return result['count'] if result else 0


    # =====================================
    # PROGRAM-WIDE STATISTICS
    # =====================================
    def get_unique_games(self):
        """Count unique competitive game titles (games with at least one team)"""
        return self._scalar_count(
            "SELECT COUNT(DISTINCT gameID) as count FROM teams",
            " WHERE season_id = %s"
        )

    def get_unique_leagues(self):
        """Count unique leagues teams are competing in"""
        return self._scalar_count(
            "SELECT COUNT(DISTINCT league_id) as count FROM team_leagues",
            " WHERE team_id IN (SELECT TeamID FROM teams WHERE season_id = %s)"
        )

    def get_unique_players(self):
        """Count unique players across all teams"""
        return self._scalar_count(
            "SELECT COUNT(DISTINCT user_id) as count FROM team_members",
            " WHERE team_id IN (SELECT TeamID FROM teams WHERE season_id = %s)"
        )
    
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


    def get_program_trends(self):
        """
        Get per-season totals for the All-Time "Overall Trends" chart:
        unique players, unique teams, and playoff-qualified teams.
        """
        cursor = self.cursor
        seasons = self._get_seasons()

        cursor.execute("""
            SELECT t.season_id, COUNT(DISTINCT tm.user_id) as count
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.TeamID
            GROUP BY t.season_id
        """)
        players_by_season = self._count_map(cursor.fetchall())

        cursor.execute("SELECT season_id, COUNT(*) as count FROM teams GROUP BY season_id")
        teams_by_season = self._count_map(cursor.fetchall())

        cursor.execute("""
            SELECT t.season_id, COUNT(DISTINCT mr.team_id) as count
            FROM match_results mr
            JOIN teams t ON mr.team_id = t.TeamID
            WHERE mr.is_playoffs = 1
            GROUP BY t.season_id
        """)
        playoffs_by_season = self._count_map(cursor.fetchall())

        return self._assemble_season_metrics(seasons, {
            'unique_players': players_by_season,
            'unique_teams': teams_by_season,
            'playoff_qualified': playoffs_by_season,
        })


    def get_league_trends(self, league_id):
        """
        Same as get_program_trends(), but scoped to a single league via
        the team_leagues junction table.
        """
        cursor = self.cursor
        seasons = self._get_seasons()

        cursor.execute("""
            SELECT t.season_id, COUNT(DISTINCT tm.user_id) as count
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.TeamID
            JOIN team_leagues tl ON t.TeamID = tl.team_id
            WHERE tl.league_id = %s
            GROUP BY t.season_id
        """, (league_id,))
        players_by_season = self._count_map(cursor.fetchall())

        cursor.execute("""
            SELECT t.season_id, COUNT(DISTINCT tl.team_id) as count
            FROM team_leagues tl
            JOIN teams t ON tl.team_id = t.TeamID
            WHERE tl.league_id = %s
            GROUP BY t.season_id
        """, (league_id,))
        teams_by_season = self._count_map(cursor.fetchall())

        cursor.execute("""
            SELECT t.season_id, COUNT(DISTINCT mr.team_id) as count
            FROM match_results mr
            JOIN teams t ON mr.team_id = t.TeamID
            JOIN team_leagues tl ON t.TeamID = tl.team_id
            WHERE tl.league_id = %s AND mr.is_playoffs = 1
            GROUP BY t.season_id
        """, (league_id,))
        playoffs_by_season = self._count_map(cursor.fetchall())

        return self._assemble_season_metrics(seasons, {
            'unique_players': players_by_season,
            'unique_teams': teams_by_season,
            'playoff_qualified': playoffs_by_season,
        })

    def get_all_league_trends(self):
        """
        Get per-season trend data for every league, keyed by league, for
        the "Trends by League" chart's League Filter. Only needed for
        All-Time.
        """
        cursor = self.cursor

        cursor.execute("SELECT id as league_id, name as league_name FROM league ORDER BY name ASC")
        leagues = cursor.fetchall()

        cursor.execute("SELECT season_id, season_name FROM seasons ORDER BY start_date ASC")
        seasons = cursor.fetchall()

        cursor.execute("""
            SELECT tl.league_id, t.season_id, COUNT(DISTINCT tm.user_id) as count
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.TeamID
            JOIN team_leagues tl ON t.TeamID = tl.team_id
            GROUP BY tl.league_id, t.season_id
        """)
        players = {(r['league_id'], r['season_id']): r['count'] for r in cursor.fetchall()}

        cursor.execute("""
            SELECT tl.league_id, t.season_id, COUNT(DISTINCT tl.team_id) as count
            FROM team_leagues tl
            JOIN teams t ON tl.team_id = t.TeamID
            GROUP BY tl.league_id, t.season_id
        """)
        team_counts = {(r['league_id'], r['season_id']): r['count'] for r in cursor.fetchall()}

        cursor.execute("""
            SELECT tl.league_id, t.season_id, COUNT(DISTINCT mr.team_id) as count
            FROM match_results mr
            JOIN teams t ON mr.team_id = t.TeamID
            JOIN team_leagues tl ON t.TeamID = tl.team_id
            WHERE mr.is_playoffs = 1
            GROUP BY tl.league_id, t.season_id
        """)
        playoffs = {(r['league_id'], r['season_id']): r['count'] for r in cursor.fetchall()}

        return [
            {
                'league_id': league['league_id'],
                'league_name': league['league_name'],
                'trends': self._assemble_season_metrics(seasons, {
                    'unique_players': players,
                    'unique_teams': team_counts,
                    'playoff_qualified': playoffs,
                }, group_id=league['league_id'])
            }
            for league in leagues
        ]

    # =====================================
    # COMMUNITY EVENT TRENDS
    # =====================================
    COMMUNITY_EVENT_TYPES = ['Match', 'Practice', 'Tournament', 'Event', 'Misc']

    def get_community_trends(self):
        """
        Get per-season event totals for the All-Time "Overall Event Trends"
        chart.

        Returns: list of dicts ordered oldest -> newest season.
        """
        cursor = self.cursor

        cursor.execute("SELECT season_id, season_name FROM seasons ORDER BY start_date ASC")
        seasons = cursor.fetchall()

        cursor.execute("SELECT season_id, COUNT(*) as count FROM generalevents GROUP BY season_id")
        total_by_season = {row['season_id']: row['count'] for row in cursor.fetchall()}

        cursor.execute("""
            SELECT season_id, EventType, COUNT(*) as count
            FROM generalevents
            GROUP BY season_id, EventType
        """)
        type_by_season = {}
        for row in cursor.fetchall():
            type_by_season.setdefault(row['season_id'], {})[row['EventType']] = row['count']

        cursor.execute("""
            SELECT ge.season_id, COUNT(DISTINCT ge.EventID) as count
            FROM generalevents ge
            JOIN event_partnerships ep ON ep.event_id = ge.EventID
            GROUP BY ge.season_id
        """)
        partnerships_by_season = {row['season_id']: row['count'] for row in cursor.fetchall()}

        cursor.execute("""
            SELECT season_id, COUNT(*) as count
            FROM generalevents
            WHERE is_scheduled = TRUE
            GROUP BY season_id
        """)
        scheduled_by_season = {row['season_id']: row['count'] for row in cursor.fetchall()}

        trends = self._assemble_season_metrics(seasons, {
            'total_events': total_by_season,
            'events_with_partnerships': partnerships_by_season,
            'scheduled_events': scheduled_by_season,
        })
        for t in trends:
            t['events_by_type'] = self._zero_filled_event_types(type_by_season.get(t['season_id'], {}))

        return trends


    def get_community_game_trends(self, game_id):
        """
        Same as get_community_trends(), but scoped to a single game via the
        event_games junction table.
        """
        cursor = self.cursor
        seasons = self._get_seasons()

        cursor.execute("""
            SELECT ge.season_id, COUNT(DISTINCT ge.EventID) as count
            FROM generalevents ge
            JOIN event_games eg ON eg.event_id = ge.EventID
            WHERE eg.game_id = %s
            GROUP BY ge.season_id
        """, (game_id,))
        total_by_season = self._count_map(cursor.fetchall())

        cursor.execute("""
            SELECT ge.season_id, ge.EventType, COUNT(DISTINCT ge.EventID) as count
            FROM generalevents ge
            JOIN event_games eg ON eg.event_id = ge.EventID
            WHERE eg.game_id = %s
            GROUP BY ge.season_id, ge.EventType
        """, (game_id,))
        type_by_season = {}
        for row in cursor.fetchall():
            type_by_season.setdefault(row['season_id'], {})[row['EventType']] = row['count']

        cursor.execute("""
            SELECT ge.season_id, COUNT(DISTINCT ge.EventID) as count
            FROM generalevents ge
            JOIN event_games eg ON eg.event_id = ge.EventID
            JOIN event_partnerships ep ON ep.event_id = ge.EventID
            WHERE eg.game_id = %s
            GROUP BY ge.season_id
        """, (game_id,))
        partnerships_by_season = self._count_map(cursor.fetchall())

        cursor.execute("""
            SELECT ge.season_id, COUNT(DISTINCT ge.EventID) as count
            FROM generalevents ge
            JOIN event_games eg ON eg.event_id = ge.EventID
            WHERE eg.game_id = %s AND ge.is_scheduled = TRUE
            GROUP BY ge.season_id
        """, (game_id,))
        scheduled_by_season = self._count_map(cursor.fetchall())

        trends = self._assemble_season_metrics(seasons, {
            'total_events': total_by_season,
            'events_with_partnerships': partnerships_by_season,
            'scheduled_events': scheduled_by_season,
        })
        for t in trends:
            t['events_by_type'] = self._zero_filled_event_types(type_by_season.get(t['season_id'], {}))

        return trends


    def get_all_community_game_trends(self):
        """
        Get per-season event trend data for every active game, keyed by
        game, for the "Trends by Game" chart's Game Filter. Only needed
        for All-Time.
        """
        cursor = self.cursor
        games = self.get_active_games()
        seasons = self._get_seasons()

        cursor.execute("""
            SELECT eg.game_id, ge.season_id, COUNT(DISTINCT ge.EventID) as count
            FROM generalevents ge
            JOIN event_games eg ON eg.event_id = ge.EventID
            GROUP BY eg.game_id, ge.season_id
        """)
        total = {(r['game_id'], r['season_id']): r['count'] for r in cursor.fetchall()}

        cursor.execute("""
            SELECT eg.game_id, ge.season_id, ge.EventType, COUNT(DISTINCT ge.EventID) as count
            FROM generalevents ge
            JOIN event_games eg ON eg.event_id = ge.EventID
            GROUP BY eg.game_id, ge.season_id, ge.EventType
        """)
        by_type = {}
        for r in cursor.fetchall():
            by_type.setdefault((r['game_id'], r['season_id']), {})[r['EventType']] = r['count']

        cursor.execute("""
            SELECT eg.game_id, ge.season_id, COUNT(DISTINCT ge.EventID) as count
            FROM generalevents ge
            JOIN event_games eg ON eg.event_id = ge.EventID
            JOIN event_partnerships ep ON ep.event_id = ge.EventID
            GROUP BY eg.game_id, ge.season_id
        """)
        partnerships = {(r['game_id'], r['season_id']): r['count'] for r in cursor.fetchall()}

        cursor.execute("""
            SELECT eg.game_id, ge.season_id, COUNT(DISTINCT ge.EventID) as count
            FROM generalevents ge
            JOIN event_games eg ON eg.event_id = ge.EventID
            WHERE ge.is_scheduled = TRUE
            GROUP BY eg.game_id, ge.season_id
        """)
        scheduled = {(r['game_id'], r['season_id']): r['count'] for r in cursor.fetchall()}

        result = []
        for game in games:
            game_id = game['game_id']
            trends = self._assemble_season_metrics(seasons, {
                'total_events': total,
                'events_with_partnerships': partnerships,
                'scheduled_events': scheduled,
            }, group_id=game_id)
            for t in trends:
                t['events_by_type'] = self._zero_filled_event_types(by_type.get((game_id, t['season_id']), {}))

            result.append({
                'game_id': game_id,
                'game_title': game['game_title'],
                'trends': trends,
            })

        return result


    def get_community_partnerships(self):
        """
        Get community partnerships for the "Partnerships" cards on the
        All-Time community overview. Mirrors get_notable_performances():
        one card per event/partnership pairing, most recent season first.

        An event can be tied to multiple games via event_games, but the
        card only shows one icon, so we take the lowest game_id per event.
        """
        cursor = self.cursor

        rows = self._fetch_seasonal("""
            SELECT
                ep.event_id as event_id,
                p.partnership_id as partnership_id,
                p.partnership_name as partnership_name,
                ge.EventName as event_name,
                s.season_name,
                s.start_date,
                (
                    SELECT eg.game_id
                    FROM event_games eg
                    WHERE eg.event_id = ge.EventID
                    ORDER BY eg.game_id ASC
                    LIMIT 1
                ) as game_id
            FROM event_partnerships ep
            JOIN partnerships p ON ep.partnership_id = p.partnership_id
            JOIN generalevents ge ON ep.event_id = ge.EventID
            JOIN seasons s ON ge.season_id = s.season_id
            WHERE p.is_active = 1
        """, season_where=" AND ge.season_id = %s")

        # Look up which of the referenced games actually have an icon,
        # same convention as get_active_games()/get_notable_performances()
        game_ids = {row['game_id'] for row in rows if row['game_id'] is not None}
        has_image = {}
        if game_ids:
            placeholders = ','.join(['%s'] * len(game_ids))
            cursor.execute(f"""
                SELECT GameID as game_id, CASE WHEN GameImage IS NOT NULL THEN 1 ELSE 0 END as has_image
                FROM games
                WHERE GameID IN ({placeholders})
            """, tuple(game_ids))
            has_image = {r['game_id']: r['has_image'] for r in cursor.fetchall()}

        return self._build_partnership_cards(
            rows, lambda row: f"/game-image/{row['game_id']}" if has_image.get(row['game_id']) else None
        )


    def get_community_partnerships_for_game(self, game_id):
        """
        Same as get_community_partnerships(), but scoped to a single game via
        the event_games junction table (mirrors the join used by
        get_community_game_trends()). Used by the Community tab's per-game
        Partnerships section.
        """
        cursor = self.cursor

        query = """
            SELECT
                ep.event_id as event_id,
                p.partnership_id as partnership_id,
                p.partnership_name as partnership_name,
                ge.EventName as event_name,
                s.season_name,
                s.start_date
            FROM event_partnerships ep
            JOIN partnerships p ON ep.partnership_id = p.partnership_id
            JOIN generalevents ge ON ep.event_id = ge.EventID
            JOIN event_games eg ON eg.event_id = ge.EventID
            JOIN seasons s ON ge.season_id = s.season_id
            WHERE p.is_active = 1 AND eg.game_id = %s
        """
        params = [game_id]

        if self.season_id:
            query += " AND ge.season_id = %s"
            params.append(self.season_id)

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        # Same convention as get_community_partnerships()/get_active_games():
        # only show an icon if the game actually has one uploaded
        cursor.execute("""
                SELECT CASE WHEN GameImage IS NOT NULL THEN 1 ELSE 0 END as has_image
                FROM games WHERE GameID = %s
            """, (game_id,))
        image_row = cursor.fetchone()
        icon_url = f"/game-image/{game_id}" if image_row and image_row['has_image'] else None

        return self._build_partnership_cards(rows, lambda row: icon_url)


    def get_community_event_types_for_game(self, game_id):
        """
        Count events of each type for a single game/season, for the
        Community tab's per-game league-panel row + bar chart.
        """
        trends = self.get_community_game_trends(game_id)

        if self.season_id:
            season_trend = next((t for t in trends if t['season_id'] == self.season_id), None)
            return dict(season_trend['events_by_type']) if season_trend else {t: 0 for t in self.COMMUNITY_EVENT_TYPES}

        events_by_type_total = {t: 0 for t in self.COMMUNITY_EVENT_TYPES}
        for trend in trends:
            for event_type, count in trend['events_by_type'].items():
                events_by_type_total[event_type] += count

        return events_by_type_total


    def get_community_events_for_game(self, game_id):
        """
        Get the full list of events for a single game/season, formatted
        for the Community tab's per-game event table.
        """
        cursor = self.cursor

        season_names = {}
        season_order = {}
        if not self.season_id:
            cursor.execute("SELECT season_id, season_name FROM seasons ORDER BY start_date DESC")
            all_seasons = cursor.fetchall()
            season_names = {s['season_id']: s['season_name'] for s in all_seasons}
            season_order = {s['season_id']: idx for idx, s in enumerate(all_seasons)}

        query = """
            SELECT DISTINCT ge.EventID, ge.EventName, ge.Date, ge.StartTime,
                   ge.EventType, ge.Description, ge.season_id
            FROM generalevents ge
            JOIN event_games eg ON eg.event_id = ge.EventID
            WHERE eg.game_id = %s
        """
        params = [game_id]
        if self.season_id:
            query += " AND ge.season_id = %s"
            params.append(self.season_id)
        query += " ORDER BY ge.Date DESC, ge.StartTime DESC"

        cursor.execute(query, tuple(params))
        events = cursor.fetchall()

        if not events:
            return []

        # An event can list more than one game — pull the full associated
        # list per event in one query rather than one query per event
        event_ids = [e['EventID'] for e in events]
        placeholders = ','.join(['%s'] * len(event_ids))
        cursor.execute(f"""
            SELECT eg.event_id, g.GameTitle
            FROM event_games eg
            JOIN games g ON eg.game_id = g.GameID
            WHERE eg.event_id IN ({placeholders})
            ORDER BY g.GameTitle ASC
        """, tuple(event_ids))
        games_by_event = {}
        for row in cursor.fetchall():
            games_by_event.setdefault(row['event_id'], []).append(row['GameTitle'])

        result = []
        for event in events:
            result.append({
                'id': event['EventID'],
                'name': event['EventName'],
                'date': event['Date'].strftime('%B %d, %Y') if event['Date'] else None,
                'start_time': format_time_to_12hr(event['StartTime']) if event['StartTime'] else None,
                'event_type': event['EventType'] or 'Event',
                'associated_games': games_by_event.get(event['EventID'], []),
                'description': event['Description'] or 'No description provided',
                'season_id': event['season_id'],
                'season_name': None if self.season_id else season_names.get(event['season_id']),
            })

        # All-Time view: group by season, most recent first — a stable sort
        # on season rank alone is enough since the SQL above already sorted
        # each season's events by date descending
        if not self.season_id:
            result.sort(key=lambda r: season_order.get(r['season_id'], len(season_order)))

        return result


    def get_community_scorecard(self):
        """
        Community "Events Scorecard" summary stats: totals, breakdown by
        event type, the highest single-season event count, total scheduled
        events, and the per-type average per season.

        All-Time aggregates across every season via community_trends.
        """
        if self.season_id:
            cursor = self.cursor

            cursor.execute("SELECT COUNT(*) as count FROM generalevents WHERE season_id = %s",
                            (self.season_id,))
            total_events = cursor.fetchone()['count']

            cursor.execute("""
                SELECT EventType, COUNT(*) as count
                FROM generalevents
                WHERE season_id = %s
                GROUP BY EventType
            """, (self.season_id,))
            events_by_type = self._zero_filled_event_types(self._count_map(cursor.fetchall(), key='EventType'))

            cursor.execute("SELECT COUNT(*) as count FROM generalevents WHERE season_id = %s AND is_scheduled = TRUE",
                            (self.season_id,))
            total_scheduled = cursor.fetchone()['count']

            cursor.execute("SELECT season_name FROM seasons WHERE season_id = %s", (self.season_id,))
            season_row = cursor.fetchone()

            # Single season: "highest" and "avg" both just reflect this
            # one season since there's nothing else to compare/average.
            return {
                'total_events': total_events,
                'events_by_type': events_by_type,
                'highest_season_event_count': total_events,
                'highest_season_name': season_row['season_name'] if season_row else None,
                'total_scheduled_events': total_scheduled,
                'avg_events_by_type': events_by_type,
            }

        trends = self.get_community_trends()

        total_events = sum(t['total_events'] for t in trends)
        total_scheduled = sum(t['scheduled_events'] for t in trends)

        events_by_type_total = {t: 0 for t in self.COMMUNITY_EVENT_TYPES}
        for t in trends:
            for event_type, count in t['events_by_type'].items():
                events_by_type_total[event_type] += count

        season_count = len(trends) or 1
        avg_events_by_type = {
            event_type: round(count / season_count, 1)
            for event_type, count in events_by_type_total.items()
        }

        highest_season = max(trends, key=lambda t: t['total_events'], default=None)

        return {
            'total_events': total_events,
            'events_by_type': events_by_type_total,
            'highest_season_event_count': highest_season['total_events'] if highest_season else 0,
            'highest_season_name': highest_season['season_name'] if highest_season else None,
            'total_scheduled_events': total_scheduled,
            'avg_events_by_type': avg_events_by_type,
        }


    def get_community_division_breakdown(self):
        """
        Get event counts per game, grouped by game Division, for the
        "Events Scorecard" panels (one panel per division, bars = games
        in that division, bar height = event count).
        """
        rows = self._fetch_seasonal("""
            SELECT
                COALESCE(g.Division, 'Other') as division,
                g.GameID as game_id,
                g.GameTitle as game_title,
                g.Abbreviation as game_abbreviation,
                COUNT(DISTINCT eg.event_id) as event_count
            FROM games g
            JOIN event_games eg ON eg.game_id = g.GameID
            JOIN generalevents ge ON ge.EventID = eg.event_id
        """, season_where=" WHERE ge.season_id = %s",
                            suffix=" GROUP BY COALESCE(g.Division, 'Other'), g.GameID, g.GameTitle ORDER BY division ASC, event_count DESC")

        divisions = {}
        for row in rows:
            divisions.setdefault(row['division'], []).append({
                'game_id': row['game_id'],
                'game_title': row['game_title'],
                'game_abbreviation': row['game_abbreviation'] or row['game_title'],
                'event_count': row['event_count'],
            })

        # Stable ordering matching the create/edit game form's division list
        division_order = ['Strategy', 'Shooter', 'Sports', 'Other']

        return [
            {'division_name': division, 'games': divisions[division]}
            for division in division_order
            if division in divisions
        ]


    def get_total_games_in_database(self):
        """Count all games in database (including non-competitive)"""
        return self._scalar_count("SELECT COUNT(DISTINCT GameID) as count FROM games")

    def get_community_members(self):
        """Count unique members in game communities"""
        return self._scalar_count("SELECT COUNT(DISTINCT user_id) as count FROM in_communities")
    
    def get_fielded_players(self):
        """Count players who are on at least one team"""
        return self.get_unique_players()
    
    def get_unique_teams(self):
        """Count total unique teams"""
        return self._scalar_count(
            "SELECT COUNT(TeamID) as count FROM teams",
            " WHERE season_id = %s"
        )
    
    # =====================================
    # PLAYER STATISTICS
    # =====================================
    def get_new_players(self, reference_season_id=None):
        """Count players who joined in current season (new to program)"""
        if not self.season_id:
            return 0

        reference_season_id = reference_season_id or self._get_previous_season_id()
        if not reference_season_id:
            return self.get_unique_players()  # no previous season, everyone is "new"

        return self._count_players_relative_to_season(self.season_id, reference_season_id, exclude=True)


    def get_returning_players(self, reference_season_id=None):
        """Count players who returned from previous season"""
        if not self.season_id:
            return 0

        reference_season_id = reference_season_id or self._get_previous_season_id()
        if not reference_season_id:
            return 0

        return self._count_players_relative_to_season(self.season_id, reference_season_id, exclude=False)


    def get_did_not_return(self, reference_season_id=None):
        """Count players from reference season who didn't return to current season"""
        if not self.season_id:
            return 0

        reference_season_id = reference_season_id or self._get_previous_season_id()
        if not reference_season_id:
            return 0

        return self._count_players_relative_to_season(reference_season_id, self.season_id, exclude=True)


    def get_multi_team_players(self):
        """Count players competing in multiple teams"""
        query = """
            SELECT COUNT(*) as count
            FROM (
                SELECT tm.user_id, COUNT(DISTINCT tm.team_id) as team_count
                FROM team_members tm
                JOIN teams t ON tm.team_id = t.TeamID
        """
        params = ()
        if self.season_id:
            query += " WHERE t.season_id = %s"
            params = (self.season_id,)
        query += """
                GROUP BY tm.user_id
                HAVING team_count > 1
            ) as multi_team
        """

        self.cursor.execute(query, params)
        result = self.cursor.fetchone()
        return result['count'] if result else 0


    # =====================================
    # PLAYOFFS PLACEMENT STATISTICS
    # =====================================
    def get_playoffs_qualified_count(self):
        """
        Count distinct teams that made playoffs at all: any team with at
        least one match_results row flagged is_playoffs = 1.
        """
        return self._scalar_count("""
            SELECT COUNT(DISTINCT mr.team_id) as count
            FROM match_results mr
            JOIN teams t ON mr.team_id = t.TeamID
            WHERE mr.is_playoffs = 1
        """, " AND t.season_id = %s")

    def get_regular_season_count(self):
        """
        Count distinct teams with at least one recorded match_results row,
        regardless of whether it was a playoffs or regular-season match.
        """
        return self._scalar_count("""
            SELECT COUNT(DISTINCT mr.team_id) as count
            FROM match_results mr
            JOIN teams t ON mr.team_id = t.TeamID
        """, " WHERE t.season_id = %s")

    def get_playoffs_placements(self):
        # Query the playoffs results table
        placements = playoffs_results.get_playoffs_results_for_season(self.mysql, self.season_id)

        """ 
        Convert exact-bucket counts into cumulative "Top N" counts:
        e.g. Top 8 (quarterfinals) should include every team that
        reached quarterfinals or further (semis, finals, winner),
        not just teams whose final placement was exactly "Quarterfinals"
        """
        placements = self._cumulate_placements(placements)

        """ 
        Playoffs means total teams that made playoffs at all,
        not the "Playoffs" placement bucket
        """
        placements['playoffs'] = self.get_playoffs_qualified_count()

        """Regular Season means total teams with at least one recorded match"""
        placements['regular_season'] = self.get_regular_season_count()

        # Playoff % = teams that made playoffs / total teams fielded
        total_teams = self.get_unique_teams()
        placements['playoff_pct'] = round((placements['playoffs'] / total_teams) * 100, 1) if total_teams else 0

        return placements


    def get_notable_performances(self):
        """
        Get teams with notable playoffs performances for the "Notable
        Performances" cards on the All-Time overview.

        A notable performance is any placement of Winner, Semifinals
        (Top 2), or Quarterfinals (Top 4). Results are ordered by
        placement priority (Winner first, then Top 2, then Top 4), with
        the most recent season first within each tier.
        """
        rows = self._fetch_seasonal("""
            SELECT
                pr.result_id as result_id,
                t.teamName as team_name,
                t.gameID as game_id,
                CASE WHEN g.GameImage IS NOT NULL THEN 1 ELSE 0 END as has_game_image,
                l.name as league_name,
                s.season_name,
                s.start_date,
                pr.placement
            FROM playoffs_results pr
            JOIN teams t ON pr.team_id = t.TeamID
            JOIN games g ON t.gameID = g.GameID
            JOIN seasons s ON pr.season_id = s.season_id
            LEFT JOIN league l ON pr.league_id = l.id
            WHERE pr.placement IN ('Winner', 'Semifinals', 'Quarterfinals')
        """, season_where=" AND pr.season_id = %s")

        priority = {'Winner': 0, 'Semifinals': 1, 'Quarterfinals': 2}
        # DB placement -> display label, per current card design
        placement_labels = {'Winner': '1st', 'Semifinals': 'Finals', 'Quarterfinals': 'Semifinals'}

        performances = []
        for row in rows:
            performances.append({
                'id': row['result_id'],
                'team_name': row['team_name'],
                'game_icon_url': f"/game-image/{row['game_id']}" if row['has_game_image'] else None,
                'season_name': row['season_name'],
                'league_name': row['league_name'] or 'League',
                'placement': placement_labels.get(row['placement'], row['placement']),
                '_priority': priority.get(row['placement'], 99),
                '_start_date': row['start_date'],
            })

        performances.sort(key=lambda p: (p['_priority'], p['_start_date'] is None,
                                         p['_start_date'].toordinal() * -1 if p['_start_date'] else 0))

        for p in performances:
            p.pop('_priority', None)
            p.pop('_start_date', None)

        return performances

    # =====================================
    # LEAGUE-SPECIFIC STATISTICS
    # =====================================
    def get_league_breakdown(self):
        """Get statistics broken down by league"""
        leagues = self._fetch_seasonal("""
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
        """, season_where=" WHERE t.season_id = %s", suffix=" GROUP BY l.id, l.name")

        # Community members per league, in one query instead of one-per-league
        self.cursor.execute("""
            SELECT tl.league_id, COUNT(DISTINCT ic.user_id) as count
            FROM team_leagues tl
            JOIN teams t ON tl.team_id = t.TeamID
            JOIN in_communities ic ON ic.game_id = t.gameID
            GROUP BY tl.league_id
        """)
        community_by_league = self._count_map(self.cursor.fetchall(), key='league_id')

        for league in leagues:
            league['community_members'] = community_by_league.get(league['league_id'], 0)

        return leagues


    # =====================================
    # GAME-SPECIFIC STATISTICS
    # =====================================
    def get_game_statistics(self, game_id):
        """
        Get per-team statistics for a specific game, formatted for the
        admin statistics page's per-game tab view.
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

        team_query = "SELECT TeamID, teamName, season_id FROM teams WHERE gameID = %s"
        params = [game_id]
        if self.season_id:
            team_query += " AND season_id = %s"
            params.append(self.season_id)
        team_query += " ORDER BY teamName ASC"

        cursor.execute(team_query, tuple(params))
        teams = cursor.fetchall()

        if not teams:
            return {'game_id': game_id, 'game_manager': game_manager, 'teams': []}

        team_ids = [t['TeamID'] for t in teams]
        placeholders = ','.join(['%s'] * len(team_ids))

        # Historical Game Manager per season — from the season_roles snapshot,
        # so past seasons show who was GM at the time, not the current GM.
        cursor.execute("""
            SELECT sr.season_id, u.firstname, u.lastname
            FROM season_roles sr
            JOIN users u ON sr.userid = u.id
            WHERE sr.gm_game_id = %s AND sr.is_gm = 1
        """, (game_id,))
        season_gm_map = {
            row['season_id']: f"{row['firstname']} {row['lastname']}"
            for row in cursor.fetchall()
        }

        season_names = {}
        season_order = {}
        if not self.season_id:
            cursor.execute("SELECT season_id, season_name FROM seasons ORDER BY start_date DESC")
            all_seasons = cursor.fetchall()
            season_names = {s['season_id']: s['season_name'] for s in all_seasons}
            season_order = {s['season_id']: idx for idx, s in enumerate(all_seasons)}

        # Leagues for every team in one query (a team can be in more than one)
        cursor.execute(f"""
            SELECT tl.team_id, l.id as league_id, l.name as league_name
            FROM team_leagues tl
            JOIN league l ON tl.league_id = l.id
            WHERE tl.team_id IN ({placeholders})
            ORDER BY l.name
        """, tuple(team_ids))
        leagues_by_team = {}
        for row in cursor.fetchall():
            leagues_by_team.setdefault(row['team_id'], []).append(
                {'league_id': row['league_id'], 'league_name': row['league_name']}
            )

        # Every match for every team in one query. Bucketed two ways:
        # by (team, league) for teams with a league, and by team alone as
        # a catch-all for teams not yet in any league (which show one
        # unfiltered row, matching the original league_clause == "" case).
        cursor.execute(f"""
            SELECT mr.team_id, ge.league_id, mr.is_playoffs, ge.EventName as label,
                   mr.opponent_school, mr.result, mr.team_score, mr.opponent_score
            FROM match_results mr
            JOIN generalevents ge ON mr.event_id = ge.EventID
            WHERE mr.team_id IN ({placeholders})
            ORDER BY ge.Date ASC, ge.StartTime ASC
        """, tuple(team_ids))

        matches_by_team_league = {}
        matches_by_team = {}
        for row in cursor.fetchall():
            bucket_key = 'playoffs' if row['is_playoffs'] else 'regular'
            matches_by_team_league.setdefault(
                (row['team_id'], row['league_id']), {'regular': [], 'playoffs': []}
            )[bucket_key].append(row)
            matches_by_team.setdefault(
                row['team_id'], {'regular': [], 'playoffs': []}
            )[bucket_key].append(row)

        # Every playoffs placement for every team/league in one query
        placement_query = f"""
            SELECT team_id, league_id, placement
            FROM playoffs_results
            WHERE team_id IN ({placeholders})
        """
        placement_params = list(team_ids)
        if self.season_id:
            placement_query += " AND season_id = %s"
            placement_params.append(self.season_id)
        cursor.execute(placement_query, tuple(placement_params))
        placement_by_team_league = {}
        for row in cursor.fetchall():
            placement_by_team_league.setdefault((row['team_id'], row['league_id']), row['placement'])

        result_rows = []
        for team in teams:
            team_id = team['TeamID']
            team_leagues = leagues_by_team.get(team_id) or [{'league_id': None, 'league_name': None}]

            for tl in team_leagues:
                league_id = tl['league_id']

                bucket = (matches_by_team_league.get((team_id, league_id))
                          if league_id is not None else matches_by_team.get(team_id)) \
                          or {'regular': [], 'playoffs': []}

                regular_matches = self._format_matches(bucket['regular'])
                playoffs_matches = self._format_matches(bucket['playoffs'])

                wins = sum(1 for m in regular_matches if m['result'] == 'win')
                losses = sum(1 for m in regular_matches if m['result'] == 'loss')
                regular_season_record = f"{wins}-{losses}"

                placement = placement_by_team_league.get((team_id, league_id)) if league_id is not None else None
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
                    'game_manager': season_gm_map.get(team['season_id'], game_manager),
                    'regular_season_matches': regular_matches,
                    'regular_season_record': regular_season_record,
                    'playoffs_matches': playoffs_matches,
                    'playoffs_status': playoffs_status,
                    'playoffs_outcome': playoffs_outcome,
                })

        # Group primarily by league. For the All-Time view (no season
        # filter), group by season first — most recent season on top.
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
        """Get playoffs results grouped by league."""
        cursor = self.cursor

        leagues = self._fetch_seasonal("""
                    SELECT DISTINCT l.id, l.name, l.logo
                    FROM league l
                    JOIN team_leagues tl ON l.id = tl.league_id
                    JOIN teams t ON tl.team_id = t.TeamID
                """, season_where=" WHERE t.season_id = %s", suffix=" ORDER BY l.name")

        if not leagues:
            return []

        placement_map = {
            'Winner': 'winners', 'Finals': 'finals', 'Semifinals': 'semifinals',
            'Quarterfinals': 'quarterfinals', 'Playoffs': 'playoffs',
            'Did Not Qualify': 'regular_season'
        }

        # Placement bucket counts, grouped by league in one query
        placement_rows = self._fetch_seasonal(
            "SELECT league_id, placement, COUNT(*) as count FROM playoffs_results",
            season_where=" WHERE season_id = %s", suffix=" GROUP BY league_id, placement"
        )
        placements_by_league = {}
        for row in placement_rows:
            key = placement_map.get(row['placement'])
            if key:
                placements_by_league.setdefault(row['league_id'], {})[key] = row['count']

        # "Playoffs" = total teams per league that made playoffs at all
        playoffs_qualified_by_league = self._count_map(self._fetch_seasonal("""
                    SELECT tl.league_id, COUNT(DISTINCT mr.team_id) as count
                    FROM match_results mr
                    JOIN teams t ON mr.team_id = t.TeamID
                    JOIN team_leagues tl ON t.TeamID = tl.team_id
                    WHERE mr.is_playoffs = 1
                """, season_where=" AND t.season_id = %s", suffix=" GROUP BY tl.league_id"), key='league_id')

        # "Regular Season" = total teams per league with at least one recorded match
        regular_season_by_league = self._count_map(self._fetch_seasonal("""
                    SELECT tl.league_id, COUNT(DISTINCT mr.team_id) as count
                    FROM match_results mr
                    JOIN teams t ON mr.team_id = t.TeamID
                    JOIN team_leagues tl ON t.TeamID = tl.team_id
                """, season_where=" WHERE t.season_id = %s", suffix=" GROUP BY tl.league_id"), key='league_id')

        # Total teams per league
        total_teams_by_league = self._count_map(self._fetch_seasonal("""
                    SELECT tl.league_id, COUNT(DISTINCT t.TeamID) as count
                    FROM teams t
                    JOIN team_leagues tl ON t.TeamID = tl.team_id
                """, season_where=" WHERE t.season_id = %s", suffix=" GROUP BY tl.league_id"), key='league_id')

        # Teams per league with a recorded match but no final placement yet
        in_progress_query = """
            SELECT tl.league_id, COUNT(DISTINCT t.TeamID) as count
            FROM teams t
            JOIN team_leagues tl ON t.TeamID = tl.team_id
            LEFT JOIN playoffs_results tr ON tr.team_id = t.TeamID AND tr.league_id = tl.league_id
        """
        in_progress_params = []
        if self.season_id:
            in_progress_query += " AND tr.season_id = %s"
            in_progress_params.append(self.season_id)
        in_progress_query += """
            WHERE tr.result_id IS NULL
            AND EXISTS (SELECT 1 FROM match_results mr WHERE mr.team_id = t.TeamID)
        """
        if self.season_id:
            in_progress_query += " AND t.season_id = %s"
            in_progress_params.append(self.season_id)
        in_progress_query += " GROUP BY tl.league_id"
        cursor.execute(in_progress_query, tuple(in_progress_params))
        in_progress_by_league = self._count_map(cursor.fetchall(), key='league_id')

        result = []
        for league in leagues:
            league_id = league['id']

            placements = {
                'winners': 0, 'finals': 0, 'semifinals': 0, 'quarterfinals': 0,
                'playoffs': 0, 'regular_season': 0, 'in_progress': 0,
            }
            placements.update(placements_by_league.get(league_id, {}))
            placements = self._cumulate_placements(placements)

            placements['playoffs'] = playoffs_qualified_by_league.get(league_id, 0)
            placements['regular_season'] = regular_season_by_league.get(league_id, 0)
            placements['in_progress'] = in_progress_by_league.get(league_id, 0)

            result.append({
                'league_id': league_id,
                'league_name': league['name'],
                'league_logo_url': league['logo'],
                'total_teams': total_teams_by_league.get(league_id, 0),
                'completed_teams': placements['regular_season'],
                **placements
            })

        return result


    def get_all_statistics(self):
        """Get all statistics in one comprehensive dictionary"""
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
            'program_trends': self.get_program_trends() if not self.season_id else [],
            'league_trends': self.get_all_league_trends() if not self.season_id else [],
            'notable_performances': self.get_notable_performances() if not self.season_id else [],
            'community_trends': self.get_community_trends() if not self.season_id else [],
            'community_game_trends': self.get_all_community_game_trends() if not self.season_id else [],
            'community_partnerships': self.get_community_partnerships(),
            'community_scorecard': self.get_community_scorecard(),
            'community_division_breakdown': self.get_community_division_breakdown(),
        }
        
        return stats


def register_statistics_routes(app, mysql, login_required, roles_required):
    """Register statistics routes with the Flask app"""

    @app.route('/admin/statistics')
    @login_required
    @roles_required('admin', 'developer')
    def admin_statistics():
        """Display comprehensive statistics page"""
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
        """API endpoint to get statistics as JSON"""
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
        """Get detailed statistics for a specific game"""
        season_id = request.args.get('season_id', type=int)

        with EsportsStatistics(mysql, season_id) as stats:
            game_stats = stats.get_game_statistics(game_id)

        return jsonify({
            'success': True,
            'statistics': game_stats
        }), 200


    @app.route('/api/admin/statistics/game/<int:game_id>/community')
    @login_required
    @roles_required('admin', 'developer')
    def api_game_community_statistics(game_id):
        """
        Get community statistics for a specific game (Community tab's
        per-game view): game-scoped partnerships, event-type totals for
        the league-panel bar chart, and the full event list.
        """
        season_id = request.args.get('season_id', type=int)

        with EsportsStatistics(mysql, season_id) as stats:
            partnerships = stats.get_community_partnerships_for_game(game_id)
            events_by_type = stats.get_community_event_types_for_game(game_id)
            events = stats.get_community_events_for_game(game_id)

        return jsonify({
            'success': True,
            'statistics': {
                'game_id': game_id,
                'partnerships': partnerships,
                'events_by_type': events_by_type,
                'events': events,
            }
        }), 200