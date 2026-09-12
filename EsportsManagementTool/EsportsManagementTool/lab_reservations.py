"""
Lab Reservation Routes
Module for all lab-reservation-related functionality
"""
from EsportsManagementTool.events import get_primary_game_id
from EsportsManagementTool.universal_helpers import format_time_to_12hr
from flask import request, jsonify, session
from datetime import datetime, timedelta
import MySQLdb.cursors
from EsportsManagementTool import EST

# Priority hierarchy - higher rank overrides lower rank on overlapping reservations
PRIORITY_RANK = {
    'Casual': 1,
    'Practice': 2,
    'Scrim': 3,
    'Match': 4
}


def _parse_time_to_timedelta(time_str):
    """Parses an 'HH:MM' string into a timedelta, matching the type MySQL
    returns for TIME columns, so the two can be compared directly."""
    hours, minutes = map(int, time_str.split(':')[:2])
    return timedelta(hours=hours, minutes=minutes)


def _timedelta_to_time_str(td):
    """Formats a timedelta back into a zero-padded 'HH:MM:SS' string for SQL."""
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def _to_timedelta(value):
    """Normalizes a MySQL TIME value (timedelta) or an 'HH:MM' string into a timedelta."""
    if isinstance(value, timedelta):
        return value
    return _parse_time_to_timedelta(value)


def _format_time_range(start_val, end_val):
    """Formats a start/end pair (timedelta or 'HH:MM' string, mixed OK) as '9:00 AM - 12:00 PM'."""
    start_str = format_time_to_12hr(_to_timedelta(start_val))
    end_str = format_time_to_12hr(_to_timedelta(end_val))
    return f"{start_str} - {end_str}"


def _format_reservation_date(date_str):
    """Formats a 'YYYY-MM-DD' string as 'September 15, 2026' for display in notices."""
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').strftime('%B %d, %Y')
    except (ValueError, TypeError):
        return date_str


# Primary routes for lab reservation CRUD operations
def register_lab_reservation_routes(app, mysql, login_required, roles_required):
    """Register all lab-reservation-related routes"""

    @app.route('/api/lab-reservations/notices')
    @login_required
    def get_lab_reservation_notices():
        """Fetch this user's pending lab reservation impact notices."""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            cursor.execute(
                'SELECT notice_id, message FROM lab_reservation_notices WHERE user_id = %s ORDER BY created_at ASC',
                (session['id'],))
            notices = cursor.fetchall()
            return jsonify({'notices': notices}), 200
        except Exception as e:
            print(f"\n EXCEPTION in get_lab_reservation_notices: {str(e)}")
            return jsonify({'error': 'Failed to fetch notices'}), 500
        finally:
            cursor.close()


    @app.route('/api/lab-reservations/notices/<int:notice_id>', methods=['DELETE'])
    @login_required
    def dismiss_lab_reservation_notice(notice_id):
        """Permanently dismiss a lab reservation impact notice."""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            cursor.execute(
                'DELETE FROM lab_reservation_notices WHERE notice_id = %s AND user_id = %s',
                (notice_id, session['id']))
            mysql.connection.commit()
            return jsonify({'success': True}), 200
        except Exception as e:
            mysql.connection.rollback()
            print(f"\n EXCEPTION in dismiss_lab_reservation_notice: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to dismiss notice'}), 500
        finally:
            cursor.close()


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
                       lr.start_time, lr.end_time, u.firstname AS first_name, u.username
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

            # Find every existing reservation in this lab that overlaps the requested window
            cursor.execute("""
                SELECT lr.reservation_id, lr.lab_status, lr.priority, lr.start_time, lr.end_time,
                       lr.reserved_by, lr.game_id, lr.lab_choice, lr.lab_description,
                       u.firstname AS first_name, u.username
                FROM lab_reservations lr
                JOIN users u ON lr.reserved_by = u.id
                WHERE lr.lab_choice = %s
                  AND lr.reservation_date = %s
                  AND lr.start_time < %s
                  AND lr.end_time > %s
            """, (lab_choice, reservation_date, end_time, start_time))
            overlaps = cursor.fetchall()

            new_rank = PRIORITY_RANK.get(priority, 0)
            blocking = [o for o in overlaps if PRIORITY_RANK.get(o['priority'], 0) >= new_rank]

            # Any overlap with equal or higher priority blocks the reservation entirely
            if blocking:
                names = sorted(set(f"{o['first_name']} ({o['username']})" for o in blocking))
                names_str = ', '.join(names)
                verb = 'has' if len(names) == 1 else 'have'
                return jsonify({
                    'success': False,
                    'blocked': True,
                    'message': f"This reservation is blocked because {names_str} already {verb} a reservation with "
                               f"equal or higher priority during this time. Please contact them directly to "
                               f"coordinate lab access."
                }), 409

            created_at = datetime.now(EST)

            cursor.execute(
                'INSERT INTO lab_reservations '
                '(reservation_date, start_time, end_time, priority, lab_status, reserved_by, game_id, lab_choice, lab_description, created_at) '
                'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                (reservation_date, start_time, end_time, priority, lab_status, session['id'], game_id,
                 lab_choice, lab_description, created_at))

            # Look up the acting user's name/username for the impact notices below
            cursor.execute('SELECT firstname, username FROM users WHERE id = %s', (session['id'],))
            acting_user = cursor.fetchone() or {}
            acting_name = acting_user.get('firstname', 'Someone')
            acting_username = acting_user.get('username', '')

            # New reservation outranks every overlap - trim or remove each one so
            # the surviving time no longer overlaps the new reservation
            new_start = _parse_time_to_timedelta(start_time)
            new_end = _parse_time_to_timedelta(end_time)
            impacted_names = set()

            date_display = _format_reservation_date(reservation_date)

            for o in overlaps:
                o_start = o['start_time']
                o_end = o['end_time']
                leading = o_start < new_start  # existing reservation starts before the new one
                trailing = o_end > new_end  # existing reservation ends after the new one

                original_range = _format_time_range(o_start, o_end)
                notice_prefix = (
                    f"Your reservation for {o['lab_choice']} at {original_range} on {date_display}"
                )
                notice_suffix = (
                    f"by {acting_name}'s ({acting_username}) {priority} reservation. "
                    f"Please reach out to them for more details."
                )

                if leading and trailing:
                    # New reservation sits entirely inside the existing one - split it
                    # into its leading and trailing remainders (two separate rows)
                    cursor.execute(
                        'UPDATE lab_reservations SET end_time = %s WHERE reservation_id = %s',
                        (start_time, o['reservation_id']))
                    cursor.execute(
                        'INSERT INTO lab_reservations '
                        '(reservation_date, start_time, end_time, priority, lab_status, reserved_by, game_id, lab_choice, lab_description, created_at) '
                        'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                        (reservation_date, end_time, _timedelta_to_time_str(o_end), o['priority'], o['lab_status'],
                         o['reserved_by'], o['game_id'], o['lab_choice'], o['lab_description'], datetime.now(EST)))

                    segment_1 = _format_time_range(o_start, start_time)
                    segment_2 = _format_time_range(end_time, o_end)
                    notice_message = f"{notice_prefix} was split to {segment_1} and {segment_2} {notice_suffix}"

                elif leading:
                    # Keep only the portion before the new reservation starts
                    cursor.execute(
                        'UPDATE lab_reservations SET end_time = %s WHERE reservation_id = %s',
                        (start_time, o['reservation_id']))
                    new_range = _format_time_range(o_start, start_time)
                    notice_message = f"{notice_prefix} was adjusted to {new_range} {notice_suffix}"

                elif trailing:
                    # Keep only the portion after the new reservation ends
                    cursor.execute(
                        'UPDATE lab_reservations SET start_time = %s WHERE reservation_id = %s',
                        (end_time, o['reservation_id']))
                    new_range = _format_time_range(end_time, o_end)
                    notice_message = f"{notice_prefix} was adjusted to {new_range} {notice_suffix}"

                else:
                    # Fully contained within the new reservation - remove it entirely
                    cursor.execute(
                        'DELETE FROM lab_reservations WHERE reservation_id = %s',
                        (o['reservation_id'],))
                    notice_message = f"{notice_prefix} was removed {notice_suffix}"

                cursor.execute(
                    'INSERT INTO lab_reservation_notices (user_id, message) VALUES (%s, %s)',
                    (o['reserved_by'], notice_message))

                impacted_names.add(f"{o['first_name']} ({o['username']})")

            mysql.connection.commit()

            return jsonify({
                'success': True,
                'message': 'Lab reservation created!',
                'impacted_names': sorted(impacted_names)
            }), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"\n EXCEPTION in create_lab_reservation: {str(e)}")
            return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 400
        finally:
            cursor.close()