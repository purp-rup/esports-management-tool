from EsportsManagementTool import app, mysql
from flask import request, redirect, url_for, session, flash, jsonify, render_template
import MySQLdb.cursors
from flask import send_file
from io import BytesIO


# Route to display all games (for the Rosters tab)
@app.route('/games')
def view_games():
    """
    View all available games in the system.
    Accessible to all logged-in users.
    """
    if 'loggedin' not in session:
        flash('Please log in to view games', 'error')
        return redirect(url_for('login'))

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("SELECT GameID, GameTitle, Description, TeamSizes, GameImage FROM games ORDER BY GameTitle ASC")
        games = cursor.fetchall()

        # Add image URL to each game
        games_with_images = []
        for game in games:
            game_dict = dict(game)
            # Add ImageURL if game has an image
            if game.get('GameImage'):
                game_dict['ImageURL'] = f'/game-image/{game["GameID"]}'
            else:
                game_dict['ImageURL'] = None

            # Remove the binary image data from response (don't send it in JSON)
            if 'GameImage' in game_dict:
                del game_dict['GameImage']

            games_with_images.append(game_dict)

        return jsonify({'success': True, 'games': games_with_images})

    except Exception as e:
        print(f"Error fetching games: {str(e)}")
        # Return empty list if table doesn't exist yet
        return jsonify({'success': True, 'games': []})

    finally:
        cursor.close()


# Route to create a new game
@app.route('/create-game', methods=['POST'])
def create_game():
    """
    Create a new game in the system.
    Only accessible to Admin users.
    """
    # Check if user is logged in
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized - Please log in'}), 401

    # Get user information to check admin status
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("SELECT * FROM users WHERE id = %s", (session['id'],))
        user = cursor.fetchone()

        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404

        # Admin check (temporary override treats all users as admin)
        if not user.get('is_admin', True):
            return jsonify({'success': False, 'message': 'Permission denied - Admin access required'}), 403

        # Get the form data
        game_title = request.form.get('gameTitle', '').strip()
        description = request.form.get('gameDescription', '').strip()
        team_sizes_json = request.form.get('team_sizes', '[]')

        # Parse team sizes from JSON string
        import json
        team_sizes = json.loads(team_sizes_json)

        # Handle image upload
        game_image = None
        image_mime_type = None

        if 'gameImage' in request.files:
            file = request.files['gameImage']
            if file and file.filename:
                # Read image as binary
                game_image = file.read()
                image_mime_type = file.content_type

        # Validation
        if not game_title:
            return jsonify({'success': False, 'message': 'Game title is required'}), 400

        if not description:
            return jsonify({'success': False, 'message': 'Description is required'}), 400

        if not team_sizes or len(team_sizes) == 0:
            return jsonify({'success': False, 'message': 'At least one team size must be selected'}), 400

        # Convert team_sizes list to a comma-separated string for storage
        team_sizes_str = ','.join(map(str, team_sizes))

        # Check if game already exists
        cursor.execute("SELECT GameID FROM games WHERE GameTitle = %s", (game_title,))
        existing_game = cursor.fetchone()

        if existing_game:
            return jsonify({'success': False, 'message': 'A game with this title already exists'}), 400

        #Insert game into database with image
        cursor.execute("""INSERT INTO games (GameTitle, Description, TeamSizes, GameImage, ImageMimeType) VALUES (%s, %s, %s, %s, %s)""", (game_title, description, team_sizes_str, game_image, image_mime_type))

        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': 'Game created successfully'
        }), 200

    except Exception as e:
        # Log the error for debugging
        print(f"Error creating game: {str(e)}")
        mysql.connection.rollback()
        return jsonify({
            'success': False,
            'message': 'Database error occurred while creating game'
        }), 500

    finally:
        cursor.close()


# Route to delete a game
@app.route('/delete-game', methods=['POST'])
def delete_game():
    """
    Delete a game from the system.
    Only accessible to Admin users.
    """
    # Check if user is logged in
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized - Please log in'}), 401

    # Get user information to check admin status
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("SELECT * FROM users WHERE id = %s", (session['id'],))
        user = cursor.fetchone()

        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404

        # Admin check (temporary override treats all users as admin)
        if not user.get('is_admin', True):
            return jsonify({'success': False, 'message': 'Permission denied - Admin access required'}), 403

        # Get the game ID from request JSON
        data = request.get_json()
        game_id = data.get('game_id')

        if not game_id:
            return jsonify({'success': False, 'message': 'Missing game ID'}), 400

        # Verify game exists before attempting to delete
        cursor.execute("SELECT GameID FROM games WHERE GameID = %s", (game_id,))
        game = cursor.fetchone()

        if not game:
            return jsonify({'success': False, 'message': 'Game not found'}), 404

        # Delete the game from the database
        cursor.execute("DELETE FROM games WHERE GameID = %s", (game_id,))
        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': 'Game deleted successfully'
        }), 200

    except Exception as e:
        # Log the error for debugging
        print(f"Error deleting game: {str(e)}")
        mysql.connection.rollback()
        return jsonify({
            'success': False,
            'message': 'Database error occurred while deleting game'
        }), 500

    finally:
        cursor.close()


# Route to get a single game's details
@app.route('/api/game/<int:game_id>')
def get_game_details(game_id):
    """
    Get details for a specific game.
    Accessible to all logged-in users.
    """
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("SELECT GameID, GameTitle, Description, TeamSizes, GameImage FROM games WHERE GameID = %s", (game_id,))
        game = cursor.fetchone()

        if not game:
            return jsonify({'success': False, 'message': 'Game not found'}), 404

        # Convert team_sizes string back to list
        if game.get('TeamSizes'):
            team_sizes = [int(size) for size in game['TeamSizes'].split(',')]
        else:
            team_sizes = []

        # Add image URL if exists
        image_url = None
        if game.get('GameImage'):
            image_url = f'/game-image/{game["GameID"]}'

        return jsonify({
            'success': True,
            'id': game['GameID'],
            'title': game['GameTitle'],
            'description': game['Description'],
            'team_sizes': team_sizes,
            'image_url': image_url
        }), 200

    except Exception as e:
        print(f"Error fetching game details: {str(e)}")
        return jsonify({'success': False, 'message': 'Error fetching game details'}), 500

    finally:
        cursor.close()

# Route to serve game images
@app.route('/game-image/<int:game_id>')
def game_image(game_id):
    """
    Serve the game image from the database.
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("SELECT GameImage, ImageMimeType FROM games WHERE GameID = %s", (game_id,))
        game = cursor.fetchone()

        if game and game['GameImage']:
            return send_file(
                BytesIO(game['GameImage']),
                mimetype=game['ImageMimeType'] or 'image/png',
                as_attachment=False,
                download_name=f'game_{game_id}.png'
            )
        else:
            # Return 404 if no image exists
            return jsonify({'error': 'Image not found'}), 404

    except Exception as e:
        print(f"Error serving game image: {str(e)}")
        return jsonify({'error': 'Error loading image'}), 500

    finally:
        cursor.close()