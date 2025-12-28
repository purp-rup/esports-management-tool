"""
Seasons Management Module
Handles CRUD operations for seasons in the Esports Management Tool
"""

from flask import jsonify, request, session
import MySQLdb.cursors
from datetime import datetime, date
from apscheduler.schedulers.background import BackgroundScheduler
import atexit
import os


# =====================================
# Automatic End Season System
# ======================================
def check_and_end_expired_seasons(mysql, app):
    """
    Background task to automatically end seasons that have passed their end date.
    Performs all end-season procedures:
    1. Takes final snapshot of GM game assignments
    2. Removes player roles from all users
    3. Deactivates the season
    """
    print(f"[{datetime.now()}] Starting season expiration check...")

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Find active seasons that have passed their end date
        cursor.execute("""
            SELECT season_id, season_name, end_date
            FROM seasons
            WHERE is_active = 1 AND end_date < %s
        """, (date.today(),))

        expired_seasons = cursor.fetchall()

        if not expired_seasons:
            print(f"[{datetime.now()}] No expired seasons found")
            return

        for season in expired_seasons:
            print(
                f"[{datetime.now()}] Processing expired season: {season['season_name']} (ID: {season['season_id']})")

            # Take final snapshot of GM game assignments
            cursor.execute("""
                SELECT userid, is_gm
                FROM season_roles
                WHERE season_id = %s AND is_gm = 1
            """, (season['season_id'],))

            gms = cursor.fetchall()
            gm_count = 0

            for gm in gms:
                user_id = gm['userid']
                cursor.execute("""
                    SELECT GameID 
                    FROM games 
                    WHERE gm_id = %s 
                    LIMIT 1
                """, (user_id,))

                game_result = cursor.fetchone()

                if game_result:
                    gm_game_id = game_result['GameID']
                    cursor.execute("""
                        UPDATE season_roles
                        SET gm_game_id = %s
                        WHERE userid = %s AND season_id = %s
                    """, (gm_game_id, user_id, season['season_id']))
                    gm_count += 1

            print(f"[{datetime.now()}] Snapshotted {gm_count} GM game assignments")

            # Remove Player role from ALL users
            cursor.execute("""
                UPDATE permissions
                SET is_player = 0
            """)

            players_removed = cursor.rowcount
            print(f"[{datetime.now()}] Removed player role from {players_removed} users")

            # Deactivate the season
            cursor.execute("""
                UPDATE seasons
                SET is_active = 0
                WHERE season_id = %s
            """, (season['season_id'],))

            print(
                f"[{datetime.now()}] ✅ Auto-ended expired season: {season['season_name']} (ended {season['end_date']})")

        mysql.connection.commit()
        print(f"[{datetime.now()}] Season expiration check completed - {len(expired_seasons)} season(s) ended")

    except Exception as e:
        mysql.connection.rollback()
        print(f"[{datetime.now()}] ❌ Error checking/ending expired seasons: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()

# ============================
# SCHEDULER - Module level
# ============================
def initialize_season_scheduler(app, mysql):
    """Initialize the season expiration scheduler"""

    def scheduled_season_check_wrapper():
        """Wrapper ensures the scheduler runs safely within the Flask app context"""
        print(f"[{datetime.now()}] ===== SEASON EXPIRATION SCHEDULER TRIGGERED =====")
        with app.app_context():
            try:
                check_and_end_expired_seasons(mysql, app)
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"[{datetime.now()}] Error in season expiration scheduler: {str(e)}")

    # Only start scheduler in the main process
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
        season_scheduler = BackgroundScheduler()

        season_scheduler.add_job(
            func=scheduled_season_check_wrapper,
            trigger="cron",
            hour=0,
            minute=5,
            id="season_expiration_job",
            replace_existing=True
        )

        season_scheduler.start()
        print(f"[{datetime.now()}] Season expiration scheduler started - checking daily at 12:05 AM")

        atexit.register(lambda: season_scheduler.shutdown(wait=False))

## =================================
## REGISTER SEASONS FUNCTIONS
## =================================
def register_seasons_routes(app, mysql, login_required, roles_required, get_user_permissions):
    """Register all season-related routes"""

    @app.route('/api/seasons/current', methods=['GET'])
    @login_required
    def get_current_season():
        """Get the currently active season"""

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("""
                SELECT season_id, season_name, start_date, end_date, 
                       is_active, created_at, created_by
                FROM seasons
                WHERE is_active = 1
                LIMIT 1
            """)

            season = cursor.fetchone()

            if season:
                # Format dates for JSON
                season['start_date'] = season['start_date'].strftime('%Y-%m-%d')
                season['end_date'] = season['end_date'].strftime('%Y-%m-%d')
                season['created_at'] = season['created_at'].strftime('%Y-%m-%d %H:%M:%S')

                return jsonify({
                    'success': True,
                    'season': season
                })
            else:
                return jsonify({
                    'success': True,
                    'season': None
                })

        except Exception as e:
            print(f"Error fetching current season: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to fetch current season'
            }), 500
        finally:
            cursor.close()

    @app.route('/api/seasons/history', methods=['GET'])
    @login_required
    @roles_required('admin', 'developer')
    def get_season_history():
        """Get all past seasons"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("""
                SELECT s.season_id, s.season_name, s.start_date, s.end_date,
                       s.is_active, s.created_at, s.created_by,
                       u.username as creator_username
                FROM seasons s
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.is_active = 0
                ORDER BY s.end_date DESC
            """)

            seasons = cursor.fetchall()

            # Format dates
            for season in seasons:
                season['start_date'] = season['start_date'].strftime('%Y-%m-%d')
                season['end_date'] = season['end_date'].strftime('%Y-%m-%d')
                season['created_at'] = season['created_at'].strftime('%Y-%m-%d %H:%M:%S')

            return jsonify({
                'success': True,
                'seasons': seasons
            })

        except Exception as e:
            print(f"Error fetching season history: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to fetch season history'
            }), 500
        finally:
            cursor.close()

    @app.route('/api/seasons/create', methods=['POST'])
    @login_required
    @roles_required('admin', 'developer')
    def create_season():
        """
        Create a new season
        NOW INCLUDES: Automatic reassignment of events that fall within the new season's date range
        """
        data = request.get_json()
        season_name = data.get('season_name')
        start_date = data.get('start_date')
        end_date = data.get('end_date')

        if not season_name or not start_date or not end_date:
            return jsonify({
                'success': False,
                'message': 'Season name, start date, and end date are required'
            }), 400

        # Validate dates
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d')
            end = datetime.strptime(end_date, '%Y-%m-%d')

            if end <= start:
                return jsonify({
                    'success': False,
                    'message': 'End date must be after start date'
                }), 400

        except ValueError:
            return jsonify({
                'success': False,
                'message': 'Invalid date format'
            }), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Check if there's already an active season
            cursor.execute("SELECT season_id FROM seasons WHERE is_active = 1")
            active_season = cursor.fetchone()

            if active_season:
                return jsonify({
                    'success': False,
                    'message': 'There is already an active season. Please end it before creating a new one.'
                }), 400

            # Create new season
            cursor.execute("""
                INSERT INTO seasons (season_name, start_date, end_date, is_active, created_by)
                VALUES (%s, %s, %s, 1, %s)
            """, (season_name, start_date, end_date, session['id']))

            mysql.connection.commit()
            new_season_id = cursor.lastrowid

            # Snapshot all current permissions to this season
            from EsportsManagementTool import season_roles
            users_snapshotted = season_roles.snapshot_all_permissions_to_season(mysql, new_season_id)

            print(f"Snapshotted {users_snapshotted} users' permissions to season {new_season_id}")

            # Reassign events that fall within this new season's date range
            cursor.execute("""
                UPDATE generalevents
                SET season_id = %s
                WHERE Date BETWEEN %s AND %s
            """, (new_season_id, start_date, end_date))

            reassigned_events = cursor.rowcount
            mysql.connection.commit()

            if reassigned_events > 0:
                print(f"✅ Reassigned {reassigned_events} events to new season '{season_name}'")

            return jsonify({
                'success': True,
                'message': f'Season "{season_name}" created successfully with {users_snapshotted} users and {reassigned_events} events reassigned',
                'season_id': new_season_id,
                'events_reassigned': reassigned_events
            })

        except Exception as e:
            mysql.connection.rollback()
            print(f"Error creating season: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to create season'
            }), 500
        finally:
            cursor.close()

    @app.route('/api/seasons/<int:season_id>/update', methods=['PUT'])
    @login_required
    @roles_required('admin', 'developer')
    def update_season(season_id):
        """
        Update an existing season
        NOW INCLUDES: Reassign events if end date changes to include new dates
        """
        data = request.get_json()
        season_name = data.get('season_name')
        end_date = data.get('end_date')

        if not season_name or not end_date:
            return jsonify({
                'success': False,
                'message': 'Season name and end date are required'
            }), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Verify season exists and is active
            cursor.execute("""
                SELECT season_id, start_date, end_date
                FROM seasons
                WHERE season_id = %s AND is_active = 1
            """, (season_id,))

            season = cursor.fetchone()

            if not season:
                return jsonify({
                    'success': False,
                    'message': 'Active season not found'
                }), 404

            # Validate new end date
            try:
                start = season['start_date']
                end = datetime.strptime(end_date, '%Y-%m-%d').date()

                if end <= start:
                    return jsonify({
                        'success': False,
                        'message': 'End date must be after start date'
                    }), 400

            except ValueError:
                return jsonify({
                    'success': False,
                    'message': 'Invalid date format'
                }), 400

            # Update season
            cursor.execute("""
                UPDATE seasons
                SET season_name = %s, end_date = %s
                WHERE season_id = %s
            """, (season_name, end_date, season_id))

            # Reassign events that now fall within this season's updated date range
            cursor.execute("""
                UPDATE generalevents
                SET season_id = %s
                WHERE Date BETWEEN %s AND %s
            """, (season_id, start, end_date))

            reassigned_events = cursor.rowcount
            mysql.connection.commit()

            if reassigned_events > 0:
                print(f"✅ Reassigned {reassigned_events} events to season '{season_name}' after date update")

            return jsonify({
                'success': True,
                'message': f'Season "{season_name}" updated successfully. {reassigned_events} events reassigned.',
                'events_reassigned': reassigned_events
            })

        except Exception as e:
            mysql.connection.rollback()
            print(f"Error updating season: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to update season'
            }), 500
        finally:
            cursor.close()

    @app.route('/api/seasons/<int:season_id>/end', methods=['POST'])
    @login_required
    @roles_required('admin', 'developer')
    def end_season(season_id):
        """
        End the current season
        NOW INCLUDES:
        - Final snapshot of GM game assignments before ending
        - Removal of Player role from all users (they're no longer on teams)
        """
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Verify season exists and is active
            cursor.execute("""
                SELECT season_id, season_name
                FROM seasons
                WHERE season_id = %s AND is_active = 1
            """, (season_id,))

            season = cursor.fetchone()

            if not season:
                return jsonify({
                    'success': False,
                    'message': 'Active season not found'
                }), 404

            # IMPORTANT: Take a final snapshot of all GM game assignments
            # This preserves which games each GM managed at the end of the season
            cursor.execute("""
                SELECT userid, is_gm
                FROM season_roles
                WHERE season_id = %s AND is_gm = 1
            """, (season_id,))

            gms = cursor.fetchall()

            for gm in gms:
                user_id = gm['userid']

                # Get current game assignment from games table
                cursor.execute("""
                    SELECT GameID 
                    FROM games 
                    WHERE gm_id = %s 
                    LIMIT 1
                """, (user_id,))

                game_result = cursor.fetchone()

                if game_result:
                    gm_game_id = game_result['GameID']

                    # Update season_roles with the game assignment
                    cursor.execute("""
                        UPDATE season_roles
                        SET gm_game_id = %s
                        WHERE userid = %s AND season_id = %s
                    """, (gm_game_id, user_id, season_id))

            # Remove Player role from ALL users since season is ending
            # Teams are dissolved, so no one is a "player" anymore
            cursor.execute("""
                UPDATE permissions
                SET is_player = 0
            """)

            print(f"Removed Player role from all users as season {season['season_name']} ended")

            # Deactivate season
            cursor.execute("""
                UPDATE seasons
                SET is_active = 0
                WHERE season_id = %s
            """, (season_id,))

            mysql.connection.commit()

            return jsonify({
                'success': True,
                'message': f'Season "{season["season_name"]}" has been ended. All player roles have been removed.'
            })

        except Exception as e:
            mysql.connection.rollback()
            print(f"Error ending season: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to end season'
            }), 500
        finally:
            cursor.close()