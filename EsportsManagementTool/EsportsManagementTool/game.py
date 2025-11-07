from EsportsManagementTool import app, login_required, roles_required, get_user_permissions, has_role, mysql
from flask import request, redirect, url_for, session, flash, jsonify, render_template
import MySQLdb.cursors
from datetime import datetime
from flask import send_file
from io import BytesIO


@app.route('/games')
@login_required
def view_games():
    """View all available games"""
    if 'loggedin' not in session:
        flash('Please log in to view games', 'error')
        return redirect(url_for('login'))

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("SELECT GameID, GameTitle, Description, TeamSizes, GameImage FROM games ORDER BY GameTitle ASC")
        games = cursor.fetchall()

        games_with_details = []
        for game in games:
            game_dict = dict(game)

            if game.get('GameImage'):
                game_dict['ImageURL'] = f'/game-image/{game["GameID"]}'
            else:
                game_dict['ImageURL'] = None

            try:
                cursor.execute(f"SELECT 1 FROM in_communities WHERE user_id = %s AND game_id = %s LIMIT 1",
                               (session['id'], game['GameID']))
                game_dict['is_member'] = cursor.fetchone() is not None
            except:
                game_dict['is_member'] = False

            if 'GameImage' in game_dict:
                del game_dict['GameImage']

            games_with_details.append(game_dict)

        return jsonify({'success': True, 'games': games_with_details})

    except Exception as e:
        print(f"Error fetching games: {str(e)}")
        return jsonify({'success': True, 'games': []})

    finally:
        cursor.close()


@app.route('/create-game', methods=['POST'])
@roles_required('admin')
def create_game():
    """Create a new game and its member table"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        game_title = request.form.get('gameTitle', '').strip()
        description = request.form.get('gameDescription', '').strip()
        team_sizes_json = request.form.get('team_sizes', '[]')

        import json
        team_sizes = json.loads(team_sizes_json)

        game_image = None
        image_mime_type = None

        if 'gameImage' in request.files:
            file = request.files['gameImage']
            if file and file.filename:
                game_image = file.read()
                image_mime_type = file.content_type

        if not game_title:
            return jsonify({'success': False, 'message': 'Game title is required'}), 400

        if not description:
            return jsonify({'success': False, 'message': 'Description is required'}), 400

        if not team_sizes or len(team_sizes) == 0:
            return jsonify({'success': False, 'message': 'At least one team size must be selected'}), 400

        team_sizes_str = ','.join(map(str, team_sizes))

        cursor.execute("SELECT GameID FROM games WHERE GameTitle = %s", (game_title,))
        existing_game = cursor.fetchone()

        if existing_game:
            cursor.close()
            return jsonify({'success': False, 'message': 'A game with this title already exists'}), 400

        cursor.execute(
            "INSERT INTO games (GameTitle, Description, TeamSizes, GameImage, ImageMimeType) VALUES (%s, %s, %s, %s, %s)",
            (game_title, description, team_sizes_str, game_image, image_mime_type))

        game_id = cursor.lastrowid
        print(f"Game inserted with ID: {game_id}")

        mysql.connection.commit()
        print(f"Game {game_title} creation committed successfully")

        cursor.close()

        return jsonify(
            {'success': True, 'message': f'Game "{game_title}" created successfully', 'game_id': game_id}), 200

    except Exception as e:
        print(f"Error creating game: {str(e)}")
        import traceback
        traceback.print_exc()
        mysql.connection.rollback()
        cursor.close()
        return jsonify({'success': False, 'message': f'Database error: {str(e)}'}), 500


@app.route('/delete-game', methods=['POST'])
@roles_required('admin')
def delete_game():
    """Delete a game and drop its members from communities."""
    try:
        data = request.get_json()
        game_id = data.get('game_id')

        if not game_id:
            return jsonify({'success': False, 'message': 'Missing game ID'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("SELECT GameID, GameTitle FROM games WHERE GameID = %s", (game_id,))
            game = cursor.fetchone()

            if not game:
                return jsonify({'success': False, 'message': 'Game not found'}), 404

            game_title = game['GameTitle']

            cursor.execute("SELECT COUNT(*) as event_count FROM generalevents WHERE Game = %s", (game_title,))
            event_check = cursor.fetchone()

            if event_check['event_count'] > 0:
                return jsonify({'success': False,
                                'message': f'Cannot delete game. {event_check["event_count"]} event(s) are associated with this game.'}), 400

            cursor.execute("DELETE FROM in_communities WHERE game_id = %s", (game_id,))
            cursor.execute("DELETE FROM games WHERE GameID = %s", (game_id,))

            mysql.connection.commit()

            return jsonify(
                {'success': True, 'message': f'"{game_title}" and its community have been deleted successfully'}), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"Database error deleting game: {str(e)}")
            return jsonify({'success': False, 'message': 'Database error occurred'}), 500

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error in delete_game: {str(e)}")
        return jsonify({'success': False, 'message': 'Server error occurred'}), 500


@app.route('/api/game/<int:game_id>')
@login_required
def get_game_details(game_id):
    """Get details for a specific game"""
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("SELECT GameID, GameTitle, Description, TeamSizes, GameImage FROM games WHERE GameID = %s",
                       (game_id,))
        game = cursor.fetchone()

        if not game:
            return jsonify({'success': False, 'message': 'Game not found'}), 404

        team_sizes = []
        if game.get('TeamSizes'):
            team_sizes = [int(size) for size in game['TeamSizes'].split(',')]

        image_url = f'/game-image/{game["GameID"]}' if game.get('GameImage') else None

        return jsonify(
            {'success': True, 'id': game['GameID'], 'title': game['GameTitle'], 'description': game['Description'],
             'team_sizes': team_sizes, 'image_url': image_url}), 200

    except Exception as e:
        print(f"Error fetching game details: {str(e)}")
        return jsonify({'success': False, 'message': 'Error fetching game details'}), 500

    finally:
        cursor.close()


@app.route('/game-image/<int:game_id>')
def game_image(game_id):
    """Serve the game image from the database"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("SELECT GameImage, ImageMimeType FROM games WHERE GameID = %s", (game_id,))
        game = cursor.fetchone()

        if game and game['GameImage']:
            return send_file(BytesIO(game['GameImage']), mimetype=game['ImageMimeType'] or 'image/png',
                             as_attachment=False, download_name=f'game_{game_id}.png')
        else:
            return jsonify({'error': 'Image not found'}), 404

    except Exception as e:
        print(f"Error serving game image: {str(e)}")
        return jsonify({'error': 'Error loading image'}), 500

    finally:
        cursor.close()


@app.route('/api/games-list', methods=['GET'])
@login_required
def get_games_list():
    """Get list of all games for dropdowns"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("SELECT GameID, GameTitle FROM games ORDER BY GameTitle ASC")
            games = cursor.fetchall()

            return jsonify({'success': True, 'games': games}), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error fetching games list: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to fetch games'}), 500


@app.route('/api/game/<int:game_id>/details', methods=['GET'])
@login_required
def get_game_community_details(game_id):
    """Get detailed information about a game including members"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute(
                "SELECT GameID, GameTitle, Description, GameImage, ImageMimeType, TeamSizes FROM games WHERE GameID = %s",
                (game_id,))
            game = cursor.fetchone()

            if not game:
                return jsonify({'success': False, 'message': 'Game not found'}), 404

            game_title = game['GameTitle']

            team_sizes = []
            if game.get('TeamSizes'):
                team_sizes = [int(size) for size in game['TeamSizes'].split(',') if size.isdigit()]

            image_url = f'/game-image/{game["GameID"]}' if game.get('GameImage') else None

            try:
                cursor.execute(f"SELECT 1 FROM in_communities WHERE user_id = %s AND game_id = %s",
                               (session['id'], game_id))
                is_member = cursor.fetchone() is not None
            except:
                is_member = False

            try:
                cursor.execute(f"SELECT COUNT(*) as count FROM in_communities WHERE game_id = %s", (game_id,))
                member_count = cursor.fetchone()['count']

                cursor.execute('SELECT COUNT(*) as count FROM teams WHERE gameID = %s', (game_id,))
                team_result = cursor.fetchone()
                team_count = team_result['count'] if team_result else 0

            except:
                member_count = 0

            formatted_members = []
            assigned_gm_id = None
            try:
                cursor.execute("""
                               SELECT u.id, u.firstname, u.lastname, u.username,
                                      u.profile_picture, p.is_admin, p.is_gm,
                                      p.is_player, c.joined_at, (u.id = gm.gm_id) as is_game_manager
                               FROM in_communities c
                               JOIN games gm ON c.game_id = gm.GameID
                               JOIN users u ON c.user_id = u.id
                               LEFT JOIN permissions p ON u.id = p.userid
                               WHERE c.game_id = %s
                               ORDER BY (u.id = gm.gm_id) DESC, p.is_admin DESC, p.is_gm DESC, c.joined_at ASC
                               """, (game_id,))
                members = cursor.fetchall()

                for m in members:
                    roles = []
                    if m['is_admin'] == 1:
                        roles.append('Admin')
                    if m['is_gm'] == 1:
                        roles.append('Game Manager')
                    if m['is_player'] == 1:
                        roles.append('Player')

                    if not roles:
                        roles.append('Member')

                    profile_pic = None
                    if m['profile_picture']:
                        profile_pic = f"/static/uploads/avatars/{m['profile_picture']}"

                    is_assigned_gm = bool(m['is_game_manager'])

                    if is_assigned_gm:
                        assigned_gm_id = m['id']
                        print(f"DEBUG: Found assigned GM - {m['firstname']} {m['lastname']} (ID: {m['id']})")

                    formatted_members.append({
                        'id': m['id'],
                        'name': f"{m['firstname']} {m['lastname']}",
                        'username': m['username'],
                        'profile_picture': profile_pic,
                        'roles': roles,
                        'joined_at': m['joined_at'].strftime('%B %d, %Y') if m['joined_at'] else None,
                        'is_game_manager': is_assigned_gm
                    })

            except Exception as e:
                print(f"Error fetching members: {e}")
                import traceback
                traceback.print_exc()

            return jsonify({'success': True,
                            'game': {'id': game['GameID'], 'title': game_title, 'description': game['Description'],
                                     'image_url': image_url, 'team_sizes': team_sizes, 'member_count': member_count,
                                     'members': formatted_members, 'is_member': is_member, 'team_count': team_count,
                                     'assigned_gm_id': assigned_gm_id}}), 200
        finally:
            cursor.close()

    except Exception as e:
        print(f"Error getting game details: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load game details'}), 500


@app.route('/api/game/<int:game_id>/join', methods=['POST'])
@login_required
def join_community(game_id):
    """Join a game community"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("SELECT GameTitle FROM games WHERE GameID = %s", (game_id,))
            game = cursor.fetchone()

            if not game:
                return jsonify({'success': False, 'message': 'Game not found'}), 404

            game_title = game['GameTitle']

            try:
                cursor.execute(f"SELECT 1 FROM in_communities WHERE game_id = %s AND user_id = %s",
                               (game_id, session['id']))

                if cursor.fetchone():
                    return jsonify({'success': False, 'message': 'You are already a member of this community'}), 400
            except:
                pass

            cursor.execute('INSERT INTO in_communities (user_id, game_id, joined_at) VALUES (%s, %s, %s)', (session['id'], game_id, datetime.now()))
            mysql.connection.commit()

            return jsonify({'success': True, 'message': f'Successfully joined {game_title} community!'}), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"Database error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to join community'}), 500

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error joining community: {str(e)}")
        return jsonify({'success': False, 'message': 'Server error occurred'}), 500


@app.route('/api/game/<int:game_id>/leave', methods=['POST'])
@login_required
def leave_community(game_id):
    """Leave a game community"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("SELECT GameTitle FROM games WHERE GameID = %s", (game_id,))
            game = cursor.fetchone()

            if not game:
                return jsonify({'success': False, 'message': 'Game not found'}), 404

            game_title = game['GameTitle']

            cursor.execute(f"SELECT 1 FROM `in_communities` WHERE game_id = %s AND user_id = %s",
                           (game_id, session['id']))

            if not cursor.fetchone():
                return jsonify({'success': False, 'message': 'You are not a member of this community'}), 400

            cursor.execute('SELECT gm_id FROM games WHERE GameTitle = %s', (game_title,))
            is_gm = cursor.fetchone()
            gmUser = is_gm['gm_id']

            if gmUser == session['id']:
                cursor.execute('UPDATE games SET gm_id = NULL WHERE GameTitle = %s', (game_title,))
                mysql.connection.commit()


            cursor.execute(f"DELETE FROM `in_communities` WHERE game_id = %s AND user_id = %s", (game_id, session['id']))
            mysql.connection.commit()

            return jsonify({'success': True, 'message': f'Successfully left {game_title} community'}), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"Database error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to leave community'}), 500

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error leaving community: {str(e)}")
        return jsonify({'success': False, 'message': 'Server error occurred'}), 500


@app.route('/api/user/communities', methods=['GET'])
@login_required
def get_user_communities():
    """Get all communities the current user has joined"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute(
                "SELECT GameID, GameTitle, Description, GameImage, ImageMimeType, TeamSizes FROM games ORDER BY GameTitle ASC")
            all_games = cursor.fetchall()

            formatted_communities = []

            for game in all_games:
                game_id = game['GameID']
                game_title = game['GameTitle']

                try:
                    cursor.execute(f"SELECT joined_at FROM in_communities WHERE user_id = %s AND game_id = %s",
                                   (session['id'], game_id))

                    membership = cursor.fetchone()

                    if membership:
                        joined_at = membership['joined_at']

                        cursor.execute(f"SELECT COUNT(*) as count FROM in_communities WHERE game_id = %s", (game_id,))
                        member_count = cursor.fetchone()['count']

                        joined_str = joined_at.strftime('%B %d, %Y') if joined_at else 'Recently'

                        image_url = f'/game-image/{game_id}' if game.get('GameImage') else None

                        formatted_communities.append(
                            {'id': game_id, 'title': game_title, 'description': game['Description'],
                             'image_url': image_url, 'team_sizes': game['TeamSizes'], 'joined_at': joined_str,
                             'member_count': member_count})
                except Exception as e:
                    print(f"Error checking membership for {game_title}: {e}")
                    continue

            return jsonify({'success': True, 'communities': formatted_communities}), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error getting user communities: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load communities'}), 500


@app.route('/api/game/<int:game_id>/available-gms', methods=['GET'])
@login_required
def get_available_game_managers(game_id):
    """Get all users with GM role for assignment"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get all users with GM role
            cursor.execute("""
                SELECT u.id, u.firstname, u.lastname, u.username, u.profile_picture
                FROM users u
                JOIN permissions p ON u.id = p.userid
                WHERE p.is_gm = 1
                ORDER BY u.firstname, u.lastname
            """)
            gms = cursor.fetchall()

            formatted_gms = []
            for gm in gms:
                profile_pic = None
                if gm['profile_picture']:
                    profile_pic = f"/static/uploads/avatars/{gm['profile_picture']}"

                formatted_gms.append({
                    'id': gm['id'],
                    'name': f"{gm['firstname']} {gm['lastname']}",
                    'username': gm['username'],
                    'profile_picture': profile_pic
                })

            return jsonify({'success': True, 'game_managers': formatted_gms}), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error getting available GMs: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load game managers'}), 500


@app.route('/api/game/<int:game_id>/assign-gm', methods=['POST'])
@roles_required('admin')
def assign_game_manager(game_id):
    """Assign a game manager to a game"""
    try:
        data = request.get_json()
        gm_user_id = data.get('gm_user_id')

        if not gm_user_id:
            return jsonify({'success': False, 'message': 'Game manager ID is required'}), 400

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get game info
            cursor.execute("SELECT GameTitle FROM games WHERE GameID = %s", (game_id,))
            game = cursor.fetchone()

            if not game:
                return jsonify({'success': False, 'message': 'Game not found'}), 404


            game_title = game['GameTitle']

            #checking if user is already a gm of said game
            cursor.execute("SELECT gm_id FROM games WHERE gm_id = %s AND GameTitle = %s", (gm_user_id, game_title))
            is_already_gm = cursor.fetchone()

            if is_already_gm:
                return jsonify({'success': False, 'message': f'User is already GM for specified game.'}), 400

            # Setting new gm_id for selected game.
            cursor.execute("SELECT 1 FROM in_communities WHERE user_id = %s", (gm_user_id,))
            existUser = cursor.fetchone()

            if existUser:
                cursor.execute("UPDATE games SET gm_id = %s WHERE GameTitle = %s", (gm_user_id, game_title))
                mysql.connection.commit()
            else: #Add as member and GM
                cursor.execute("INSERT INTO in_communities (user_id, game_id, joined_at) VALUES (%s, %s, %s)", (gm_user_id, game_id, datetime.now()))
                cursor.execute("UPDATE games SET gm_id = %s WHERE GameTitle = %s", (gm_user_id, game_title))
                mysql.connection.commit()

            # Get GM name for response
            cursor.execute("SELECT firstname, lastname FROM users WHERE id = %s", (gm_user_id,))
            gm = cursor.fetchone()
            gm_name = f"{gm['firstname']} {gm['lastname']}"
            return jsonify({'success': True, 'message': f'{gm_name} has been assigned as Game Manager'}), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"Database error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to assign game manager'}), 500

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error assigning GM: {str(e)}")
        return jsonify({'success': False, 'message': 'Server error occurred'}), 500


@app.route('/api/game/<int:game_id>/remove-gm', methods=['POST'])
@roles_required('admin')
def remove_game_manager(game_id):
    """Remove game manager assignment from a game"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get game info
            cursor.execute("SELECT GameTitle FROM games WHERE GameID = %s", (game_id,))
            game = cursor.fetchone()

            if not game:
                return jsonify({'success': False, 'message': 'Game not found'}), 404

            game_title = game['GameTitle']

            # Remove GM assignment (but keep them as a member)
            cursor.execute(
                f"UPDATE games SET gm_id = NULL WHERE gameID = %s",
                (game_id,))

            mysql.connection.commit()

            return jsonify({'success': True, 'message': 'Game Manager assignment removed'}), 200

        except Exception as e:
            mysql.connection.rollback()
            print(f"Database error: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to remove game manager'}), 500

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error removing GM: {str(e)}")
        return jsonify({'success': False, 'message': 'Server error occurred'}), 500