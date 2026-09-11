"""
Lab Reservation Routes
Module for all lab-reservation-related functionality
"""
from EsportsManagementTool.events import get_primary_game_id
from EsportsManagementTool.universal_helpers import format_time_to_12hr
from flask import request, jsonify, session
from datetime import datetime
import MySQLdb.cursors
from EsportsManagementTool import EST

# Primary routes for lab reservation CRUD operations
def register_lab_reservation_routes(app, mysql, login_required, roles_required):
    """Register all lab-reservation-related routes"""

    @app.route('/api/lab-reservations/availability')
    @roles_required('admin', 'gm', 'developer')
    def get_lab_reservation_availability():
        """
        Check for existing lab reservations that overlap a proposed
        lab/date/time window. Drives the capacity bar + message in the
        create reservation modal.
        """
        lab_choice = request.args.get('lab_choice', '').strip()
        reservation_date = request.args.get('reservation_date', '').strip()
        start_time = request.args.get('start_time', '').strip()
        end_time = request.args.get('end_time', '').strip()

        if not (lab_choice and reservation_date and start_time and end_time):
            return jsonify({'error': 'lab_choice, reservation_date, start_time, and end_time are required'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            # Standard interval overlap check: two ranges overlap if
            # each one starts before the other ends. Joins users to
            # surface who booked the conflicting reservation.
            cursor.execute("""
                SELECT lr.reservation_id, lr.lab_status, lr.priority,
                       lr.start_time, lr.end_time, u.firstname AS first_name
                FROM lab_reservations lr
                JOIN users u ON lr.reserved_by = u.id
                WHERE lr.lab_choice = %s
                  AND lr.reservation_date = %s
                  AND lr.start_time < %s
                  AND lr.end_time > %s
            """, (lab_choice, reservation_date, end_time, start_time))

            overlaps = cursor.fetchall()

            for row in overlaps:
                row['start_time'] = format_time_to_12hr(row['start_time'])
                row['end_time'] = format_time_to_12hr(row['end_time'])

            return jsonify({'overlaps': overlaps}), 200

        except Exception as e:
            print(f"\n EXCEPTION in get_lab_reservation_availability: {str(e)}")
            return jsonify({'error': 'Failed to check lab availability'}), 500
        finally:
            cursor.close()

    @app.route('/api/lab-reservations', methods=['POST'])
    @roles_required('admin', 'gm', 'developer')
    def create_lab_reservation():
        """Create a new lab reservation"""
        reservation_date = request.form.get('labReservationDate', '').strip()
        start_time = request.form.get('labStartTime', '').strip()
        end_time = request.form.get('labEndTime', '').strip()
        lab_choice = request.form.get('labChoice', '').strip()
        priority = request.form.get('labPriority', '').strip()
        lab_status = request.form.get('labStatus', '').strip()
        reserved_game = request.form.get('reservedGame', '').strip()
        lab_description = request.form.get('labDescription', '').strip() or None

        if not (reservation_date and start_time and end_time and lab_choice and priority and lab_status and reserved_game):
            return jsonify({'success': False, 'message': 'Please fill out all required fields!'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            # Resolve the reserved game name to its game_id (reuses events.py's helper)
            game_id = get_primary_game_id(cursor, [reserved_game])
            if not game_id:
                return jsonify({'success': False, 'message': 'Selected game could not be found.'}), 400

            created_at = datetime.now(EST)

            cursor.execute(
                'INSERT INTO lab_reservations '
                '(reservation_date, start_time, end_time, priority, lab_status, reserved_by, game_id, lab_choice, lab_description, created_at) '
                'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                (reservation_date, start_time, end_time, priority, lab_status, session['id'], game_id,
                 lab_choice, lab_description, created_at))

            mysql.connection.commit()

            return jsonify({'success': True, 'message': 'Lab reservation created!'}), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"\n EXCEPTION in create_lab_reservation: {str(e)}")
            return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 400
        finally:
            cursor.close()