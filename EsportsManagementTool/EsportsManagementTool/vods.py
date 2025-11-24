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
@roles_required('admin', 'gm')
def add_team_vod(team_id):
    # Adding a VOD to a team
    data = request.get_json()
    youtube_video_id = data.get('youtube_video_id')

    if not youtube_video_id:
        return jsonify({'error': 'YouTube video ID required!'}), 400

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
@roles_required('admin', 'gm')
def delete_vod(vod_id):
    # Deleting a VOD
    cursor = mysql.connection.cursor()
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