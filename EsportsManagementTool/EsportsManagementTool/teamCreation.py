from EsportsManagementTool import app, mysql, login_required, roles_required, get_user_permissions, has_role
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import MySQLdb.cursors
from EsportsManagementTool import get_current_time, localize_datetime, EST

def idgen(abbreviation, existing_ids):
    """
    Generate team ID using game abbreviation + counter
    @param abbreviation: Game abbreviation (max 5 chars)
    @param existing_ids: List of existing team IDs to avoid duplicates
    """
    # Use abbreviation directly (already uppercase)
    prefix = abbreviation

    counter = 1
    while f"{prefix}{counter}" in existing_ids:
        counter += 1

    return f"{prefix}{counter}"

"""
Method to allow an admin or a game manager to create a game.
@param - game_id is the id of the game a team is being made for.
"""
@app.route('/api/create-team/<int:game_id>', methods=['POST'])
@roles_required('admin', 'gm', 'developer')
def create_team(game_id):
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        # ============================================
        # STEP 1: CHECK FOR ACTIVE SEASON
        # ============================================
        cursor.execute("""
            SELECT season_id, season_name 
            FROM seasons 
            WHERE is_active = 1 
            LIMIT 1
        """)
        active_season = cursor.fetchone()

        if not active_season:
            return jsonify({
                'success': False,
                'message': 'Cannot create team: No active season found. Please create a season first.'
            }), 400

        season_id = active_season['season_id']
        season_name = active_season['season_name']

        # ============================================
        # STEP 2: VALIDATE GAME EXISTS AND USER HAS PERMISSION
        # ============================================
        cursor.execute('SELECT GameTitle, Abbreviation FROM games WHERE GameID = %s AND gm_id = %s', (game_id, session['id']))
        games = cursor.fetchone()

        if not games:
            return jsonify({'success': False, 'message': 'Game does not exist or you do not have permission.'}), 400

        game_title = games['GameTitle']
        game_abbreviation = games['Abbreviation']
        team_title = request.form.get('team_title', '').strip()
        true_size = request.form.get('team_sizes')

        # Get league IDs from form data (JSON string)
        leagues_json = request.form.get('leagues', '[]')
        import json
        league_ids = json.loads(leagues_json) if leagues_json else []

        # ============================================
        # STEP 3: CHECK IF TEAM NAME ALREADY EXISTS
        # ============================================
        cursor.execute('''
            SELECT COUNT(*) AS count 
            FROM teams 
            WHERE gameID = %s 
            AND LOWER(teamName) = LOWER(%s)
            AND season_id = %s
        ''', (game_id, team_title, season_id))
        name = cursor.fetchone()
        if name['count'] > 0:
            return jsonify({
                'success': False,
                'message': f'A team with this name already exists for {season_name}. Please choose a different name.'
            }), 400

        # ============================================
        # STEP 4: GENERATE TEAM ID
        # ============================================
        cursor.execute('SELECT TeamID FROM teams WHERE gameID = %s', (game_id,))
        teams = cursor.fetchall()
        existingTeams = [team['TeamID'] for team in teams] if teams else []
        newID = idgen(game_abbreviation, existingTeams)

        # ============================================
        # STEP 5: CREATE TEAM WITH SEASON ASSIGNMENT
        # ============================================
        cursor.execute("""
            INSERT INTO teams (TeamID, teamName, teamMaxSize, gameID, season_id) 
            VALUES (%s, %s, %s, %s, %s)
        """, (newID, team_title, true_size, game_id, season_id))

        # ============================================
        # STEP 6: ASSIGN LEAGUES TO TEAM
        # ============================================
        if league_ids:
            for league_id in league_ids:
                cursor.execute("""
                    INSERT INTO team_leagues (team_id, league_id)
                    VALUES (%s, %s)
                """, (newID, league_id))

        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': f'Team "{team_title}" created successfully and assigned to {season_name}!',
            'team_id': newID,
            'season_id': season_id,
            'season_name': season_name,
            'leagues_assigned': len(league_ids)
        })

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error creating team: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()


"""
Route to get all available leagues for team assignment
"""
@app.route('/api/leagues/all', methods=['GET'])
@login_required
def get_all_leagues_for_teams():
    """Get all leagues for team assignment dropdown"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute('''
            SELECT id, name, website_url,
                   CASE WHEN logo IS NOT NULL THEN 1 ELSE 0 END as has_logo
            FROM league
            ORDER BY name ASC
        ''')

        leagues = cursor.fetchall()

        # Add logo URL for frontend
        for league in leagues:
            league['logo'] = f'/league-image/{league["id"]}' if league['has_logo'] else None
            del league['has_logo']

        return jsonify({'success': True, 'leagues': leagues}), 200

    except Exception as e:
        print(f"Error fetching leagues for teams: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch leagues'}), 500

    finally:
        cursor.close()


"""
Route to get leagues assigned to a specific team
"""
@app.route('/api/teams/<team_id>/leagues', methods=['GET'])
@login_required
def get_team_leagues(team_id):
    """Get all leagues assigned to a team"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute('''
            SELECT l.id, l.name, l.website_url,
                   CASE WHEN l.logo IS NOT NULL THEN 1 ELSE 0 END as has_logo,
                   tl.assigned_at
            FROM team_leagues tl
            JOIN league l ON tl.league_id = l.id
            WHERE tl.team_id = %s
            ORDER BY l.name ASC
        ''', (team_id,))

        leagues = cursor.fetchall()

        # Add logo URL
        for league in leagues:
            league['logo'] = f'/league-image/{league["id"]}' if league['has_logo'] else None
            del league['has_logo']

        return jsonify({'success': True, 'leagues': leagues}), 200

    except Exception as e:
        print(f"Error fetching team leagues: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch team leagues'}), 500

    finally:
        cursor.close()


"""
Route to assign leagues to a team (for create/edit)
"""


@app.route('/api/teams/<team_id>/leagues', methods=['POST'])
@login_required
@roles_required('admin', 'gm', 'developer')
def assign_team_leagues(team_id):
    """Assign leagues to a team - replaces existing assignments"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        data = request.get_json()
        league_ids = data.get('league_ids', [])

        # Verify team exists
        cursor.execute('SELECT TeamID FROM teams WHERE TeamID = %s', (team_id,))
        if not cursor.fetchone():
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        # Delete existing league assignments
        cursor.execute('DELETE FROM team_leagues WHERE team_id = %s', (team_id,))

        # Insert new league assignments
        if league_ids:
            for league_id in league_ids:
                cursor.execute('''
                    INSERT INTO team_leagues (team_id, league_id)
                    VALUES (%s, %s)
                ''', (team_id, league_id))

        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': f'Successfully assigned {len(league_ids)} league(s) to team'
        }), 200

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error assigning team leagues: {e}")
        return jsonify({'success': False, 'message': 'Failed to assign leagues'}), 500

    finally:
        cursor.close()

"""
Method to view all teams for all games.
"""
@app.route('/teams')
@login_required
def view_teams():
    """View all available games"""
    if 'loggedin' not in session:
        flash('Please log in to view games', 'error')
        return redirect(url_for('login'))

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute("""
                       SELECT t.TeamID, t.teamName, t.teamMaxSize, t.gameID, g.GameTitle
                       FROM teams t
                       LEFT JOIN games g ON t.gameID = g.GameID
                       ORDER BY t.TeamID ASC
                       """)
        teams = cursor.fetchall()

        teams_with_details = []
        for team in teams:
            team_dict = dict(team)

            try:
                cursor.execute(f"SELECT 1 FROM team_members WHERE user_id = %s AND team_id = %s LIMIT 1",
                               (session['id'], team['TeamID']))
                team_dict['is_member'] = cursor.fetchone() is not None
            except:
                team_dict['is_member'] = False

            try:
                cursor.execute("SELECT COUNT(*) as member_count FROM team_members WHERE team_id = %s",
                               (team['TeamID'],))
                count_result = cursor.fetchone()
                team_dict['member_count'] = count_result['member_count'] if count_result else 0
            except:
                team_dict['member_count'] = 0


            teams_with_details.append(team_dict)

        return jsonify({'success': True, 'teams': teams_with_details})

    except Exception as e:
        print(f"Error fetching teams: {str(e)}")
        return jsonify({'success': True, 'teams': []})

    finally:
        cursor.close()

# DEVELOPED FULLY BY CLAUDE.AI
"""
Method to gather all users who are in a game's community and not currently part of the team.
@param - team_id is the team in which the list is being gathered for.
"""
@app.route('/api/teams/<team_id>/available-members')
@login_required
@roles_required('admin', 'gm', 'developer')
def get_available_team_members(team_id):
    """Get list of users who are in the game's community but NOT already in this team"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # First, get the game ID for this team
        cursor.execute("""
            SELECT gameID FROM teams WHERE TeamID = %s
        """, (team_id,))

        team_info = cursor.fetchone()
        if not team_info:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        game_id = team_info['gameID']

        # Get all users who are:
        # 1. Members of this game's community (in in_communities table)
        # 2. NOT already in this specific team
        cursor.execute("""
            SELECT u.id,
                   u.firstname,
                   u.lastname,
                   u.username,
                   u.profile_picture,
                   p.is_admin,
                   p.is_gm,
                   p.is_player,
                   p.is_developer
            FROM users u
            LEFT JOIN permissions p ON u.id = p.userid
            INNER JOIN in_communities ic ON u.id = ic.user_id
            WHERE ic.game_id = %s
              AND u.id NOT IN (
                  SELECT user_id 
                  FROM team_members 
                  WHERE team_id = %s
              )
            ORDER BY u.firstname, u.lastname
        """, (game_id, team_id))

        users = cursor.fetchall()

        # Format the response
        formatted_members = []
        for user in users:
            roles = []
            if user['is_admin'] == 1:
                roles.append('Admin')
            if user['is_developer'] == 1:
                roles.append('Developer')
            if user['is_gm'] == 1:
                roles.append('Game Manager')
            if user['is_player'] == 1:
                roles.append('Player')

            if not roles:
                roles.append('Member')

            profile_pic = None
            if user['profile_picture']:
                profile_pic = f"/static/uploads/avatars/{user['profile_picture']}"

            formatted_members.append({
                'id': user['id'],
                'name': f"{user['firstname']} {user['lastname']}",
                'username': user['username'],
                'profile_picture': profile_pic,
                'roles': roles
            })

        return jsonify({
            'success': True,
            'members': formatted_members
        })

    except Exception as e:
        print(f"Error fetching available members: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load available members'}), 500

    finally:
        cursor.close()

# DEVELOPED FULLY BY CLAUDE.AI
"""
Method to add a player to a team.
@param - team_id is the team in which a player is being added.
"""
@app.route('/api/teams/<team_id>/add-members', methods=['POST'])
@login_required
@roles_required('admin', 'gm', 'developer')
def add_members_to_team(team_id):
    """Add multiple members to a team"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        data = request.get_json()
        member_ids = data.get('member_ids', [])

        if not member_ids:
            return jsonify({'success': False, 'message': 'No members selected'}), 400

        # Check team max size
        cursor.execute('SELECT teamMaxSize FROM teams WHERE TeamID = %s', (team_id,))
        team = cursor.fetchone()

        if not team:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        max_size = team['teamMaxSize']

        # Check current team size
        cursor.execute('SELECT COUNT(*) as current_size FROM team_members WHERE team_id = %s', (team_id,))
        current_size = cursor.fetchone()['current_size']

        # Check if adding these members would exceed max size
        if current_size + len(member_ids) > max_size:
            return jsonify({
                'success': False,
                'message': f'Cannot add {len(member_ids)} members. Team has {current_size}/{max_size} members.'
            }), 400

        # Add members to team
        added_count = 0
        for member_id in member_ids:
            try:
                # Check if already a member
                cursor.execute('SELECT 1 FROM team_members WHERE team_id = %s AND user_id = %s',
                               (team_id, member_id))
                if cursor.fetchone():
                    continue  # Skip if already a member

                cursor.execute(
                    'INSERT INTO team_members (team_id, user_id, joined_at) VALUES (%s, %s, %s)',
                    (team_id, member_id, get_current_time())
                )
                added_count += 1

                cursor.execute('SELECT is_player FROM permissions WHERE userid = %s', (member_id,))
                playercheck = cursor.fetchone()
                plBoolean = playercheck['is_player']
                if plBoolean:
                    continue

                if not plBoolean:
                    cursor.execute('UPDATE permissions SET is_player = 1 WHERE userid = %s', (member_id,))

            except Exception as e:
                print(f"Error adding member {member_id}: {str(e)}")
                continue

        mysql.connection.commit()

        if added_count == 0:
            return jsonify({'success': False, 'message': 'No new members were added'}), 400

        return jsonify({
            'success': True,
            'message': f'Successfully added {added_count} member(s) to the team!'
        })

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error adding members to team: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()


# DEVELOPED FULLY BY CLAUDE.AI
"""
Method to remove a player from a team.
@param - team_id is the team in which a player is being removed.
"""
@app.route('/api/teams/<team_id>/remove-member', methods=['POST'])
@login_required
@roles_required('admin', 'gm', 'developer')
def remove_member_from_team(team_id):
    """Remove a member from a team"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        data = request.get_json()
        member_id = data.get('member_id')

        if not member_id:
            return jsonify({'success': False, 'message': 'No member specified'}), 400

        # Check if member exists in team
        cursor.execute(
            'SELECT 1 FROM team_members WHERE team_id = %s AND user_id = %s',
            (team_id, member_id)
        )

        if not cursor.fetchone():
            return jsonify({'success': False, 'message': 'Member not found in team'}), 404

        # Remove member from team
        cursor.execute(
            'DELETE FROM team_members WHERE team_id = %s AND user_id = %s',
            (team_id, member_id)
        )

        cursor.execute('SELECT COUNT(*) as count FROM team_members WHERE user_id = %s', (member_id,))
        result = cursor.fetchone()
        if result['count'] == 0:
            cursor.execute('UPDATE permissions SET is_player = 0 WHERE userid = %s', (member_id,))
            mysql.connection.commit()



        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': 'Member removed successfully'
        })

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error removing member from team: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()


"""
Route to update team information
@param - team_id is the team being updated
"""
@app.route('/api/teams/<team_id>/update', methods=['POST'])
@login_required
def update_team(team_id):
    """Update team name and max size - Only GM of the game can edit"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        data = request.get_json()
        team_title = data.get('team_title', '').strip()
        team_max_size = data.get('team_max_size')

        if not team_title:
            return jsonify({'success': False, 'message': 'Team title is required'}), 400

        if not team_max_size:
            return jsonify({'success': False, 'message': 'Team size is required'}), 400

        # Check if team exists and get the GM
        cursor.execute('''
            SELECT t.teamName, t.gameID, g.gm_id, g.GameTitle
            FROM teams t
            LEFT JOIN games g ON t.gameID = g.GameID
            WHERE t.TeamID = %s
        ''', (team_id,))

        team = cursor.fetchone()

        if not team:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        # STRICT PERMISSION CHECK: Only the GM of this game can edit
        if team['gm_id'] != session['id']:
            return jsonify({
                'success': False,
                'message': 'Only the Game Manager of this game can edit this team'
            }), 403

        # Check if new name conflicts with existing team (excluding current team)
        cursor.execute('''
            SELECT COUNT(*) AS count 
            FROM teams 
            WHERE gameID = %s 
            AND LOWER(teamName) = LOWER(%s) 
            AND TeamID != %s
            AND season_id = (SELECT season_id FROM teams WHERE TeamID = %s)
        ''', (team['gameID'], team_title, team_id, team_id))

        name_check = cursor.fetchone()
        if name_check['count'] > 0:
            return jsonify({
                'success': False,
                'message': 'A team with this name already exists in this season for this game'
            }), 400

        # Update the team
        cursor.execute('''
            UPDATE teams 
            SET teamName = %s, teamMaxSize = %s 
            WHERE TeamID = %s
        ''', (team_title, team_max_size, team_id))

        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': f'Team "{team_title}" updated successfully!'
        })

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error updating team: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()

"""
Method to filter teams based on user role AND selected view
- Supports view switching for multi-role users
- Admin/Developer: can view all teams, teams they manage, or teams they play for
- GM: can view teams they manage or teams they play for
- Player: can only view teams they play for
"""
@app.route('/api/teams/sidebar')
@login_required
def get_teams_sidebar():
    """Get teams for sidebar - filtered by role, view preference, and season"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Get user permissions
        permissions = get_user_permissions(session['id'])
        is_admin = permissions['is_admin']
        is_gm = permissions['is_gm']
        is_player = permissions['is_player']
        is_developer = permissions['is_developer']

        # Get the view preference and season filter from query parameters
        view_mode = request.args.get('view', None)
        season_id = request.args.get('season_id', None)

        # Get current active season
        cursor.execute("SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1")
        active_season = cursor.fetchone()
        active_season_id = active_season['season_id'] if active_season else None

        # Base query parts
        base_select = """
            SELECT t.TeamID, t.teamName, t.teamMaxSize, t.gameID, t.created_at, t.season_id,
                   g.GameTitle, g.gm_id, g.Division,
                   s.season_name, s.is_active as season_is_active,
                   CASE WHEN g.GameImage IS NOT NULL THEN 1 ELSE 0 END as has_game_image,
                   (SELECT COUNT(*) FROM team_members WHERE team_id = t.TeamID) as member_count
            FROM teams t
            LEFT JOIN games g ON t.gameID = g.GameID
            LEFT JOIN seasons s ON t.season_id = s.season_id
        """

        # Determine which query to run based on view_mode
        if view_mode == 'all' and (is_admin or is_developer):
            # Admin/Developer viewing ALL teams - CURRENT SEASON ONLY (unless filtering past season)
            if season_id:
                # Filtering specific past season
                cursor.execute(base_select + "WHERE t.season_id = %s", (season_id,))
            else:
                # Current season only
                if active_season_id:
                    cursor.execute(base_select + "WHERE t.season_id = %s", (active_season_id,))
                else:
                    cursor.execute(base_select)

        elif view_mode == 'manage' and (is_admin or is_gm or is_developer):
            # Teams they manage - CURRENT SEASON ONLY
            if active_season_id:
                cursor.execute(base_select + """
                    WHERE g.gm_id = %s AND t.season_id = %s
                """, (session['id'], active_season_id))
            else:
                cursor.execute(base_select + """
                    WHERE g.gm_id = %s
                """, (session['id'],))

        elif view_mode == 'past_managed' and (is_admin or is_gm or is_developer):
            # Past teams they managed - EXCLUDE CURRENT SEASON
            if active_season_id:
                cursor.execute(base_select + """
                    WHERE g.gm_id = %s AND (t.season_id IS NULL OR t.season_id != %s)
                """, (session['id'], active_season_id))
            else:
                cursor.execute(base_select + """
                    WHERE g.gm_id = %s AND t.season_id IS NOT NULL
                """, (session['id'],))

        elif view_mode == 'play' and is_player:
            # Teams they play for - CURRENT SEASON ONLY
            if active_season_id:
                cursor.execute(base_select + """
                    INNER JOIN team_members tm ON t.TeamID = tm.team_id
                    WHERE tm.user_id = %s AND t.season_id = %s
                """, (session['id'], active_season_id))
            else:
                cursor.execute(base_select + """
                    INNER JOIN team_members tm ON t.TeamID = tm.team_id
                    WHERE tm.user_id = %s
                """, (session['id'],))

        elif view_mode == 'my_past_teams' and is_player:
            # Past teams they played on - EXCLUDE CURRENT SEASON
            if active_season_id:
                cursor.execute(base_select + """
                    INNER JOIN team_members tm ON t.TeamID = tm.team_id
                    WHERE tm.user_id = %s AND (t.season_id IS NULL OR t.season_id != %s)
                """, (session['id'], active_season_id))
            else:
                cursor.execute(base_select + """
                    INNER JOIN team_members tm ON t.TeamID = tm.team_id
                    WHERE tm.user_id = %s AND t.season_id IS NOT NULL
                """, (session['id'],))

        elif view_mode == 'past_seasons' and (is_admin or is_developer):
            # Filter by specific past season
            if season_id:
                cursor.execute(base_select + "WHERE t.season_id = %s", (season_id,))
            else:
                # No season selected yet, return empty
                return jsonify({'success': True, 'teams': []})

        else:
            # Default behavior based on highest priority role - CURRENT SEASON ONLY
            if is_admin or is_developer:
                if active_season_id:
                    cursor.execute(base_select + "WHERE t.season_id = %s", (active_season_id,))
                else:
                    cursor.execute(base_select)
            elif is_gm:
                if active_season_id:
                    cursor.execute(base_select + """
                        WHERE g.gm_id = %s AND t.season_id = %s
                    """, (session['id'], active_season_id))
                else:
                    cursor.execute(base_select + """
                        WHERE g.gm_id = %s
                    """, (session['id'],))
            elif is_player:
                if active_season_id:
                    cursor.execute(base_select + """
                        INNER JOIN team_members tm ON t.TeamID = tm.team_id
                        WHERE tm.user_id = %s AND t.season_id = %s
                    """, (session['id'], active_season_id))
                else:
                    cursor.execute(base_select + """
                        INNER JOIN team_members tm ON t.TeamID = tm.team_id
                        WHERE tm.user_id = %s
                    """, (session['id'],))
            else:
                return jsonify({'success': True, 'teams': []})

        teams = cursor.fetchall()

        # Format teams
        teams_list = []
        for team in teams:
            teams_list.append({
                'TeamID': team['TeamID'],
                'teamName': team['teamName'],
                'teamMaxSize': team['teamMaxSize'],
                'gameID': team['gameID'],
                'GameTitle': team['GameTitle'],
                'member_count': team['member_count'],
                'gm_id': team['gm_id'],
                'has_game_image': team.get('has_game_image', 0),
                'division': team.get('Division', 'Other'),
                'created_at': team['created_at'].isoformat() if team.get('created_at') else None,
                'season_id': team.get('season_id'),
                'season_name': team.get('season_name'),
                'season_is_active': team.get('season_is_active', 0)
            })

        return jsonify({'success': True, 'teams': teams_list})

    except Exception as e:
        print(f"Error fetching teams sidebar: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()


"""
Method to get available view options for the current user
"""
@app.route('/api/teams/available-views')
@login_required
def get_available_team_views():
    """Get list of available view options based on user's roles"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Get user permissions
        permissions = get_user_permissions(session['id'])
        is_admin = permissions['is_admin']
        is_developer = permissions['is_developer']
        is_gm = permissions['is_gm']
        is_player = permissions['is_player']

        views = []

        # Admin can see all teams
        if is_admin or is_developer:
            views.append({
                'value': 'all',
                'label': 'All Teams',
                'priority': 1
            })

        # Admin or GM can see teams they manage
        if is_admin or is_developer or is_gm:
            # Check if they actually manage any games
            cursor.execute("""
                SELECT COUNT(*) as count 
                FROM games 
                WHERE gm_id = %s
            """, (session['id'],))
            result = cursor.fetchone()

            if result and result['count'] > 0:
                views.append({
                    'value': 'manage',
                    'label': 'Managed Teams',
                    'priority': 2
                })

                # Add "Past Teams I Managed" option for GMs
                views.append({
                    'value': 'past_managed',
                    'label': 'Old Managed Teams',
                    'priority': 3
                })

        # Anyone who is a player can see teams they play for
        if is_player:
            # Check if they're actually in any teams
            cursor.execute("""
                SELECT COUNT(*) as count 
                FROM team_members 
                WHERE user_id = %s
            """, (session['id'],))
            result = cursor.fetchone()

            if result and result['count'] > 0:
                views.append({
                    'value': 'play',
                    'label': 'My Teams',
                    'priority': 4
                })

                # Add "My Past Teams" option for players
                views.append({
                    'value': 'my_past_teams',
                    'label': 'My Old Teams',
                    'priority': 5
                })

        # Sort by priority
        views.sort(key=lambda x: x['priority'])

        return jsonify({
            'success': True,
            'views': views,
            'has_multiple': len(views) > 1
        })

    except Exception as e:
        print(f"Error fetching available views: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()

"""
Method to retrieve details for a specific team to be displayed to the user.
@param - team_id is the team whose details are being retrieved.
"""
@app.route('/api/teams/<team_id>/details')
@login_required
def team_details(team_id):
    """Get detailed information about a team including members"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("""
                SELECT t.TeamID, t.teamName, t.teamMaxSize, t.gameID, t.season_id,
                       s.season_name, s.start_date, s.end_date, s.is_active
                FROM teams t
                LEFT JOIN seasons s ON t.season_id = s.season_id
                WHERE t.TeamID = %s
            """, (team_id,))
            team = cursor.fetchone()

            if not team:
                return jsonify({'success': False, 'message': 'Team not found'}), 404

            team_name = team['teamName']
            team_max = team['teamMaxSize']
            game_id = team['gameID']
            season_id = team['season_id']
            season_name = team['season_name']
            season_is_active = team['is_active']

            # Checking if a user can manage given team
            user_id = session.get('id')
            cursor.execute('''
                SELECT p.is_admin, p.is_developer, g.gm_id
                FROM permissions p
                LEFT JOIN games g on g.GameID = %s
                WHERE p.userid = %s
                ''', (game_id, user_id))

            perm_check = cursor.fetchone()
            can_manage = False
            if perm_check:
                is_admin = perm_check['is_admin']
                is_developer = perm_check['is_developer']
                is_game_gm = (perm_check['gm_id'] == user_id)
                can_manage = (is_admin or is_developer or is_game_gm)

            try:
                cursor.execute(f"SELECT 1 FROM team_members WHERE user_id = %s AND team_id = %s",
                               (session['id'], team_id))
                is_member = cursor.fetchone() is not None
            except:
                is_member = False

            try:
                cursor.execute(f"SELECT COUNT(*) as count FROM team_members WHERE team_id = %s", (team_id,))
                member_count = cursor.fetchone()['count']
            except:
                member_count = 0

            formatted_members = []
            try:
                cursor.execute("""
                               SELECT u.id, u.firstname, u.lastname, u.username,
                                      u.profile_picture, p.is_admin, p.is_developer, p.is_gm,
                                      p.is_player, tm.joined_at
                               FROM team_members tm
                               JOIN teams t ON tm.team_id = t.teamID
                               JOIN users u ON tm.user_id = u.id
                               LEFT JOIN permissions p ON u.id = p.userid
                               WHERE tm.team_id = %s
                               """, (team_id,))
                members = cursor.fetchall()

                for m in members:
                    roles = []
                    if m['is_admin'] == 1:
                        roles.append('Admin')
                    if m['is_developer'] == 1:
                        roles.append('Developer')
                    if m['is_gm'] == 1:
                        roles.append('Game Manager')
                    if m['is_player'] == 1:
                        roles.append('Player')

                    if not roles:
                        roles.append('Member')

                    profile_pic = None
                    if m['profile_picture']:
                        profile_pic = f"/static/uploads/avatars/{m['profile_picture']}"

                    formatted_members.append({
                        'id': m['id'],
                        'name': f"{m['firstname']} {m['lastname']}",
                        'username': m['username'],
                        'profile_picture': profile_pic,
                        'roles': roles,
                        'joined_at': m['joined_at'].strftime('%B %d, %Y') if m['joined_at'] else None
                    })

            except Exception as e:
                print(f"Error fetching members: {e}")
                import traceback
                traceback.print_exc()

            # Get game info including icon
            cursor.execute('SELECT GameTitle, GameImage, Division FROM games WHERE GameID = %s', (game_id,))
            game_info = cursor.fetchone()
            game_title = game_info['GameTitle'] if game_info else 'Unknown Game'
            game_division = game_info['Division'] if game_info else None

            # Generate game icon URL
            game_icon_url = None
            if game_info and game_info['GameImage']:
                game_icon_url = f'/game-image/{game_id}'

            return jsonify({'success': True,
                            'team': {
                                'id': team['TeamID'],
                                'title': team_name,
                                'team_max_size': team_max,
                                'member_count': member_count,
                                'members': formatted_members,
                                'is_member': is_member,
                                'game_id': game_id,
                                'game_title': game_title,
                                'game_icon_url': game_icon_url,
                                'division': game_division,
                                'can_manage': can_manage,
                                'season_id': season_id,
                                'season_name': season_name,
                                'season_is_active': season_is_active
                            }}), 200
        finally:
            cursor.close()

    except Exception as e:
        print(f"Error getting game details: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load game details'}), 500

"""
Method to get the details of the next scheduled event for a game.
"""
@app.route('/api/teams/<team_id>/next-scheduled-event')
@login_required
def get_next_scheduled_event(team_id):
    """Get the next upcoming scheduled event for the team's game"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Get the team's game
        cursor.execute("""
            SELECT gameID FROM teams WHERE TeamID = %s
        """, (team_id,))

        team = cursor.fetchone()

        if not team:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        game_id = team['gameID']

        # Get current date and time for proper filtering
        from datetime import datetime
        now = get_current_time()
        current_date = now.date()
        current_time = now.time()

        # Get the next scheduled event for this team
        # Logic:
        # 1. If visibility = 'team', ONLY show if team_id matches
        # 2. If visibility = 'game_players', 'game_community', or 'all_members', show for ALL teams in that game
        cursor.execute("""
            SELECT 
                ge.EventID, ge.EventName, ge.Date, ge.StartTime, ge.EndTime,
                ge.EventType, ge.schedule_id, se.visibility, se.team_id as schedule_team_id
            FROM generalevents ge
            INNER JOIN scheduled_events se ON ge.schedule_id = se.schedule_id
            WHERE ge.is_scheduled = TRUE
            AND se.game_id = %s
            AND (
                ge.Date > %s
                OR (ge.Date = %s AND ge.StartTime > %s)
            )
            AND (
                -- Team-specific events: only show if it's THIS team
                (se.visibility = 'team' AND se.team_id = %s)
                -- Broad visibility: show for ALL teams in this game
                OR se.visibility IN ('game_players', 'game_community', 'all_members')
            )
            ORDER BY ge.Date ASC, ge.StartTime ASC
            LIMIT 1
        """, (game_id, current_date, current_date, current_time, team_id))

        event = cursor.fetchone()
        cursor.close()

        if not event:
            return jsonify({'success': True, 'event': None}), 200

        # Format the event data
        from datetime import timedelta

        def format_time(time_value):
            if not time_value:
                return None
            if isinstance(time_value, timedelta):
                total_seconds = int(time_value.total_seconds())
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
            else:
                hours = time_value.hour
                minutes = time_value.minute

            period = "AM" if hours < 12 else "PM"
            display_hour = hours % 12
            if display_hour == 0:
                display_hour = 12
            return f"{display_hour}:{minutes:02d} {period}"

        start_time_str = format_time(event['StartTime'])
        end_time_str = format_time(event['EndTime'])

        # Check if all-day event
        is_all_day = False
        if start_time_str and end_time_str:
            is_all_day = (start_time_str == "12:00 AM" and end_time_str == "11:59 PM")

        event_data = {
            'id': event['EventID'],
            'name': event['EventName'],
            'date': event['Date'].strftime('%B %d, %Y'),
            'start_time': start_time_str,
            'end_time': end_time_str,
            'event_type': event['EventType'] or 'Event',
            'is_all_day': is_all_day
        }

        return jsonify({'success': True, 'event': event_data}), 200

    except Exception as e:
        print(f"Error fetching next scheduled event: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': 'Failed to fetch event'}), 500

"""
Method to get the next scheduled event for a game community
"""
@app.route('/api/games/<int:game_id>/next-scheduled-event')
@login_required
def get_game_next_scheduled_event(game_id):
    """Get the next upcoming scheduled event for a game community"""
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Get current date and time for proper filtering
        from datetime import datetime
        now = get_current_time()
        current_date = now.date()
        current_time = now.time()

        # Get the next scheduled event for this game
        # Only show events visible to game_community or all_members
        cursor.execute("""
            SELECT 
                ge.EventID, ge.EventName, ge.Date, ge.StartTime, ge.EndTime,
                ge.EventType, ge.schedule_id, se.visibility
            FROM generalevents ge
            INNER JOIN scheduled_events se ON ge.schedule_id = se.schedule_id
            WHERE ge.is_scheduled = TRUE
            AND se.game_id = %s
            AND (
                ge.Date > %s
                OR (ge.Date = %s AND ge.StartTime > %s)
            )
            AND se.visibility IN ('game_community', 'all_members')
            ORDER BY ge.Date ASC, ge.StartTime ASC
            LIMIT 1
        """, (game_id, current_date, current_date, current_time))

        event = cursor.fetchone()
        cursor.close()

        if not event:
            return jsonify({'success': True, 'event': None}), 200

        # Format the event data
        from datetime import timedelta

        def format_time(time_value):
            if not time_value:
                return None
            if isinstance(time_value, timedelta):
                total_seconds = int(time_value.total_seconds())
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
            else:
                hours = time_value.hour
                minutes = time_value.minute

            period = "AM" if hours < 12 else "PM"
            display_hour = hours % 12
            if display_hour == 0:
                display_hour = 12
            return f"{display_hour}:{minutes:02d} {period}"

        start_time_str = format_time(event['StartTime'])
        end_time_str = format_time(event['EndTime'])

        # Check if all-day event
        is_all_day = False
        if start_time_str and end_time_str:
            is_all_day = (start_time_str == "12:00 AM" and end_time_str == "11:59 PM")

        event_data = {
            'id': event['EventID'],
            'name': event['EventName'],
            'date': event['Date'].strftime('%B %d, %Y'),
            'start_time': start_time_str,
            'end_time': end_time_str,
            'event_type': event['EventType'] or 'Event',
            'is_all_day': is_all_day
        }

        return jsonify({'success': True, 'event': event_data}), 200

    except Exception as e:
        print(f"Error fetching game next scheduled event: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': 'Failed to fetch event'}), 500

"""
Method to delete a shell team for a game.
"""
@app.route('/delete-team', methods=['POST'])
@login_required
def delete_team():
    """Delete a team with time-based permission checks"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        data = request.get_json()
        team_id = data.get('team_id')

        if not team_id:
            return jsonify({'success': False, 'message': 'No team specified'}), 400

        # Get team details including creation date and game GM
        cursor.execute('''
            SELECT t.teamName, t.created_at, t.gameID, g.gm_id
            FROM teams t
            LEFT JOIN games g ON t.gameID = g.GameID
            WHERE t.TeamID = %s
        ''', (team_id,))
        team = cursor.fetchone()

        if not team:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        # Get user permissions
        permissions = get_user_permissions(session['id'])
        user_id = session['id']

        # Check if user is developer (always allowed)
        is_developer = permissions['is_developer']

        # Check if user is admin
        is_admin = permissions['is_admin']

        # Check if user is the GM of this game
        is_game_gm = (team['gm_id'] == user_id)

        # Calculate days since creation
        from datetime import datetime, timezone
        created_at = team['created_at']

        # Ensure created_at is timezone-aware
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        days_since_creation = (now - created_at).days
        within_30_days = days_since_creation <= 30

        # Permission logic:
        # - Developers: always allowed
        # - Admin or GM: allowed within 30 days
        # - Others: never allowed
        can_delete = False
        denial_reason = None

        if is_developer:
            can_delete = True
        elif (is_admin or is_game_gm) and within_30_days:
            can_delete = True
        elif (is_admin or is_game_gm) and not within_30_days:
            denial_reason = f"Team was created {days_since_creation} days ago. Only developers can delete teams older than 30 days."
        else:
            denial_reason = "You don't have permission to delete this team."

        if not can_delete:
            return jsonify({
                'success': False,
                'message': denial_reason
            }), 403

        # Get all members before deleting
        cursor.execute('SELECT user_id FROM team_members WHERE team_id = %s', (team_id,))
        members = cursor.fetchall()
        member_ids = [member['user_id'] for member in members]

        # ============================================
        # DELETE TEAM-SPECIFIC SCHEDULED EVENTS
        # ============================================
        cursor.execute("""
            SELECT schedule_id 
            FROM scheduled_events 
            WHERE team_id = %s AND visibility = 'team'
        """, (team_id,))

        team_schedules = cursor.fetchall()

        for schedule in team_schedules:
            cursor.execute("""
                DELETE FROM generalevents 
                WHERE schedule_id = %s
            """, (schedule['schedule_id'],))

        cursor.execute("""
            DELETE FROM scheduled_events 
            WHERE team_id = %s AND visibility = 'team'
        """, (team_id,))

        # ============================================
        # DELETE TEAM DATA
        # ============================================
        # Delete team leagues
        cursor.execute('DELETE FROM team_leagues WHERE team_id = %s', (team_id,))

        # Delete team members
        cursor.execute('DELETE FROM team_members WHERE team_id = %s', (team_id,))

        # Delete the team
        cursor.execute('DELETE FROM teams WHERE TeamID = %s', (team_id,))

        # Update player status for members no longer in any teams
        for member_id in member_ids:
            cursor.execute('SELECT COUNT(*) as count FROM team_members WHERE user_id = %s', (member_id,))
            result = cursor.fetchone()
            if result['count'] == 0:
                cursor.execute('UPDATE permissions SET is_player = 0 WHERE userid = %s', (member_id,))

        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': f'Team "{team["teamName"]}" deleted successfully'
        })

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error deleting team: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()


@app.route('/api/teams/<team_id>/deletion-info', methods=['GET'])
@login_required
def get_team_deletion_info(team_id):
    """Get information about team deletion permissions and time window"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        # Get team details
        cursor.execute('''
            SELECT t.teamName, t.created_at, t.gameID, g.gm_id
            FROM teams t
            LEFT JOIN games g ON t.gameID = g.GameID
            WHERE t.TeamID = %s
        ''', (team_id,))

        team = cursor.fetchone()

        if not team:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        # Get user permissions
        permissions = get_user_permissions(session['id'])
        user_id = session['id']

        is_developer = permissions['is_developer']
        is_admin = permissions['is_admin']
        is_game_gm = (team['gm_id'] == user_id)

        # Calculate time information
        from datetime import datetime, timezone, timedelta
        created_at = team['created_at']

        # Ensure timezone-aware
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        days_since_creation = (now - created_at).days
        within_30_days = days_since_creation <= 30

        # Calculate time remaining
        deletion_deadline = created_at + timedelta(days=30)
        time_remaining = deletion_deadline - now
        days_remaining = time_remaining.days
        hours_remaining = time_remaining.seconds // 3600

        # Determine permissions
        can_delete = False
        restriction_level = None

        if is_developer:
            can_delete = True
            restriction_level = 'developer'
        elif (is_admin or is_game_gm) and within_30_days:
            can_delete = True
            restriction_level = 'time_limited'
        elif (is_admin or is_game_gm):
            can_delete = False
            restriction_level = 'expired'
        else:
            can_delete = False
            restriction_level = 'no_permission'

        return jsonify({
            'success': True,
            'can_delete': can_delete,
            'restriction_level': restriction_level,
            'team_name': team['teamName'],
            'created_at': created_at.isoformat(),
            'days_since_creation': days_since_creation,
            'within_30_days': within_30_days,
            'days_remaining': days_remaining if within_30_days else 0,
            'hours_remaining': hours_remaining if within_30_days else 0,
            'deletion_deadline': deletion_deadline.isoformat(),
            'is_developer': is_developer,
            'is_admin': is_admin,
            'is_game_gm': is_game_gm
        })

    except Exception as e:
        print(f"Error getting deletion info: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()