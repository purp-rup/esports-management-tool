from EsportsManagementTool import app, mysql
from flask import request, redirect, url_for, session, flash, jsonify, render_template
import MySQLdb.cursors


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
        # This will need to be updated once you create the games table
        # For now, return an empty list or hardcoded games
        cursor.execute("SELECT * FROM games ORDER BY GameTitle ASC")
        games = cursor.fetchall()

        return jsonify({'success': True, 'games': games})

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
        data = request.get_json()
        game_title = data.get('game_title', '').strip()
        description = data.get('description', '').strip()
        team_sizes = data.get('team_sizes', [])  # This will be a list of integers

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

        # Insert the new game into the database
        # Note: You'll need to create this table first
        cursor.execute("""
            INSERT INTO games (GameTitle, Description, TeamSizes) 
            VALUES (%s, %s, %s)
        """, (game_title, description, team_sizes_str))

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
        cursor.execute("SELECT * FROM games WHERE GameID = %s", (game_id,))
        game = cursor.fetchone()

        if not game:
            return jsonify({'success': False, 'message': 'Game not found'}), 404

        # Convert team_sizes string back to list
        if game.get('TeamSizes'):
            game['team_sizes'] = [int(size) for size in game['TeamSizes'].split(',')]
        else:
            game['team_sizes'] = []

        return jsonify({
            'success': True,
            'id': game['GameID'],
            'title': game['GameTitle'],
            'description': game['Description'],
            'team_sizes': game['team_sizes']
        }), 200

    except Exception as e:
        print(f"Error fetching game details: {str(e)}")
        return jsonify({'success': False, 'message': 'Error fetching game details'}), 500

    finally:
        cursor.close()