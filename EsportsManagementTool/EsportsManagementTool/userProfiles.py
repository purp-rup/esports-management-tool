from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from EsportsManagementTool import app
from EsportsManagementTool import mysql
import MySQLdb.cursors
from EsportsManagementTool.EsportsManagementTool import login_required


@app.route('/api/users/<int:user_id>/profile')
@login_required
def get_user_profile(user_id):
    """Grab the user's profile data for the profile card"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute('''
            SELECT u.id, u.firstname, u.lastname, u.username, u.profile_picture,
                   p.is_admin, p.is_gm, p.is_player
            FROM users u
            LEFT JOIN permissions p ON u.id = p.userid
            WHERE u.id = %s
            ''', (user_id,))

        user = cursor.fetchone()

        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404

        badges = []
        if user['is_admin']:
            badges.append('Admin')
        if user['is_gm']:
            badges.append('GM')
        if user['is_player']:
            badges.append('Player')

        cursor.execute('''
            SELECT DISTINCT g.GameID, g.GameTitle, g.GameImage
            FROM in_communities ic
            JOIN games g ON ic.game_id = g.GameID
            WHERE ic.user_id = %s
            ''', (user_id,))

        communities = []
        for game in cursor.fetchall():
            communities.append({
                'id': game['GameID'],
                'title': game['GameTitle'],
                'icon_url': f'/game-image/{game["GameID"]}' if game['GameImage'] else None
            })

        cursor.execute('''
            SELECT t.teamID, t.teamName, g.GameTitle, g.GameID, g.GameImage
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.teamID
            JOIN games g ON t.gameID = g.GameID
            WHERE tm.user_id = %s
            ''', (user_id,))

        teams = []
        for team in cursor.fetchall():
            teams.append({
                'id': team['teamID'],
                'name': team['teamName'],
                'game_title': team['GameTitle'],
                'game_icon': f'/game-image/{team["GameID"]}' if team['GameImage'] else None
            })

        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'name': f"{user['firstname']} {user['lastname']}",
                'username': user['username'],
                'profile_picture': user['profile_picture'],
                'badges': badges,
                'communities': communities,
                'teams': teams
            }
        })

    except Exception as e:
        print(f"Error fetching user profile: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load user profile.'}), 500

    finally:
        cursor.close()