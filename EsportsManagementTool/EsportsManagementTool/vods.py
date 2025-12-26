import os

from EsportsManagementTool import app, mysql, login_required, roles_required, get_user_permissions, has_role
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import MySQLdb.cursors
from EsportsManagementTool import get_current_time, localize_datetime, EST
from googleapiclient.discovery import build
from dotenv import load_dotenv
load_dotenv()


# METHOD DEVELOPED IN PART WITH CLAUDE - TWEAKS MADE BY JCAMP74/Jackson Campbell
@app.route('/api/vods/team/<string:team_id>')
@login_required
def get_team_vods(team_id):
    # Get all VODS for a specific team
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    cursor.execute('''
        SELECT vod.*, t.teamName
        FROM team_vods vod
        JOIN teams t ON vod.teamID = t.teamID
        WHERE vod.teamID = %s
        ORDER BY vod.published_at DESC''', (team_id,))
    vods = cursor.fetchall()
    cursor.close()

    for vod in vods:
        if vod.get('published_at'):
            vod['published_at'] = localize_datetime(vod['published_at']).isoformat()

    return jsonify(vods)


@app.route('/api/vods/team/<string:team_id>/add', methods=['POST'])
@login_required
def add_team_vod(team_id):
    # Checking permissions to upload beforehand
    user_id = session.get('id')
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    # Check if the user is admin or the GM for the specific game
    cursor.execute('''
        SELECT p.is_admin, p.is_developer, g.gm_id
        FROM permissions p
        LEFT JOIN teams t on t.teamID = %s
        LEFT JOIN games g on t.gameID = g.gameID
        WHERE p.userid = %s
        ''', (team_id, user_id))

    user_data = cursor.fetchone()

    if not user_data:
        cursor.close()
        return jsonify({'error': 'Unauthorized'}), 403

    is_admin = user_data['is_admin']
    is_developer = user_data['is_developer']
    is_team_gm = (user_data['gm_id'] == user_id)

    if not (is_admin or is_developer or is_team_gm):
        cursor.close()
        return jsonify({'error': 'Only admins or the Game Manager can add VODs!'}), 403

    # Check if team's season is active
    cursor.execute("""
        SELECT s.is_active
        FROM teams t
        LEFT JOIN seasons s ON t.season_id = s.season_id
        WHERE t.TeamID = %s
    """, (team_id,))

    season_result = cursor.fetchone()
    season_is_active = season_result['is_active'] == 1 if season_result and season_result[
        'is_active'] is not None else True

    if not season_is_active and not is_developer:
        cursor.close()
        return jsonify({'error': 'Cannot add VODs to teams from past seasons'}), 403

    # Adding a VOD to a team
    data = request.get_json()
    youtube_video_id = data.get('youtube_video_id')

    if not youtube_video_id:
        return jsonify({'error': 'YouTube video ID required!'}), 400


    cursor.execute('''
                   SELECT id
                   FROM team_vods
                   WHERE teamID = %s
                     AND youtube_video_id = %s
                   ''', (team_id, youtube_video_id))

    existing_vod = cursor.fetchone()
    if existing_vod:
        cursor.close()
        return jsonify({'error': 'This video is already added for this team!'}), 409

    # Fetching video details from YouTube API
    youtube = get_youtube_service()
    try:
        video_request = youtube.videos().list(
            part='snippet,contentDetails',
            id=youtube_video_id
        )
        response = video_request.execute()

        if not response.get('items'):
            return jsonify({'error': 'Video not found!'}), 404

        video = response['items'][0]
        snippet = video['snippet']

        print(data.get('match_date'), 'ERROR CHECKING, DATE NEEDS TO BE NORMAL')
        cursor = mysql.connection.cursor()
        cursor.execute('''
        INSERT INTO team_vods
        (teamID, youtube_video_id, title, thumbnail_url, published_at, match_date, opponent)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ''', (
            team_id,
            youtube_video_id,
            snippet['title'],
            snippet['thumbnails']['high']['url'],
            snippet['publishedAt'],
            data.get('match_date'),
            data.get('opponent')
        ))
        mysql.connection.commit()
        vod_id = cursor.lastrowid
        cursor.close()

        return jsonify({'success': True, 'vod_id': vod_id}), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/vods/<int:vod_id>', methods=['DELETE'])
@login_required
@roles_required('admin', 'gm', 'developer')
def delete_vod(vod_id):
    user_id = session.get('id')
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    cursor.execute('''
        SELECT p.is_admin, p.is_developer, g.gm_id
        FROM team_vods v
        JOIN teams t on v.teamID = t.teamID
        JOIN games g on t.gameID = g.gameID
        LEFT JOIN permissions p on p.userid = %s
        WHERE v.id = %s
        ''', (user_id, vod_id))

    result = cursor.fetchone()

    if not result:
        cursor.close()
        return jsonify({'error': 'VOD not found'}), 404

    is_admin = result['is_admin']
    is_developer = result['is_developer']
    is_game_gm = (result['gm_id'] == user_id)

    if not (is_admin or is_developer or is_game_gm):
        cursor.close()
        return jsonify({'error': 'Only admins or the game manager can delete VODs!'}), 403

    # Check if team's season is active
    cursor.execute("""
        SELECT s.is_active
        FROM team_vods v
        JOIN teams t ON v.teamID = t.TeamID
        LEFT JOIN seasons s ON t.season_id = s.season_id
        WHERE v.id = %s
    """, (vod_id,))

    season_result = cursor.fetchone()
    season_is_active = season_result['is_active'] == 1 if season_result and season_result[
        'is_active'] is not None else True

    if not season_is_active and not is_developer:
        cursor.close()
        return jsonify({'error': 'Cannot delete VODs from teams in past seasons'}), 403

    # Deleting a VOD
    cursor.execute('DELETE FROM team_vods WHERE id = %s', (vod_id,))
    mysql.connection.commit()
    cursor.close()
    return jsonify({'success': True})



# -*- coding: utf-8 -*-

# Sample Python code for youtube.channels.list
# See instructions for running these code samples locally:
# https://developers.google.com/explorer-help/code-samples#python




def get_youtube_service():
    return build('youtube', 'v3', developerKey=app.config['YOUTUBE_API_KEY'])

@app.route('/api/video/<video_id>')
def get_video_info(video_id):
    youtube = get_youtube_service()
    request = youtube.videos().list(
        part='snippet,contentDetails,statistics',
        id=video_id
    )
    response = request.execute()
    return jsonify(response)

@app.route('/api/search/<query>')
def search_videos(query):
    youtube = get_youtube_service()
    request = youtube.search().list(
        q=query,
        part='snippet',
        type='video',
        maxResults=10
    )
    response = request.execute()
    return jsonify(response)


#----------------------------------------
# VOD COMMENTS SECTION - ADDENDED TO VODS
#----------------------------------------

@app.route('/api/vods/<int:vod_id>/comments')
@login_required
def get_vod_comments(vod_id):
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    cursor.execute('''
        SELECT c.*, u.username, u.firstname, u.lastname, u.profile_picture
        FROM vod_comments c
        JOIN users u on c.user_id = u.id
        WHERE c.vod_id = %s
        ORDER BY c.created_at ASC
        ''', (vod_id,))

    comments = cursor.fetchall()
    cursor.close()

    for comment in comments:
        if comment.get('created_at'):
            comment['created_at'] = localize_datetime(comment['created_at']).isoformat()

    return jsonify({'success': True, 'comments': comments})

@app.route('/api/vods/<int:vod_id>/comments', methods=['POST'])
@login_required
def add_vod_comment(vod_id):
    user_id = session.get('id')
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    # Check if the user is the GM for specified game
    cursor.execute('''
        SELECT p.is_admin, p.is_developer, g.gm_id
        FROM team_vods v
        JOIN teams t on v.teamID = t.teamID
        JOIN games g ON t.gameID = g.GameID
        LEFT JOIN permissions p on p.userid = %s
        WHERE v.id = %s
        ''', (user_id, vod_id))

    result = cursor.fetchone()

    if not result:
        cursor.close()
        return jsonify({'error': 'VOD not found!'}), 404

    is_admin = result['is_admin']
    is_developer = result['is_developer']
    is_game_gm = (result['gm_id'] == user_id)

    if not (is_admin or is_developer or is_game_gm):
        cursor.close()
        return jsonify({'error': 'Only admins or the game manager can leave comments!'}), 403

    # Check if team's season is active
    cursor.execute("""
        SELECT s.is_active
        FROM team_vods v
        JOIN teams t ON v.teamID = t.TeamID
        LEFT JOIN seasons s ON t.season_id = s.season_id
        WHERE v.id = %s
    """, (vod_id,))

    season_result = cursor.fetchone()
    season_is_active = season_result['is_active'] == 1 if season_result and season_result[
        'is_active'] is not None else True

    if not season_is_active and not is_developer:
        cursor.close()
        return jsonify({'error': 'Cannot add comments to VODs from teams in past seasons'}), 403

    # Get comment data
    data = request.get_json()
    comment_text = data.get('comment_text', '').strip()
    timestamp_seconds = data.get('timestamp_seconds')

    if not comment_text:
        cursor.close()
        return jsonify({'error': 'Comment text required!'}), 400

    # Inserting comment
    cursor.execute('''
        INSERT INTO vod_comments
        (vod_id, user_id, comment_text, timestamp_seconds, created_at)
        VALUES (%s, %s, %s, %s, %s)
        ''', (vod_id, user_id, comment_text, timestamp_seconds, get_current_time()))

    mysql.connection.commit()
    comment_id = cursor.lastrowid
    cursor.close()

    return jsonify({'success': True, 'comment_id': comment_id}), 201


@app.route('/api/vods/comments/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_vod_comment(comment_id):
    user_id = session.get('id')
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    # Check permissions
    cursor.execute('''
        SELECT c.user_id, p.is_admin, p.is_developer, g.gm_id
        FROM vod_comments c
        JOIN team_vods v ON c.vod_id = v.id
        JOIN teams t ON v.teamID = t.TeamID
        JOIN games g ON t.gameID = g.GameID
        LEFT JOIN permissions p on p.userid = %s
        WHERE c.id = %s
        ''', (user_id, comment_id))

    result = cursor.fetchone()

    if not result:
        cursor.close()
        return jsonify({'error': 'Comment not found!'}), 404

    is_admin = result['is_admin']
    is_developer = result['is_developer']
    is_game_gm = (result['gm_id'] == user_id)
    is_own_comment = (result['user_id'] == user_id)

    if not (is_admin or is_developer or is_game_gm or is_own_comment):
        cursor.close()
        return jsonify({'error': 'Permission denied!'}), 403

    cursor.execute('DELETE FROM vod_comments WHERE id = %s', (comment_id,))
    mysql.connection.commit()
    cursor.close()

    return jsonify({'success': True})









