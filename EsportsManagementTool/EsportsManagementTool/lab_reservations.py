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


def _is_future_reservation(reservation_date, start_time_val):
    """Returns True if a reservation's date+start_time is strictly after right now.
    reservation_date is a DB date object, start_time_val is a DB timedelta."""
    reservation_start = datetime.combine(reservation_date, datetime.min.time()) + start_time_val
    now_naive = datetime.now(EST).replace(tzinfo=None)
    return reservation_start > now_naive


def _check_and_resolve_conflicts(cursor, lab_choice, reservation_date, start_time, end_time, priority,
                                  acting_name, acting_username, exclude_reservation_id=None):
    """
    Shared conflict-resolution pipeline used by both create and edit.
    Finds overlapping reservations in the same lab/date, blocks if any has equal-or-higher
    priority, otherwise trims/splits/deletes each overlap and queues an impact notice for
    its owner. Mutates the DB but does not commit - the caller commits once its own
    insert/update also succeeds.

    Returns {'blocked': True, 'message': ...} or {'blocked': False, 'impacted_names': [...]}.
    """
    query = """
        SELECT lr.reservation_id, lr.lab_status, lr.priority, lr.start_time, lr.end_time,
               lr.reserved_by, lr.game_id, lr.lab_choice, lr.lab_description,
               u.firstname AS first_name, u.username
        FROM lab_reservations lr
        JOIN users u ON lr.reserved_by = u.id
        WHERE lr.lab_choice = %s
          AND lr.reservation_date = %s
          AND lr.start_time < %s
          AND lr.end_time > %s
    """
    params = [lab_choice, reservation_date, end_time, start_time]

    if exclude_reservation_id is not None:
        query += " AND lr.reservation_id != %s"
        params.append(exclude_reservation_id)

    cursor.execute(query, tuple(params))
    overlaps = cursor.fetchall()

    new_rank = PRIORITY_RANK.get(priority, 0)
    blocking = [o for o in overlaps if PRIORITY_RANK.get(o['priority'], 0) >= new_rank]

    if blocking:
        names = sorted(set(f"{o['first_name']} ({o['username']})" for o in blocking))
        names_str = ', '.join(names)
        verb = 'has' if len(names) == 1 else 'have'
        return {
            'blocked': True,
            'message': f"This reservation is blocked because {names_str} already {verb} a reservation with "
                        f"equal or higher priority during this time. Please contact them directly to "
                        f"coordinate lab access."
        }

    new_start = _parse_time_to_timedelta(start_time)
    new_end = _parse_time_to_timedelta(end_time)
    impacted_names = set()
    date_display = _format_reservation_date(reservation_date)

    for o in overlaps:
        o_start = o['start_time']
        o_end = o['end_time']
        leading = o_start < new_start
        trailing = o_end > new_end

        original_range = _format_time_range(o_start, o_end)
        notice_prefix = f"Your reservation for {o['lab_choice']} at {original_range} on {date_display}"
        notice_suffix = (
            f"by {acting_name}'s ({acting_username}) {priority} reservation. "
            f"Please reach out to them for more details."
        )

        if leading and trailing:
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
            cursor.execute(
                'UPDATE lab_reservations SET end_time = %s WHERE reservation_id = %s',
                (start_time, o['reservation_id']))
            new_range = _format_time_range(o_start, start_time)
            notice_message = f"{notice_prefix} was adjusted to {new_range} {notice_suffix}"

        elif trailing:
            cursor.execute(
                'UPDATE lab_reservations SET start_time = %s WHERE reservation_id = %s',
                (end_time, o['reservation_id']))
            new_range = _format_time_range(end_time, o_end)
            notice_message = f"{notice_prefix} was adjusted to {new_range} {notice_suffix}"

        else:
            cursor.execute(
                'DELETE FROM lab_reservations WHERE reservation_id = %s',
                (o['reservation_id'],))
            notice_message = f"{notice_prefix} was removed {notice_suffix}"

        cursor.execute(
            'INSERT INTO lab_reservation_notices (user_id, message) VALUES (%s, %s)',
            (o['reserved_by'], notice_message))

        impacted_names.add(f"{o['first_name']} ({o['username']})")

    return {'blocked': False, 'impacted_names': sorted(impacted_names)}


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
        create/edit reservation modal.
        """
        lab_choice = request.args.get('lab_choice', '').strip()
        reservation_date = request.args.get('reservation_date', '').strip()
        start_time = request.args.get('start_time', '').strip()
        end_time = request.args.get('end_time', '').strip()
        exclude_id = request.args.get('exclude_id', type=int)

        if not (lab_choice and reservation_date and start_time and end_time):
            return jsonify({'error': 'lab_choice, reservation_date, start_time, and end_time are required'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            # Standard interval overlap check: two ranges overlap if
            # each one starts before the other ends. When editing, the
            # reservation being edited is excluded so it doesn't count
            # against its own capacity.
            query = """
                SELECT reservation_id, lab_status, priority, start_time, end_time, u.firstname AS first_name, u.username
                FROM lab_reservations lr
                JOIN users u ON lr.reserved_by = u.id
                WHERE lr.lab_choice = %s
                  AND lr.reservation_date = %s
                  AND lr.start_time < %s
                  AND lr.end_time > %s
            """
            params = [lab_choice, reservation_date, end_time, start_time]

            if exclude_id is not None:
                query += " AND lr.reservation_id != %s"
                params.append(exclude_id)

            cursor.execute(query, tuple(params))

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
            # Resolve the reserved game name to its game_id (reuses events.py's helper).
            # N/A means no specific game (or one not in the list) - store no game_id at all.
            if reserved_game == 'N/A':
                game_id = None
            else:
                game_id = get_primary_game_id(cursor, [reserved_game])
                if not game_id:
                    return jsonify({'success': False, 'message': 'Selected game could not be found.'}), 400

            cursor.execute('SELECT firstname, username FROM users WHERE id = %s', (session['id'],))
            acting_user = cursor.fetchone() or {}
            acting_name = acting_user.get('firstname', 'Someone')
            acting_username = acting_user.get('username', '')

            result = _check_and_resolve_conflicts(cursor, lab_choice, reservation_date, start_time, end_time,
                                                  priority, acting_name, acting_username)
            if result['blocked']:
                return jsonify({'success': False, 'blocked': True, 'message': result['message']}), 409

            created_at = datetime.now(EST)

            cursor.execute(
                'INSERT INTO lab_reservations '
                '(reservation_date, start_time, end_time, priority, lab_status, reserved_by, game_id, lab_choice, lab_description, created_at) '
                'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                (reservation_date, start_time, end_time, priority, lab_status, session['id'], game_id,
                 lab_choice, lab_description, created_at))

            mysql.connection.commit()

            return jsonify({
                'success': True,
                'message': 'Lab reservation created!',
                'impacted_names': result['impacted_names']
            }), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"\n EXCEPTION in create_lab_reservation: {str(e)}")
            return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 400
        finally:
            cursor.close()

    @app.route('/api/lab-reservations/mine')
    @roles_required('admin', 'gm', 'developer')
    def get_my_lab_reservations():
        """Fetch the current user's own upcoming lab reservations for the 'My Reservations' list."""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            cursor.execute("""
                SELECT lr.reservation_id, lr.reservation_date, lr.start_time, lr.end_time, lr.priority,
                       lr.lab_status, lr.lab_choice, lr.lab_description, lr.game_id, g.GameTitle AS game_name
                FROM lab_reservations lr
                LEFT JOIN games g ON lr.game_id = g.gameID
                WHERE lr.reserved_by = %s
                ORDER BY lr.reservation_date, lr.start_time
            """, (session['id'],))
            rows = cursor.fetchall()

            reservations = []
            for row in rows:
                if not _is_future_reservation(row['reservation_date'], row['start_time']):
                    continue

                date_str = row['reservation_date'].strftime('%Y-%m-%d')
                reservations.append({
                    'id': row['reservation_id'],
                    'lab_choice': row['lab_choice'],
                    'priority': row['priority'],
                    'lab_status': row['lab_status'],
                    'game_name': row['game_name'] or 'N/A',
                    'description': row['lab_description'] or '',
                    'date': date_str,
                    'date_display': _format_reservation_date(date_str),
                    'start_time_raw': _timedelta_to_time_str(row['start_time'])[:5],
                    'end_time_raw': _timedelta_to_time_str(row['end_time'])[:5],
                    'time_display': _format_time_range(row['start_time'], row['end_time'])
                })

            return jsonify({'reservations': reservations}), 200

        except Exception as e:
            print(f"\n EXCEPTION in get_my_lab_reservations: {str(e)}")
            return jsonify({'error': 'Failed to fetch reservations'}), 500
        finally:
            cursor.close()

    @app.route('/api/lab-reservations/<int:reservation_id>', methods=['PUT'])
    @roles_required('admin', 'gm', 'developer')
    def update_lab_reservation(reservation_id):
        """Edit an existing lab reservation - re-runs the full conflict/priority pipeline."""
        reservation_date = request.form.get('labReservationDate', '').strip()
        start_time = request.form.get('labStartTime', '').strip()
        end_time = request.form.get('labEndTime', '').strip()
        lab_choice = request.form.get('labChoice', '').strip()
        priority = request.form.get('labPriority', '').strip()
        lab_status = request.form.get('labStatus', '').strip()
        reserved_game = request.form.get('reservedGame', '').strip()
        lab_description = request.form.get('labDescription', '').strip() or None

        if not (
                reservation_date and start_time and end_time and lab_choice and priority and lab_status and reserved_game):
            return jsonify({'success': False, 'message': 'Please fill out all required fields!'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            cursor.execute(
                'SELECT reserved_by, reservation_date, start_time FROM lab_reservations WHERE reservation_id = %s',
                (reservation_id,))
            existing = cursor.fetchone()
            if not existing:
                return jsonify({'success': False, 'message': 'Reservation not found.'}), 404
            if existing['reserved_by'] != session['id']:
                return jsonify({'success': False, 'message': 'You can only edit your own reservations.'}), 403
            if not _is_future_reservation(existing['reservation_date'], existing['start_time']):
                return jsonify(
                    {'success': False, 'message': 'Past or in-progress reservations cannot be edited.'}), 400

            if reserved_game == 'N/A':
                game_id = None
            else:
                game_id = get_primary_game_id(cursor, [reserved_game])
                if not game_id:
                    return jsonify({'success': False, 'message': 'Selected game could not be found.'}), 400

            cursor.execute('SELECT firstname, username FROM users WHERE id = %s', (session['id'],))
            acting_user = cursor.fetchone() or {}
            acting_name = acting_user.get('firstname', 'Someone')
            acting_username = acting_user.get('username', '')

            result = _check_and_resolve_conflicts(cursor, lab_choice, reservation_date, start_time, end_time,
                                                  priority, acting_name, acting_username,
                                                  exclude_reservation_id=reservation_id)
            if result['blocked']:
                return jsonify({'success': False, 'blocked': True, 'message': result['message']}), 409

            cursor.execute(
                'UPDATE lab_reservations SET reservation_date = %s, start_time = %s, end_time = %s, priority = %s, '
                'lab_status = %s, game_id = %s, lab_choice = %s, lab_description = %s '
                'WHERE reservation_id = %s',
                (reservation_date, start_time, end_time, priority, lab_status, game_id, lab_choice,
                 lab_description, reservation_id))

            mysql.connection.commit()

            return jsonify({
                'success': True,
                'message': 'Lab reservation updated!',
                'impacted_names': result['impacted_names']
            }), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"\n EXCEPTION in update_lab_reservation: {str(e)}")
            return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 400
        finally:
            cursor.close()

    @app.route('/api/lab-reservations/<int:reservation_id>', methods=['DELETE'])
    @roles_required('admin', 'gm', 'developer')
    def delete_lab_reservation(reservation_id):
        """Delete one of the current user's own upcoming lab reservations."""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            cursor.execute(
                'SELECT reserved_by, reservation_date, start_time FROM lab_reservations WHERE reservation_id = %s',
                (reservation_id,))
            existing = cursor.fetchone()
            if not existing:
                return jsonify({'success': False, 'message': 'Reservation not found.'}), 404
            if existing['reserved_by'] != session['id']:
                return jsonify({'success': False, 'message': 'You can only delete your own reservations.'}), 403
            if not _is_future_reservation(existing['reservation_date'], existing['start_time']):
                return jsonify(
                    {'success': False, 'message': 'Past or in-progress reservations cannot be deleted.'}), 400

            cursor.execute('DELETE FROM lab_reservations WHERE reservation_id = %s', (reservation_id,))
            mysql.connection.commit()

            return jsonify({'success': True, 'message': 'Lab reservation deleted.'}), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"\n EXCEPTION in delete_lab_reservation: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to delete reservation.'}), 500
        finally:
            cursor.close()