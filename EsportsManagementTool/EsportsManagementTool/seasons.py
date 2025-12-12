"""
Seasons Management Module
Handles CRUD operations for seasons in the Esports Management Tool
"""

from flask import jsonify, request, session
import MySQLdb.cursors
from datetime import datetime


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
        """Create a new season"""
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

            return jsonify({
                'success': True,
                'message': f'Season "{season_name}" created successfully',
                'season_id': new_season_id
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
        """Update an existing season"""
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

            mysql.connection.commit()

            return jsonify({
                'success': True,
                'message': f'Season "{season_name}" updated successfully'
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
        """End the current season"""
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

            # Deactivate season
            cursor.execute("""
                UPDATE seasons
                SET is_active = 0
                WHERE season_id = %s
            """, (season_id,))

            mysql.connection.commit()

            return jsonify({
                'success': True,
                'message': f'Season "{season["season_name"]}" has been ended'
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