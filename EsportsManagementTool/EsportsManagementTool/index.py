from EsportsManagementTool import mysql, app, roles_required
from EsportsManagementTool.universal_helpers import format_time_raw
from flask import jsonify, request, Response
import MySQLdb.cursors
from dotenv import load_dotenv
load_dotenv()
import os
import time
import requests as http_req


# ============================================
# LANDING PAGE STATISTICS
# ============================================
def index_statistics() ->  tuple[list[str], str | None]:
    """Returns a list of statistics and the season name for use on the landing page."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        season_id = get_season_id(cursor)
        return get_season_stats(cursor, season_id), get_season_name(cursor, season_id)
    finally:
        cursor.close()


def reformat_stat(stat: int) -> str:
    """Reformats a statistic before it is displayed on the landing page."""
    brackets = {
        150: '150+',
        120: '120+',
        100: '100+',
        90: '90+',
        80: '80+',
        70: '70+',
        60: '60+',
        50: '50+',
        40: '40+',
        30: '30+',
        25: '25+',
        20: '20+',
        15: '15+',
        10: '10+',
    }

    for threshold, label in brackets.items():
        if stat >= threshold:
            return label

    return str(stat)


def get_season_id(cursor) -> int | None:
    """Returns the season_id that statistics should be displayed for."""

    # Check for active season
    cursor.execute("""
        SELECT season_id
        FROM seasons
        WHERE is_active = 1;
    """)
    row = cursor.fetchone()
    if row:
        return row['season_id']

    # Check for most recent season that has ended
    cursor.execute("""
        SELECT season_id
        FROM seasons
        WHERE end_date < CURDATE()
        ORDER BY end_date DESC
        LIMIT 1;
    """)
    row = cursor.fetchone()
    if row:
        return row['season_id']
    return None

def get_season_name(cursor, season_id) -> str | None:
    """Returns the season name for a given season_id."""
    cursor.execute("""
        SELECT season_name
        FROM seasons
        WHERE season_id = %s;
    """, (season_id,))
    row = cursor.fetchone()
    if row:
        return row['season_name']
    return None

def get_season_stats(cursor, season_id: int) -> list[str]:
    """Returns the season stats for a given season_id."""

    # Total player count for given season
    cursor.execute("""
                   SELECT COUNT(*)
                   FROM users u
                            JOIN season_roles sr ON u.id = sr.userid
                            JOIN seasons s ON sr.season_id = s.season_id
                   WHERE s.season_id = %s
                     AND sr.is_player = 1;
                   """, (season_id,))
    player_count = cursor.fetchone()['COUNT(*)']

    # Total team count for given season
    cursor.execute("""
                   SELECT COUNT(*)
                   FROM teams t
                            JOIN seasons s ON t.season_id = s.season_id
                   WHERE s.season_id = %s;
                   """, (season_id,))
    team_count = cursor.fetchone()['COUNT(*)']

    # Total all-member events hosted
    cursor.execute("""
                   SELECT COUNT(*)
                   FROM generalevents ge
                            JOIN seasons s ON ge.season_id = s.season_id
                   WHERE visibility = 'all_members'
                   AND ge.season_id = %s;
                   """, (season_id,))
    event_count = cursor.fetchone()['COUNT(*)']

    # Total communities
    cursor.execute("""
                   SELECT COUNT(*)
                   FROM games;
                   """)
    community_count = cursor.fetchone()['COUNT(*)']

    return [
        reformat_stat(player_count),
        reformat_stat(team_count),
        reformat_stat(event_count),
        reformat_stat(community_count),
    ]


# ============================================
# STREAM SCHEDULE
# ============================================
@app.route('/api/streams/upcoming', methods=['GET'])
def get_upcoming_streams() -> Response:
    """Gets upcoming streams for the landing calendar sidebar."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("""
            SELECT stream_id, stream_name, stream_date, stream_time, platform
            FROM stream_schedule
            WHERE stream_date >= CURDATE() AND hidden = 0
            ORDER BY stream_date ASC, stream_time ASC
        """)
        rows = cursor.fetchall()
        streams = [{
            'stream_id':   r['stream_id'],
            'stream_name': r['stream_name'],
            'stream_date': r['stream_date'].strftime('%Y-%m-%d'),
            'stream_time': format_time_raw(r['stream_time']),
            'platform':    r['platform']
        } for r in rows]
        return jsonify({'success': True, 'streams': streams})
    except Exception as e:
        print(f"Error fetching streams: {e}")
        return jsonify({'success': False, 'streams': []})
    finally:
        cursor.close()

@app.route('/api/streams/past', methods=['GET'])
@roles_required('admin', 'developer')
def get_past_streams():
    """Fetch past streams for the admin modal."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("""
            SELECT stream_id, stream_name, stream_date, stream_time, platform
            FROM stream_schedule
            WHERE stream_date < CURDATE() AND hidden = 0
            ORDER BY stream_date DESC, stream_time DESC
        """)
        rows = cursor.fetchall()
        streams = [{
            'stream_id':   r['stream_id'],
            'stream_name': r['stream_name'],
            'stream_date': r['stream_date'].strftime('%Y-%m-%d'),
            'stream_time': format_time_raw(r['stream_time']),
            'platform':    r['platform']
        } for r in rows]
        return jsonify({'success': True, 'streams': streams})
    except Exception as e:
        print(f"Error fetching past streams: {e}")
        return jsonify({'success': False, 'streams': []})
    finally:
        cursor.close()


@app.route('/api/streams', methods=['POST'])
@roles_required('admin', 'developer')
def create_stream():
    """Schedules a new stream."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        data = request.get_json()
        name: str = (data.get('stream_name') or '').strip()
        date: str = (data.get('stream_date') or '').strip()
        time: str = (data.get('stream_time') or '').strip()
        platform: str = (data.get('platform') or '').strip()

        if not all([name, date, time, platform]):
            return jsonify({'success': False, 'message': 'All fields are required'}), 400
        if platform not in ('twitch', 'youtube'):
            return jsonify({'success': False, 'message': 'Invalid platform'}), 400

        cursor.execute(
            "INSERT INTO stream_schedule (stream_name, stream_date, stream_time, platform) VALUES (%s, %s, %s, %s)",
            (name, date, time, platform)
        )
        mysql.connection.commit()
        return jsonify({'success': True, 'message': 'Stream scheduled'})
    except Exception as e:
        mysql.connection.rollback()
        print(f"Error creating stream: {e}")
        return jsonify({'success': False, 'message': 'Failed to schedule stream'}), 500
    finally:
        cursor.close()


@app.route('/api/streams/<int:stream_id>', methods=['DELETE'])
@roles_required('admin', 'developer')
def delete_stream(stream_id):
    """Soft-delete a scheduled stream."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute(
            "UPDATE stream_schedule SET hidden = 1 WHERE stream_id = %s",
            (stream_id,)
        )
        mysql.connection.commit()
        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': 'Stream not found'}), 404
        return jsonify({'success': True, 'message': 'Stream removed'})
    except Exception as e:
        mysql.connection.rollback()
        print(f"Error hiding stream: {e}")
        return jsonify({'success': False, 'message': 'Failed to remove stream'}), 500
    finally:
        cursor.close()


@app.route('/api/streams/<int:stream_id>', methods=['PUT'])
@roles_required('admin', 'developer')
def update_stream(stream_id):
    """Update a scheduled stream's details."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        data = request.get_json()
        name: str = (data.get('stream_name') or '').strip()
        date: str = (data.get('stream_date') or '').strip()
        time: str = (data.get('stream_time') or '').strip()
        platform = (data.get('platform')    or '').strip()

        if not all([name, date, time, platform]):
            return jsonify({'success': False, 'message': 'All fields are required'}), 400
        if platform not in ('twitch', 'youtube'):
            return jsonify({'success': False, 'message': 'Invalid platform'}), 400

        cursor.execute("""
            UPDATE stream_schedule
            SET stream_name = %s, stream_date = %s, stream_time = %s, platform = %s
            WHERE stream_id = %s AND hidden = 0
        """, (name, date, time, platform, stream_id))
        mysql.connection.commit()
        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': 'Stream not found'}), 404
        return jsonify({'success': True, 'message': 'Stream updated'})
    except Exception as e:
        mysql.connection.rollback()
        print(f"Error updating stream: {e}")
        return jsonify({'success': False, 'message': 'Failed to update stream'}), 500
    finally:
        cursor.close()

# ============================================
# STREAM EMBED
# ============================================

_TWITCH_CHANNEL       = 'stocktonesports'
_TWITCH_CLIENT_ID     = os.environ.get('TWITCH_CLIENT_ID')
_TWITCH_CLIENT_SECRET = os.environ.get('TWITCH_CLIENT_SECRET')

_token_cache   = {'value': None, 'expires_at': 0}
_status_cache  = {'data':  None, 'expires_at': 0}
_user_id_cache = {'value': None}


def _get_twitch_token():
    """Return a valid app-access token, refreshing only when expired."""
    now = time.time()
    if _token_cache['value'] and now < _token_cache['expires_at']:
        return _token_cache['value']

    resp = http_req.post('https://id.twitch.tv/oauth2/token', params={
        'client_id':     _TWITCH_CLIENT_ID,
        'client_secret': _TWITCH_CLIENT_SECRET,
        'grant_type':    'client_credentials',
    })
    resp.raise_for_status()
    body = resp.json()

    _token_cache['value']      = body['access_token']
    _token_cache['expires_at'] = now + body['expires_in'] - 60
    return _token_cache['value']


def _get_twitch_user_id(headers):
    """Return the numeric Twitch user ID for the channel, cached after first fetch."""
    if _user_id_cache['value']:
        return _user_id_cache['value']

    resp = http_req.get(
        'https://api.twitch.tv/helix/users',
        params={'login': _TWITCH_CHANNEL},
        headers=headers
    ).json()

    if resp.get('data'):
        _user_id_cache['value'] = resp['data'][0]['id']

    return _user_id_cache['value']


@app.route('/api/twitch-status')
def twitch_status():
    """
    Returns whether the channel is live and which embed to show.
    """
    now = time.time()
    if _status_cache['data'] and now < _status_cache['expires_at']:
        return jsonify(_status_cache['data'])

    try:
        token = _get_twitch_token()
        headers = {
            'Client-ID':     _TWITCH_CLIENT_ID,
            'Authorization': f'Bearer {token}',
        }

        # Check if live
        stream = http_req.get(
            'https://api.twitch.tv/helix/streams',
            params={'user_login': _TWITCH_CHANNEL},
            headers=headers
        ).json()

        if stream.get('data'):
            result = {
                'is_live':    True,
                'embed_type': 'channel',
                'embed_id':   _TWITCH_CHANNEL,
            }
        else:
            # Try most recent highlight
            user_id = _get_twitch_user_id(headers)
            highlights = http_req.get(
                'https://api.twitch.tv/helix/videos',
                params={'user_id': user_id, 'type': 'highlight', 'first': 1},
                headers=headers
            ).json() if user_id else {'data': []}

            if highlights.get('data'):
                result = {
                    'is_live':    False,
                    'embed_type': 'video',
                    'embed_id':   highlights['data'][0]['id'],
                }
            else:
                # Fall back to channel offline page
                result = {
                    'is_live':    False,
                    'embed_type': 'channel',
                    'embed_id':   _TWITCH_CHANNEL,
                }

        _status_cache['data']       = result
        _status_cache['expires_at'] = now + 120
        return jsonify(result)

    except Exception as e:
        print(f'Twitch API error: {e}')
        return jsonify({'is_live': False, 'embed_type': None, 'embed_id': None})