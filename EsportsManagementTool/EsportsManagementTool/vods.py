import os

from EsportsManagementTool import app, mysql, login_required, roles_required, get_user_permissions, has_role
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import MySQLdb.cursors
from EsportsManagementTool import get_current_time, localize_datetime, EST
from googleapiclient.discovery import build
from dotenv import load_dotenv
load_dotenv()



@app.route('/api/vods')
def vods():
    return "Hello!"



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