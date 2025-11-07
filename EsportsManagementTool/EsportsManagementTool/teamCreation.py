from EsportsManagementTool import app, mysql, login_required, roles_required, get_user_permissions, has_role
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import MySQLdb.cursors

def idgen(text, existing_ids):
    words = text.split()
    prefix = ''.join(word[0].upper() for word in words if word)

    counter = 1
    while f"{prefix}{counter}" in existing_ids:
        counter += 1

    return f"{prefix}{counter}"

@app.route('/api/create-team/<int:game_id>', methods=['POST'])
@roles_required('admin', 'gm')
def create_team(game_id):
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:

        cursor.execute('SELECT GameTitle FROM games WHERE GameID = %s AND gm_id = %s', (game_id, session['id']))
        games = cursor.fetchone()

        if not games:
            return jsonify({'success': False, 'message': 'Game does not exist.'}), 400


        gamesGM = games['GameTitle']
        team_title = request.form.get('team_title', '').strip()
        true_size = request.form.get('team_sizes')

        # Check if team name already exists within table
        cursor.execute('SELECT COUNT(*) AS count FROM teams WHERE gameID = %s AND LOWER(teamName) = LOWER(%s)', (game_id, team_title))
        name = cursor.fetchone()
        if name['count'] > 0:
            return jsonify({'success': False, 'message': 'Team already exists.'}), 400

        cursor.execute('SELECT TeamID FROM teams WHERE gameID = %s', (game_id,))
        teams = cursor.fetchall()
        existingTeams = [team['TeamID'] for team in teams] if teams else []
        newID = idgen(gamesGM, existingTeams)


        cursor.execute('INSERT INTO teams (TeamID, teamName, teamMaxSize, gameID) VALUES (%s, %s, %s, %s)', (newID, team_title, true_size, game_id))
        mysql.connection.commit()

        return jsonify({'success': True, 'message': f'Team "{team_title}" created successfully!', 'team_id': newID})

    except Exception as e:
        mysql.connection.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()


# @app.route('/delete-team', methods=['POST'])
# @roles_required('admin', 'gm')
# def delete_team():
#     if 'loggedin' not in session:
#         return jsonify({'success': False, 'message': 'Unauthorized - Please log in'}), 401