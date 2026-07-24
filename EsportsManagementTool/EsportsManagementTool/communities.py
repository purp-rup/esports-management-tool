from EsportsManagementTool import app, login_required, roles_required, mysql, EST, season_roles, forum_db
from EsportsManagementTool.universal_helpers import get_user_permissions, format_time_to_12hr, is_all_day_event, build_member_profile, attach_profile_extras
from flask import request, render_template, redirect, url_for, session, flash, jsonify
from datetime import datetime, timedelta
import MySQLdb.cursors
import json
import cloudinary
import cloudinary.uploader
import time
import requests

# ======================================
# COMMUNITY MANAGEMENT MODAL
# ======================================
@app.route('/create-community', methods=['POST'])
@roles_required('admin', 'developer')
def create_community():
    """Create a new game community and its membership database table"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        # Retrieve inputted fields
        game_title = request.form.get('gameTitle', '').strip()
        abbreviation = request.form.get('abbreviation', '').strip().upper()
        description = request.form.get('gameDescription', '').strip()
        team_sizes_json = request.form.get('team_sizes', '[]')
        division = request.form.get('division', 'Other').strip()

        team_sizes = json.loads(team_sizes_json)

        # Field Validation
        is_valid, error = validate_game_fields(game_title, abbreviation, description, team_sizes, division)
        if not is_valid:
            return jsonify({'success': False, 'message': error}), 400

        team_sizes_str = ','.join(map(str, team_sizes))

        # Check for duplicate title
        cursor.execute("SELECT GameID FROM games WHERE GameTitle = %s", (game_title,))
        if cursor.fetchone():
            return jsonify({'success': False, 'message': 'A game with this title already exists'}), 400

        # Check for duplicate abbreviation
        cursor.execute("SELECT GameID FROM games WHERE Abbreviation = %s", (abbreviation,))
        if cursor.fetchone():
            return jsonify({'success': False, 'message': 'This abbreviation is already in use'}), 400

        # Upload to Cloudinary
        image_url = None
        public_id = None
        if 'gameImage' in request.files:
            file = request.files['gameImage']
            if file and file.filename:
                upload_result = cloudinary.uploader.upload(file, folder="games")
                image_url = upload_result.get('secure_url')
                public_id = upload_result.get('public_id')

        cursor.execute(
            "INSERT INTO games (GameTitle, Abbreviation, Description, TeamSizes, Division, GameImage, cloudinary_public_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (game_title, abbreviation, description, team_sizes_str, division, image_url, public_id)
        )

        game_id = cursor.lastrowid
        mysql.connection.commit()

        return jsonify(
            {'success': True, 'message': f'Game "{game_title}" created successfully', 'game_id': game_id}), 200

    except Exception as e:
        print(f"Error creating game: {str(e)}")
        mysql.connection.rollback()
        return jsonify({'success': False, 'message': f'Database error: {str(e)}'}), 500

    finally:
        cursor.close()


@app.route('/api/game/<int:game_id>/available-gms', methods=['GET'])
@login_required
def get_available_game_managers(game_id):
    """Get all users with GM role. Meant for assigning GMs to a community"""
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
                    profile_pic = gm['profile_picture']

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
@roles_required('admin', 'developer')
def assign_game_manager(game_id):
    """Assign a game manager to a community"""
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

            # Check if user is already the MANAGER of this community
            cursor.execute("SELECT gm_id FROM games WHERE gm_id = %s AND GameID = %s", (gm_user_id, game_id))
            is_already_gm = cursor.fetchone()

            if is_already_gm:
                return jsonify({'success': False, 'message': f'User is already GM for this game.'}), 400

            # Check if user is a MEMBER of this community
            cursor.execute("SELECT 1 FROM in_communities WHERE user_id = %s AND game_id = %s", (gm_user_id, game_id))
            is_member = cursor.fetchone()

            if not is_member:
                # User is NOT in the community, so add them first
                cursor.execute(
                    "INSERT INTO in_communities (user_id, game_id, joined_at) VALUES (%s, %s, %s)",
                    (gm_user_id, game_id, datetime.now(EST))
                )

            # Now assign them as GM
            cursor.execute("UPDATE games SET gm_id = %s WHERE GameID = %s", (gm_user_id, game_id))
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
@roles_required('admin', 'developer')
def remove_game_manager(game_id):
    """Remove game manager assignment from a community"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get game info
            cursor.execute("SELECT GameTitle FROM games WHERE GameID = %s", (game_id,))
            game = cursor.fetchone()

            if not game:
                return jsonify({'success': False, 'message': 'Game not found'}), 404

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


@app.route('/api/gm-game-mappings', methods=['GET'])
@login_required
def get_gm_game_mappings():
    """
    Get GM assignments for universal badge display.
    Accepts an optional ?season_id= query param — when present, returns
    frozen historical assignments for that past season (via the existing
    season_roles helper) instead of live/current ones.
    """
    season_id = request.args.get('season_id', type=int)

    if season_id:
        try:
            mappings = season_roles.get_gm_game_mappings_for_season(mysql, season_id)
            return jsonify({'success': True, 'mappings': mappings}), 200
        except Exception as e:
            print(f"Error getting season GM-game mappings: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Failed to load GM mappings',
                'mappings': {}
            }), 500

    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get all games with assigned GMs
            cursor.execute("""
                SELECT g.GameID, g.GameTitle, g.gm_id, g.GameImage
                FROM games g
                WHERE g.gm_id IS NOT NULL
                ORDER BY g.GameTitle ASC
            """)

            games = cursor.fetchall()

            # Build mappings: { user_id: [game_info, ...] }
            mappings = {}

            for game in games:
                gm_id = game['gm_id']
                game_id = game['GameID']
                game_title = game['GameTitle']

                # Generate game icon URL
                game_icon_url = None
                if game['GameImage']:
                    game_icon_url = f'/game-image/{game_id}'

                # Add to mappings
                if gm_id not in mappings:
                    mappings[gm_id] = []

                mappings[gm_id].append({
                    'game_id': game_id,
                    'game_title': game_title,
                    'game_icon_url': game_icon_url
                })

            return jsonify({
                'success': True,
                'mappings': mappings
            }), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error getting GM-game mappings: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Failed to load GM mappings',
            'mappings': {}
        }), 500


@app.route('/api/games/manage/all', methods=['GET'])
@roles_required('admin', 'developer')
def get_all_games_for_management():
    """
    Get all games with their details for the Manage Communities modal
    Returns game info, current GM, and basic stats
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Get all games with GM info
        cursor.execute("""
            SELECT 
                g.GameID,
                g.GameTitle,
                g.Abbreviation,
                g.Description,
                g.Division,
                g.TeamSizes,
                g.gm_id,
                g.hidden,
                CASE WHEN g.GameImage IS NOT NULL THEN 1 ELSE 0 END as has_image,
                u.username as gm_username,
                u.firstname as gm_firstname,
                u.lastname as gm_lastname
            FROM games g
            LEFT JOIN users u ON g.gm_id = u.id
            ORDER BY g.GameTitle ASC
        """)

        games = cursor.fetchall()

        if not games:
            return jsonify({'success': True, 'games': []}), 200

        # Get member counts for all games
        game_ids = [game['GameID'] for game in games]
        member_counts, team_counts = get_game_stats(cursor, game_ids)

        # Build response
        games_data = []
        for game in games:
            game_id = game['GameID']

            gm_info = None
            if game['gm_id']:
                # Fetch GM profile picture
                cursor.execute(
                    "SELECT profile_picture FROM users WHERE id = %s",
                    (game['gm_id'],)
                )
                gm_pic_result = cursor.fetchone()
                gm_profile_pic = None
                if gm_pic_result and gm_pic_result['profile_picture']:
                    gm_profile_pic = gm_pic_result['profile_picture']

                gm_info = {
                    'user_id': game['gm_id'],
                    'username': game['gm_username'],
                    'full_name': f"{game['gm_firstname']} {game['gm_lastname']}",
                    'profile_picture': gm_profile_pic
                }

            games_data.append({
                'id': game_id,
                'title': game['GameTitle'],
                'abbreviation': game['Abbreviation'],
                'description': game['Description'],
                'division': game['Division'],
                'team_sizes': game['TeamSizes'],
                'image_url': f'/game-image/{game_id}' if game['has_image'] else None,
                'member_count': member_counts.get(game_id, 0),
                'team_count': team_counts.get(game_id, 0),
                'current_gm': gm_info,
                'hidden': bool(game['hidden'])
            })

        return jsonify({'success': True, 'games': games_data}), 200

    except Exception as e:
        print(f"Error fetching games for management: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to fetch games'}), 500

    finally:
        cursor.close()


@app.route('/api/games/manage/<int:game_id>', methods=['POST', 'PUT'])
@roles_required('admin', 'developer')
def update_game_details(game_id):
    """Update game details from Manage Communities modal"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Check if game exists
        cursor.execute("SELECT GameID, GameImage FROM games WHERE GameID = %s", (game_id,))
        existing = cursor.fetchone()

        if not existing:
            return jsonify({'success': False, 'message': 'Game not found'}), 404

        # Get form data
        game_title = request.form.get('title', '').strip()
        abbreviation = request.form.get('abbreviation', '').strip().upper()
        description = request.form.get('description', '').strip()
        division = request.form.get('division', '').strip()
        team_sizes_json = request.form.get('team_sizes', '[]')

        team_sizes = json.loads(team_sizes_json)

        # Field Validation
        is_valid, error = validate_game_fields(game_title, abbreviation, description, team_sizes, division)
        if not is_valid:
            return jsonify({'success': False, 'message': error}), 400

        team_sizes_str = ','.join(map(str, team_sizes))

        # Check for duplicate title (excluding current game)
        cursor.execute(
            "SELECT GameID FROM games WHERE GameTitle = %s AND GameID != %s",
            (game_title, game_id)
        )
        if cursor.fetchone():
            return jsonify({'success': False, 'message': 'A game with this title already exists'}), 400

        # Check for duplicate abbreviation (excluding current game)
        cursor.execute(
            "SELECT GameID FROM games WHERE Abbreviation = %s AND GameID != %s",
            (abbreviation, game_id)
        )
        if cursor.fetchone():
            return jsonify({'success': False, 'message': 'This abbreviation is already in use'}), 400

        # Handle image upload if present
        image_url = existing['GameImage']  # Keep existing by default
        public_id = None

        # Get old public_id
        cursor.execute("SELECT cloudinary_public_id FROM games WHERE GameID = %s", (game_id,))
        old_game = cursor.fetchone()
        old_public_id = old_game.get('cloudinary_public_id') if old_game else None

        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename:
                # Delete old image from Cloudinary
                if old_public_id:
                    cloudinary.uploader.destroy(old_public_id)

                # Upload new image
                upload_result = cloudinary.uploader.upload(file, folder="games")
                image_url = upload_result.get('secure_url')
                public_id = upload_result.get('public_id')

        # Update database
        if public_id:
            cursor.execute("""
                UPDATE games 
                SET GameTitle = %s, Abbreviation = %s, Description = %s, Division = %s, 
                    TeamSizes = %s, GameImage = %s, cloudinary_public_id = %s
                WHERE GameID = %s
            """, (game_title, abbreviation, description, division, team_sizes_str, image_url, public_id, game_id))
        else:
            cursor.execute("""
                UPDATE games 
                SET GameTitle = %s, Abbreviation = %s, Description = %s, Division = %s, TeamSizes = %s
                WHERE GameID = %s
            """, (game_title, abbreviation, description, division, team_sizes_str, game_id))

        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': f'Game "{game_title}" updated successfully',
            'game_id': game_id
        }), 200

    except Exception as e:
        print(f"Error updating game: {str(e)}")
        mysql.connection.rollback()
        return jsonify({'success': False, 'message': f'Failed to update game: {str(e)}'}), 500

    finally:
        cursor.close()


@app.route('/api/games/manage/<int:game_id>/toggle-hidden', methods=['POST'])
@roles_required('admin', 'developer')
def toggle_game_hidden(game_id):
    """
    Toggle hidden status of a community
    If a community is hidden in the management modal, it will not appear on the communities tab
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Get current hidden status
        cursor.execute("SELECT GameID, GameTitle, hidden FROM games WHERE GameID = %s", (game_id,))
        game = cursor.fetchone()

        if not game:
            return jsonify({'success': False, 'message': 'Game not found'}), 404

        # Toggle hidden status
        new_hidden_status = 0 if game['hidden'] else 1

        cursor.execute(
            "UPDATE games SET hidden = %s WHERE GameID = %s",
            (new_hidden_status, game_id)
        )

        mysql.connection.commit()

        action = 'hidden' if new_hidden_status else 'unhidden'

        return jsonify({
            'success': True,
            'message': f'"{game["GameTitle"]}" has been {action}',
            'hidden': bool(new_hidden_status)
        }), 200

    except Exception as e:
        print(f"Error toggling hidden status: {str(e)}")
        mysql.connection.rollback()
        return jsonify({'success': False, 'message': 'Failed to toggle hidden status'}), 500

    finally:
        cursor.close()


@app.route('/api/games/manage/<int:game_id>', methods=['DELETE'])
@roles_required('admin', 'developer')
def delete_community(game_id):
    """
    Delete a game from Manage Communities modal
    Includes validation for associated events and teams
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Check if game exists
        cursor.execute("SELECT GameID, GameTitle, cloudinary_public_id FROM games WHERE GameID = %s", (game_id,))
        game = cursor.fetchone()

        if not game:
            return jsonify({'success': False, 'message': 'Game not found'}), 404

        game_title = game['GameTitle']

        # Check for associated events
        cursor.execute(
            "SELECT COUNT(*) as event_count FROM generalevents WHERE Game = %s",
            (game_title,)
        )
        event_check = cursor.fetchone()

        if event_check['event_count'] > 0:
            return jsonify({
                'success': False,
                'message': f'Cannot delete game. {event_check["event_count"]} event(s) are associated with this game.'
            }), 400

        # Delete from cloudinary
        if game.get('cloudinary_public_id'):
            cloudinary.uploader.destroy(game['cloudinary_public_id'])

        # Check for associated teams (all seasons)
        cursor.execute(
            "SELECT COUNT(*) as team_count FROM teams WHERE gameID = %s",
            (game_id,)
        )
        team_check = cursor.fetchone()

        if team_check['team_count'] > 0:
            return jsonify({
                'success': False,
                'message': f'Cannot delete game. {team_check["team_count"]} team(s) are associated with this game.'
            }), 400

        # Safe to delete - remove community members first
        cursor.execute("DELETE FROM in_communities WHERE game_id = %s", (game_id,))

        # Delete the game
        cursor.execute("DELETE FROM games WHERE GameID = %s", (game_id,))

        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': f'"{game_title}" and its community have been deleted successfully'
        }), 200

    except Exception as e:
        print(f"Error deleting game: {str(e)}")
        mysql.connection.rollback()
        return jsonify({'success': False, 'message': 'Failed to delete game'}), 500

    finally:
        cursor.close()


# ==========================================
# COMMUNITY PAGES
# ==========================================
@app.route('/community/<int:game_id>')
@login_required
def community_page(game_id):
    """Dedicated page for a single game community"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("""
            SELECT GameID, GameTitle, Description, Division, gm_id,
                   CASE WHEN GameImage IS NOT NULL THEN 1 ELSE 0 END as has_image,
                   GameBanner
            FROM games
            WHERE GameID = %s AND hidden = 0
        """, (game_id,))
        game = cursor.fetchone()

        if not game:
            flash('Community not found.', 'error')
            return redirect(url_for('dashboard'))

        game['image_url'] = f'/game-image/{game_id}' if game['has_image'] else None

        member_counts, team_counts = get_game_stats(cursor, [game_id])
        game['member_count'] = member_counts.get(game_id, 0)
        game['team_count'] = team_counts.get(game_id, 0)

        permissions = get_user_permissions(session['id'])
        can_edit_banner = (
                permissions['is_admin'] or
                permissions['is_developer'] or
                game['gm_id'] == session['id']
        )

        return render_template(
            'communities.html',
            game=game,
            can_edit_banner=can_edit_banner
        )

    except Exception as e:
        print(f"Error loading community page: {str(e)}")
        flash('Failed to load community page.', 'error')
        return redirect(url_for('dashboard'))

    finally:
        cursor.close()


@app.route('/api/game/<int:game_id>/banner', methods=['POST'])
@login_required
def upload_game_banner(game_id):
    """Upload or replace a game banner. Accessible by the game's GM, admins, and developers."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("SELECT gm_id, banner_cloudinary_id FROM games WHERE GameID = %s", (game_id,))
        game = cursor.fetchone()

        if not game:
            return jsonify({'success': False, 'message': 'Game not found'}), 404

        permissions = get_user_permissions(session['id'])
        can_edit = (
                permissions['is_admin'] or
                permissions['is_developer'] or
                game['gm_id'] == session['id']
        )

        if not can_edit:
            return jsonify({'success': False, 'message': 'Permission denied'}), 403

        if 'banner' not in request.files or not request.files['banner'].filename:
            return jsonify({'success': False, 'message': 'No banner file provided'}), 400

        file = request.files['banner']

        # Delete old banner from Cloudinary if one exists
        if game.get('banner_cloudinary_id'):
            cloudinary.uploader.destroy(game['banner_cloudinary_id'])

        upload_result = cloudinary.uploader.upload(file, folder="game_banners")
        banner_url = upload_result.get('secure_url')
        banner_public_id = upload_result.get('public_id')

        cursor.execute(
            "UPDATE games SET GameBanner = %s, banner_cloudinary_id = %s WHERE GameID = %s",
            (banner_url, banner_public_id, game_id)
        )
        mysql.connection.commit()

        return jsonify({'success': True, 'banner_url': banner_url}), 200

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error uploading banner: {str(e)}")
        return jsonify({'success': False, 'message': f'Upload failed: {str(e)}'}), 500

    finally:
        cursor.close()


@app.route('/api/game/<int:game_id>/details', methods=['GET'])
@login_required
def get_community_details(game_id):
    """
    Get information about a community
    Includes members, GMs, teams, population, and description
    """
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute(
                "SELECT GameID, GameTitle, Description, GameImage, ImageMimeType, TeamSizes, gm_id FROM games WHERE GameID = %s",
                (game_id,))
            game = cursor.fetchone()

            if not game:
                return jsonify({'success': False, 'message': 'Game not found'}), 404

            game_title = game['GameTitle']

            # Check if current user is the GM for this game
            is_game_manager = (game['gm_id'] == session['id'])

            team_sizes = []
            if game.get('TeamSizes'):
                team_sizes = [int(size) for size in game['TeamSizes'].split(',') if size.isdigit()]

            image_url = f'/game-image/{game["GameID"]}' if game.get('GameImage') else None

            try:
                cursor.execute(f"SELECT 1 FROM in_communities WHERE user_id = %s AND game_id = %s", (session['id'], game_id))
                is_member = cursor.fetchone() is not None
            except:
                is_member = False

            # Retrieve member count and team count for community
            member_counts, team_counts = get_game_stats(cursor, [game_id])
            member_count = member_counts.get(game_id, 0)
            team_count = team_counts.get(game_id, 0)

            try:
                cursor.execute("""
                               SELECT u.id, u.firstname, u.lastname, u.username,
                                      u.profile_picture, p.is_admin, p.is_developer, p.is_gm,
                                      p.is_player, c.joined_at, (u.id = gm.gm_id) as is_game_manager,
                                      d.discord_username, d.discord_discriminator
                               FROM in_communities c
                               JOIN games gm ON c.game_id = gm.GameID
                               JOIN users u ON c.user_id = u.id
                               LEFT JOIN permissions p ON u.id = p.userid
                               LEFT JOIN discord d ON d.userid = u.id
                               WHERE c.game_id = %s
                               ORDER BY (u.id = gm.gm_id) DESC, p.is_developer DESC, p.is_admin DESC, p.is_gm DESC, c.joined_at ASC
                               """, (game_id,))
                members = cursor.fetchall()

                # Finish building user profiles using universal_helper function
                attach_profile_extras(cursor, members, game_id)

                # Format response to build user profiles with GM assignment
                formatted_members = [build_member_profile(m, include_gm_flag=True) for m in members]
                assigned_gm_id = next(
                    (m['id'] for m in formatted_members if m.get('is_game_manager')),
                    None
                )

            except Exception as e:
                print(f"Error fetching members: {e}")

            return jsonify({
                'success': True,
                'game': {'id': game['GameID'],
                     'title': game_title,
                     'description': game['Description'],
                     'image_url': image_url,
                     'team_sizes': team_sizes,
                     'member_count': member_count,
                     'members': formatted_members,
                     'is_member': is_member,
                     'team_count': team_count,
                     'assigned_gm_id': assigned_gm_id,
                     'is_game_manager': is_game_manager}}), 200
        finally:
            cursor.close()

    except Exception as e:
        print(f"Error getting game details: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load game details'}), 500


@app.route('/game-image/<int:game_id>')
def game_image(game_id):
    """Retrieve the game image from the database for display"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("SELECT GameImage FROM games WHERE GameID = %s", (game_id,))
        game = cursor.fetchone()

        if game and game['GameImage']:
            return redirect(game['GameImage'])
        else:
            return jsonify({'error': 'Image not found'}), 404

    except Exception as e:
        print(f"Error serving game image: {str(e)}")
        return jsonify({'error': 'Error loading image'}), 500

    finally:
        cursor.close()


@app.route('/api/game/<int:game_id>/current-leagues', methods=['GET'])
@login_required
def get_current_game_leagues(game_id):
    """Get all leagues associated with this game's current season teams"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Get current active season
        cursor.execute("SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1")
        active_season = cursor.fetchone()

        if not active_season:
            return jsonify({'success': True, 'leagues': []})

        active_season_id = active_season['season_id']

        # Get unique leagues from teams in current season for this game
        cursor.execute("""
            SELECT DISTINCT l.id, l.name, l.website_url,
                   l.logo,
                   COUNT(DISTINCT tl.team_id) as team_count
            FROM league l
            INNER JOIN team_leagues tl ON l.id = tl.league_id
            INNER JOIN teams t ON tl.team_id = t.TeamID
            WHERE t.gameID = %s
            AND t.season_id = %s
            GROUP BY l.id, l.name, l.website_url, l.logo
            ORDER BY l.name ASC
        """, (game_id, active_season_id))

        leagues = cursor.fetchall()

        # Calls from cloudinary
        for league in leagues:
            if 'has_logo' in league:
                del league['has_logo']

        return jsonify({'success': True, 'leagues': leagues}), 200

    except Exception as e:
        print(f"Error fetching game current leagues: {e}")
        return jsonify({'success': False, 'message': 'Failed to fetch leagues'}), 500

    finally:
        cursor.close()


@app.route('/api/games/<int:game_id>/next-scheduled-event', methods=['GET'])
@login_required
def get_next_community_event(game_id):
    """
    Get the next upcoming event for a game community
    Includes both scheduled events AND regular events assigned to this game
    Returns whichever event is sooner
    """
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get current date/time
            now = datetime.now(EST)
            current_date = now.date()

            # Query 1: Get next scheduled event with game_community visibility
            cursor.execute("""
                SELECT 
                    ge.EventID as id,
                    ge.EventName as name,
                    ge.Date as date,
                    ge.StartTime as start_time,
                    ge.EndTime as end_time,
                    ge.EventType as event_type,
                    ge.Description as description,
                    'scheduled' as source
                FROM generalevents ge
                JOIN scheduled_events se ON ge.schedule_id = se.schedule_id
                WHERE se.game_id = %s
                AND se.visibility = 'game_community'
                AND ge.Date >= %s
                AND ge.is_scheduled = TRUE
                ORDER BY ge.Date ASC, ge.StartTime ASC
                LIMIT 1
            """, (game_id, current_date))

            scheduled_event = cursor.fetchone()

            # Query 2: Get next regular event assigned to this game
            cursor.execute("""
                SELECT 
                    ge.EventID as id,
                    ge.EventName as name,
                    ge.Date as date,
                    ge.StartTime as start_time,
                    ge.EndTime as end_time,
                    ge.EventType as event_type,
                    ge.Description as description,
                    'regular' as source
                FROM generalevents ge
                JOIN event_games eg ON ge.EventID = eg.event_id
                WHERE eg.game_id = %s
                AND ge.Date >= %s
                AND (ge.is_scheduled IS NULL OR ge.is_scheduled = FALSE)
                ORDER BY ge.Date ASC, ge.StartTime ASC
                LIMIT 1
            """, (game_id, current_date))

            regular_event = cursor.fetchone()

            # Determine which event is sooner
            next_event = None

            if scheduled_event and regular_event:
                # Compare dates and times
                # Handle timedelta for start_time (MySQL TIME type)
                if isinstance(scheduled_event['start_time'], timedelta):
                    scheduled_time = (datetime.min + scheduled_event['start_time']).time()
                else:
                    scheduled_time = scheduled_event['start_time']

                if isinstance(regular_event['start_time'], timedelta):
                    regular_time = (datetime.min + regular_event['start_time']).time()
                else:
                    regular_time = regular_event['start_time']

                scheduled_datetime = datetime.combine(scheduled_event['date'], scheduled_time)
                regular_datetime = datetime.combine(regular_event['date'], regular_time)

                print(f"Comparing: scheduled={scheduled_datetime} vs regular={regular_datetime}")
                next_event = scheduled_event if scheduled_datetime <= regular_datetime else regular_event

            elif scheduled_event:
                next_event = scheduled_event
                print(f"Only scheduled event available: {next_event['name']}")
            elif regular_event:
                next_event = regular_event
                print(f"Only regular event available: {next_event['name']}")

            if not next_event:
                print("No upcoming events found")
                return jsonify({
                    'success': True,
                    'event': None
                }), 200

            # Format the event for frontend
            start_time_display = format_time_to_12hr(next_event['start_time'])
            end_time_display = format_time_to_12hr(next_event['end_time'])

            # Check if all-day event
            is_all_day = is_all_day_event(start_time_display, end_time_display)

            formatted_event = {
                'id': next_event['id'],
                'name': next_event['name'],
                'date': next_event['date'].strftime('%B %d, %Y'),
                'start_time': start_time_display,
                'end_time': end_time_display,
                'event_type': next_event['event_type'],
                'description': next_event['description'] or '',
                'is_all_day': is_all_day,
                'source': next_event['source']
            }

            return jsonify({
                'success': True,
                'event': formatted_event
            }), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f" Error getting next community event: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Failed to load next event: {str(e)}'
        }), 500


# ===================================
# COMMUNITY FORUM
# ===================================
FORUM_PAGE_SIZE = 30
PROFANITY_API_URL = "https://vector.profanity.dev"

@app.route('/api/game/<int:game_id>/messages', methods=['GET'])
@login_required
def get_community_messages(game_id):
    """
    Fetch a page of community forum messages, cursor-paginated by message_id.
    Pass ?before=<message_id> to fetch the next chunk older than that message.
    Anyone who can view the community page can read its forum.
    """
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("SELECT GameID FROM games WHERE GameID = %s AND hidden = 0", (game_id,))
            if not cursor.fetchone():
                return jsonify({'success': False, 'message': 'Community not found'}), 404

            before_id = request.args.get('before', type=str)

            items, has_more = forum_db.get_messages_page(
                community_id=game_id, before=before_id, limit=FORUM_PAGE_SIZE
            )
            items.reverse()  # ascending message order

            if not items:
                return jsonify({'success': True, 'messages': [], 'has_more': has_more}), 200

            user_ids = sorted({item['user_id'] for item in items})
            placeholders = ','.join(['%s'] * len(user_ids))
            cursor.execute(
                f"SELECT id, username, firstname, lastname, profile_picture FROM users WHERE id IN ({placeholders})",
                user_ids
            )
            users_by_id = {row['id']: row for row in cursor.fetchall()}

            messages = []
            for item in items:
                user = users_by_id.get(item['user_id'], {})
                messages.append({
                    'message_id': item['message_id'],
                    'user_id': item['user_id'],
                    'username': user.get('username', 'Unknown'),
                    'full_name': f"{user.get('firstname', '')} {user.get('lastname', '')}".strip() or 'Unknown User',
                    'profile_picture': user.get('profile_picture'),
                    'content': item['content'],
                    'created_at': datetime.fromtimestamp(item['created_at'], EST).isoformat()
                })

            attach_role_badges(cursor, messages, game_id)

            return jsonify({'success': True, 'messages': messages, 'has_more': has_more}), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error fetching community messages: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load messages'}), 500

def check_message_profanity(content: str) -> bool:
    """
    Calls the profanity.dev API. Returns True if the message is flagged.
    Fails open (returns False) if the API errors out or times out.
    """
    try:
        response = requests.post(
            PROFANITY_API_URL,
            json={"message": content},
            timeout=3,
        )
        response.raise_for_status()
        return bool(response.json().get("isProfanity", False))
    except Exception as e:
        print(f"Profanity check failed, allowing message through: {str(e)}")
        return False

@app.route('/api/game/<int:game_id>/messages', methods=['POST'])
@login_required
def post_community_message(game_id):
    """Post a new message to a community's forum. Requires community membership."""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("SELECT 1 FROM in_communities WHERE user_id = %s AND game_id = %s",
                           (session['id'], game_id))
            if not cursor.fetchone():
                return jsonify({'success': False, 'message': 'You must be a member of this community to post'}), 403

            data = request.get_json(silent=True) or {}
            content = (data.get('content') or '').strip()

            if not content:
                return jsonify({'success': False, 'message': 'Message cannot be empty'}), 400
            if len(content) > 2000:
                return jsonify({'success': False, 'message': 'Message is too long (2000 character limit)'}), 400

            is_profane = check_message_profanity(content)

            # community_id/user_id from MySQL
            item = forum_db.create_message(
                community_id=game_id, user_id=session['id'], content=content, is_profane=is_profane
            )

            if is_profane:
                forum_db.soft_delete_message(
                    community_id=game_id, message_id=item['message_id'], deleted_by=session['id']
                )
                return jsonify({
                    'success': False,
                    'blocked': True,
                    'message': 'Your message was not sent because it contains inappropriate language.'
                }), 200

            cursor.execute(
                "SELECT username, firstname, lastname, profile_picture FROM users WHERE id = %s",
                (session['id'],)
            )
            user = cursor.fetchone()

            return jsonify({'success': True, 'message': {
                'message_id': item['message_id'],
                'user_id': session['id'],
                'username': user['username'],
                'full_name': f"{user['firstname']} {user['lastname']}",
                'profile_picture': user['profile_picture'],
                'content': content,
                'created_at': datetime.fromtimestamp(item['created_at'], EST).isoformat()
            }}), 200

        except Exception as e:
            print(f"Error posting community message: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to send message'}), 500

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error posting community message: {str(e)}")
        return jsonify({'success': False, 'message': 'Server error occurred'}), 500


@app.route('/api/game/<int:game_id>/messages/<message_id>', methods=['DELETE'])
@login_required
def delete_community_message(game_id, message_id):
    """
    Allowed for the message's author or anyone with permissions (admins, developers, GMs).
    """
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            message = forum_db.get_message(community_id=game_id, message_id=message_id)
            if not message:
                return jsonify({'success': False, 'message': 'Message not found'}), 404

            cursor.execute("SELECT gm_id FROM games WHERE GameID = %s", (game_id,))
            game = cursor.fetchone()

            permissions = get_user_permissions(session['id'])
            can_moderate = (
                message['user_id'] == session['id'] or
                permissions['is_admin'] or
                permissions['is_developer'] or
                (game and game['gm_id'] == session['id'])
            )

            if not can_moderate:
                return jsonify({'success': False, 'message': 'Permission denied'}), 403

            updated = forum_db.soft_delete_message(
                community_id=game_id, message_id=message_id, deleted_by=session['id']
            )
            if not updated:
                return jsonify({'success': False, 'message': 'Message not found'}), 404

            return jsonify({'success': True, 'message': 'Message deleted'}), 200

        except Exception as e:
            print(f"Error deleting community message: {str(e)}")
            return jsonify({'success': False, 'message': 'Failed to delete message'}), 500

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error deleting community message: {str(e)}")
        return jsonify({'success': False, 'message': 'Server error occurred'}), 500

@app.route('/api/game/<int:game_id>/messages/new', methods=['GET'])
@login_required
def get_new_community_messages(game_id):
    """
    Returns new messages, who's typing, and any
    messages that were deleted since the last check.
    """
    after_id = request.args.get('after', default='', type=str)
    deleted_after = request.args.get('deleted_after', default=0, type=int)

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        items = forum_db.get_new_messages(community_id=game_id, after_message_id=after_id)
        deleted_ids = forum_db.get_recently_deleted(community_id=game_id, since_timestamp=deleted_after)
        next_deleted_after = int(time.time())  # cursor for the client's next poll

        messages = []
        if items:
            user_ids = sorted({item['user_id'] for item in items})
            placeholders = ','.join(['%s'] * len(user_ids))
            cursor.execute(
                f"SELECT id, username, firstname, lastname, profile_picture FROM users WHERE id IN ({placeholders})",
                user_ids
            )
            users_by_id = {row['id']: row for row in cursor.fetchall()}

            for item in items:
                user = users_by_id.get(item['user_id'], {})
                messages.append({
                    'message_id': item['message_id'],
                    'user_id': item['user_id'],
                    'username': user.get('username', 'Unknown'),
                    'full_name': f"{user.get('firstname', '')} {user.get('lastname', '')}".strip() or 'Unknown User',
                    'profile_picture': user.get('profile_picture'),
                    'content': item['content'],
                    'created_at': datetime.fromtimestamp(item['created_at'], EST).isoformat()
                })

        attach_role_badges(cursor, messages, game_id) 

        return jsonify({
            'success': True,
            'messages': messages,
            'deleted_message_ids': deleted_ids,
            'deleted_after': next_deleted_after
        }), 200

    except Exception as e:
        print(f"Error fetching new community messages: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load new messages'}), 500

    finally:
        cursor.close()

@app.route('/api/admin/audit-log/profanity', methods=['GET'])
@roles_required('admin', 'developer')
def get_profanity_audit_log():
    """
    Returns every message flagged as profane, across all communities, for
    the admin audit log.
    """
    try:
        entries = forum_db.get_profane_messages()

        if not entries:
            return jsonify({'success': True, 'entries': []}), 200

        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            user_ids = list({e['user_id'] for e in entries})
            community_ids = list({e['community_id'] for e in entries})

            user_placeholders = ','.join(['%s'] * len(user_ids))
            cursor.execute(
                f"SELECT id, username, firstname, lastname FROM users WHERE id IN ({user_placeholders})",
                tuple(user_ids)
            )
            users_by_id = {u['id']: u for u in cursor.fetchall()}

            game_placeholders = ','.join(['%s'] * len(community_ids))
            cursor.execute(
                f"SELECT GameID, GameTitle FROM games WHERE GameID IN ({game_placeholders})",
                tuple(community_ids)
            )
            games_by_id = {g['GameID']: g['GameTitle'] for g in cursor.fetchall()}

            result = []
            for e in entries:
                user = users_by_id.get(e['user_id'])
                result.append({
                    'message_id': e['message_id'],
                    'community_id': e['community_id'],
                    'community_name': games_by_id.get(e['community_id'], f"Community #{e['community_id']}"),
                    'user_id': e['user_id'],
                    'username': user['username'] if user else 'Unknown user',
                    'full_name': f"{user['firstname']} {user['lastname']}" if user else 'Unknown user',
                    'content': e['content'],
                    'created_at': datetime.fromtimestamp(e['created_at'], EST).isoformat(),
                })

            return jsonify({'success': True, 'entries': result}), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error fetching profanity audit log: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load audit log'}), 500

def attach_role_badges(cursor, messages, game_id):
    """
    Attach role badge fields to each message, scoped to this community.
    is_gm is scoped to game_id (only the assigned GM for this game gets the badge).
    """
    if not messages:
        return messages

    user_ids = sorted({m['user_id'] for m in messages})
    placeholders = ','.join(['%s'] * len(user_ids))

    cursor.execute(
        f"SELECT userid, is_admin, is_developer, is_player FROM permissions WHERE userid IN ({placeholders})",
        user_ids
    )
    perms_by_user = {row['userid']: row for row in cursor.fetchall()}

    cursor.execute("SELECT gm_id, GameImage FROM games WHERE GameID = %s", (game_id,))
    game = cursor.fetchone()
    gm_id = game['gm_id'] if game else None
    gm_icon = f'/game-image/{game_id}' if game and game.get('GameImage') else None

    for msg in messages:
        perms = perms_by_user.get(msg['user_id'], {})
        msg['is_dev'] = bool(perms.get('is_developer'))
        msg['is_admin'] = bool(perms.get('is_admin'))
        msg['is_gm'] = (msg['user_id'] == gm_id)
        msg['gm_icon'] = gm_icon if msg['is_gm'] else None
        msg['is_player'] = bool(perms.get('is_player'))

    return messages

# ===================================
# COMMUNITY TAB
# ===================================
@app.route('/communities')
@login_required
def view_communities():
    """View all available communities for the communities tab"""
    if 'loggedin' not in session:
        flash('Please log in to view games', 'error')
        return redirect(url_for('login'))

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        user_id = session['id']

        # Get all games with basic info
        cursor.execute("""
            SELECT 
                GameID,
                GameTitle,
                Description,
                TeamSizes,
                Division,
                gm_id,
                CASE WHEN GameImage IS NOT NULL THEN 1 ELSE 0 END as has_image,
                GameBanner
            FROM games
            WHERE hidden = 0
            ORDER BY GameTitle ASC
        """)

        games = cursor.fetchall()

        if not games:
            return jsonify({'success': True, 'games': []})

        # Get member counts for each game
        game_ids = [game['GameID'] for game in games]
        member_counts, team_counts = get_game_stats(cursor, game_ids)

        # Get current user's memberships
        placeholders = ','.join(['%s'] * len(game_ids))
        cursor.execute(f"""
            SELECT game_id
            FROM in_communities
            WHERE user_id = %s AND game_id IN ({placeholders})
        """, [user_id] + game_ids)

        user_memberships = {row['game_id'] for row in cursor.fetchall()}

        # Build full response
        games_with_details = []
        for game in games:
            game_id = game['GameID']

            game_dict = {
                'GameID': game_id,
                'GameTitle': game['GameTitle'],
                'Description': game['Description'],
                'TeamSizes': game['TeamSizes'],
                'Division': game['Division'],
                'ImageURL': f'/game-image/{game_id}' if game['has_image'] else None,
                'GameBanner': game['GameBanner'],
                'member_count': member_counts.get(game_id, 0),
                'team_count': team_counts.get(game_id, 0),
                'is_member': game_id in user_memberships,
                'is_game_manager': game['gm_id'] == user_id if game['gm_id'] else False
            }

            games_with_details.append(game_dict)

        return jsonify({'success': True, 'games': games_with_details})

    except Exception as e:
        print(f"Error fetching games: {str(e)}")
        return jsonify({'success': True, 'games': []})

    finally:
        cursor.close()


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
                cursor.execute(f"SELECT 1 FROM in_communities WHERE game_id = %s AND user_id = %s", (game_id, session['id']))

                if cursor.fetchone():
                    return jsonify({'success': False, 'message': 'You are already a member of this community'}), 400
            except:
                pass

            cursor.execute('INSERT INTO in_communities (user_id, game_id, joined_at) VALUES (%s, %s, %s)', (session['id'], game_id, datetime.now(EST)))
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


# ===================================
# PROFILE TAB
# ===================================
@app.route('/api/user/communities', methods=['GET'])
@login_required
def get_user_communities():
    """Get all communities the current user has joined for their profile tab"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute(
                "SELECT GameID, GameTitle, Description, GameImage, ImageMimeType, TeamSizes, Abbreviation FROM games ORDER BY GameTitle ASC")
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
                             'member_count': member_count, 'abbreviation': game['Abbreviation']})
                except Exception as e:
                    print(f"Error checking membership for {game_title}: {e}")
                    continue

            return jsonify({'success': True, 'communities': formatted_communities}), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error getting user communities: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load communities'}), 500


# =======================================
# MISCELLANEOUS
# =======================================
@app.route('/api/game-list', methods=['GET'])
@login_required
def get_game_list():
    """Get list of all games for dropdowns"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("""
                SELECT GameID, GameTitle, Abbreviation,
                       CASE WHEN GameImage IS NOT NULL THEN 1 ELSE 0 END as has_image
                FROM games
                ORDER BY GameTitle ASC
            """)
            games = cursor.fetchall()

            for game in games:
                game['image_url'] = f'/game-image/{game["GameID"]}' if game['has_image'] else None

            return jsonify({'success': True, 'games': games}), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error fetching games list: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to fetch games'}), 500


# ==========================================
# HELPERS
# ==========================================
def validate_game_fields(title, abbreviation, description, team_sizes, division):
    """Validate the common game fields shared by create_community and update_game_details"""
    valid_divisions = ['Strategy', 'Shooter', 'Sports', 'Other']

    if not title:
        return False, 'Game title is required'
    if not abbreviation:
        return False, 'Game abbreviation is required'
    if len(abbreviation) > 5:
        return False, 'Abbreviation must be 5 characters or less'
    if not abbreviation.replace(' ', '').isalnum():
        return False, 'Abbreviation must contain only letters and numbers'
    if not description:
        return False, 'Description is required'
    if not team_sizes:
        return False, 'At least one team size must be selected'
    if division not in valid_divisions:
        return False, 'Invalid division selected'
    return True, None


def get_game_stats(cursor, game_ids):
    """Fetch member counts and active-season team counts for a list of game IDs"""
    placeholders = ','.join(['%s'] * len(game_ids))

    cursor.execute(f"""
        SELECT game_id, COUNT(DISTINCT user_id) as member_count
        FROM in_communities
        WHERE game_id IN ({placeholders})
        GROUP BY game_id
    """, game_ids)
    member_counts = {row['game_id']: row['member_count'] for row in cursor.fetchall()}

    cursor.execute(f"""
        SELECT t.gameID, COUNT(*) as team_count
        FROM teams t
        INNER JOIN seasons s ON t.season_id = s.season_id
        WHERE t.gameID IN ({placeholders})
        AND s.is_active = 1
        GROUP BY t.gameID
    """, game_ids)
    team_counts = {row['gameID']: row['team_count'] for row in cursor.fetchall()}

    return member_counts, team_counts