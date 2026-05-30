from EsportsManagementTool import (app, mysql, EST, login_required, roles_required,
                                    localize_datetime, season_roles)
from EsportsManagementTool.universal_helpers import get_user_permissions, get_team_game_id, format_time_to_12hr, is_all_day_event
from flask import Flask, render_template, request, session, jsonify
from datetime import datetime, timedelta
import MySQLdb.cursors


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

@app.route('/api/create-team/<int:game_id>', methods=['POST'])
@roles_required('admin', 'gm', 'developer')
def create_team(game_id):
    """
    Allow an admin, developer, or GM of the game to create a team via the Communities tab.
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        # STEP 1: Check for active season
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

        # STEP 2: Validate game exists and user has permission
        cursor.execute('SELECT GameTitle, Abbreviation FROM games WHERE GameID = %s AND gm_id = %s', (game_id, session['id']))
        games = cursor.fetchone()

        if not games:
            return jsonify({'success': False, 'message': 'Game does not exist or you do not have permission.'}), 400

        game_abbreviation = games['Abbreviation']
        team_title = request.form.get('team_title', '').strip()
        true_size = request.form.get('team_sizes')

        # Get league IDs from form data (JSON string)
        leagues_json = request.form.get('leagues', '[]')
        import json
        league_ids = json.loads(leagues_json) if leagues_json else []

        # STEP 3: Check if team name already exists in the current season.
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

        # STEP 4: Generate TeamID using idgen()
        cursor.execute('SELECT TeamID FROM teams WHERE gameID = %s', (game_id,))
        teams = cursor.fetchall()
        existingTeams = [team['TeamID'] for team in teams] if teams else []
        newID = idgen(game_abbreviation, existingTeams)

        # STEP 5: Create team record
        cursor.execute("""
            INSERT INTO teams (TeamID, teamName, teamMaxSize, gameID, season_id) 
            VALUES (%s, %s, %s, %s, %s)
        """, (newID, team_title, true_size, game_id, season_id))

        # STEP 6: Assign leagues to team
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
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()


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

        # Check if season is active
        season_is_active = is_team_season_active(mysql, team_id)
        if not season_is_active:
            return jsonify({
                'success': False,
                'message': 'Cannot edit teams from past seasons'
            }), 403

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


@app.route('/api/leagues/all', methods=['GET'])
def get_leagues_for_team_creation():
    """Get all leagues for team assignment dropdown"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute('''
            SELECT id, name, logo
            FROM league
            ORDER BY name ASC
        ''')

        leagues = cursor.fetchall()

        return jsonify({'success': True, 'leagues': leagues}), 200

    except Exception as e:
        print(f"Error fetching leagues for teams: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch leagues'}), 500

    finally:
        cursor.close()


@app.route('/api/teams/<team_id>/leagues', methods=['GET'])
def get_team_assigned_leagues(team_id):
    """Get all leagues assigned to a team"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        cursor.execute('''
            SELECT l.id, l.name, l.website_url, l.logo,
                   tl.assigned_at
            FROM team_leagues tl
            JOIN league l ON tl.league_id = l.id
            WHERE tl.team_id = %s
            ORDER BY l.name ASC
        ''', (team_id,))

        leagues = cursor.fetchall()
        
        return jsonify({'success': True, 'leagues': leagues}), 200

    except Exception as e:
        print(f"Error fetching team leagues: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch team leagues'}), 500

    finally:
        cursor.close()


@app.route('/api/teams/<team_id>/leagues', methods=['POST'])
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


@app.route('/api/teams/<team_id>/available-members')
@login_required
@roles_required('admin', 'gm', 'developer')
def get_new_available_teammates(team_id):
    """Get list of users who are in the game's community but NOT already in this team"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        game_id = get_team_game_id(cursor, team_id)
        if game_id is None:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

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


@app.route('/api/teams/<team_id>/add-members', methods=['POST'])
@login_required
@roles_required('admin', 'gm', 'developer')
def add_members_to_team(team_id):
    """Add users to a team"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        data = request.get_json()
        member_ids = data.get('member_ids', [])

        if not member_ids:
            return jsonify({'success': False, 'message': 'No members selected'}), 400

        # Get team info including season
        cursor.execute('''
            SELECT teamMaxSize, season_id, gameID 
            FROM teams 
            WHERE TeamID = %s
        ''', (team_id,))
        team = cursor.fetchone()

        season_is_active = is_team_season_active(mysql, team_id)
        if not season_is_active:
            return jsonify({
                'success': False,
                'message': 'Cannot add players to teams from past seasons'
            }), 403

        if not team:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        max_size = team['teamMaxSize']
        season_id = team['season_id']

        # Check current team size
        cursor.execute('SELECT COUNT(*) as current_size FROM team_members WHERE team_id = %s', (team_id,))
        current_size = cursor.fetchone()['current_size']

        if current_size + len(member_ids) > max_size:
            return jsonify({
                'success': False,
                'message': f'Cannot add {len(member_ids)} members. Team has {current_size}/{max_size} members.'
            }), 400

        added_count = 0
        for member_id in member_ids:
            try:
                # Check if already a member
                cursor.execute('SELECT 1 FROM team_members WHERE team_id = %s AND user_id = %s',
                               (team_id, member_id))
                if cursor.fetchone():
                    continue

                # Add to team_members
                cursor.execute(
                    'INSERT INTO team_members (team_id, user_id, joined_at) VALUES (%s, %s, %s)',
                    (team_id, member_id, datetime.now(EST))
                )
                added_count += 1

                # Update permissions.is_player if needed
                cursor.execute('SELECT is_player FROM permissions WHERE userid = %s', (member_id,))
                playercheck = cursor.fetchone()
                plBoolean = playercheck['is_player'] if playercheck else 0

                if not plBoolean:
                    cursor.execute('UPDATE permissions SET is_player = 1 WHERE userid = %s', (member_id,))

                # POPULATE season_roles FOR THIS USER
                if season_id:
                    # Get user's current permissions
                    cursor.execute('''
                        SELECT is_admin, is_gm, is_player, is_developer 
                        FROM permissions 
                        WHERE userid = %s
                    ''', (member_id,))
                    perms = cursor.fetchone()

                    if perms:
                        # Insert or update their roles for this season
                        cursor.execute('''
                            INSERT INTO season_roles 
                                (userid, season_id, is_admin, is_gm, is_player, is_developer)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON DUPLICATE KEY UPDATE
                                is_admin = VALUES(is_admin),
                                is_gm = VALUES(is_gm),
                                is_player = VALUES(is_player),
                                is_developer = VALUES(is_developer),
                                updated_date = NOW()
                        ''', (
                            member_id,
                            season_id,
                            perms['is_admin'],
                            perms['is_gm'],
                            1,  # Always set is_player to 1 since they're joining a team
                            perms['is_developer']
                        ))

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


@app.route('/api/teams/<team_id>/remove-member', methods=['POST'])
@login_required
@roles_required('admin', 'gm', 'developer')
def remove_member_from_team(team_id):
    """Remove a member from a team"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    # Check if season is active
    season_is_active = is_team_season_active(mysql, team_id)
    if not season_is_active:
        return jsonify({
            'success': False,
            'message': 'Cannot remove players from teams from past seasons'
        }), 403

    try:
        data = request.get_json()
        member_id = data.get('member_id')

        if not member_id:
            return jsonify({'success': False, 'message': 'No member specified'}), 400

        # Check if member exists in team
        cursor.execute(
            'SELECT 1 FROM team_members WHERE team_id = %s AND user_id = %s', (team_id, member_id))

        if not cursor.fetchone():
            return jsonify({'success': False, 'message': 'Member not found in team'}), 404

        # Remove member from team
        cursor.execute(
            'DELETE FROM team_members WHERE team_id = %s AND user_id = %s', (team_id, member_id))

        cursor.execute('SELECT COUNT(*) as count FROM team_members WHERE user_id = %s', (member_id,))
        result = cursor.fetchone()
        if result['count'] == 0:
            cursor.execute(
                'UPDATE permissions SET is_player = 0 WHERE userid = %s', (member_id,))
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


@app.route('/api/teams/sidebar')
@login_required
def get_teams_for_sidebar():
    """
    Retrieve team records for the sidebar - filtered by view preference and season.
    Admin/Developer: all teams and division filters
    GM: teams they manage
    Player: teams they play for.
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        perms = get_permissions_for_sidebar(session['id'])
        is_admin     = perms['is_admin']
        is_developer = perms['is_developer']
        is_gm        = perms['is_gm']
        is_player    = perms['is_player']

        view_mode = request.args.get('view', None)
        season_id = request.args.get('season_id', None)

        cursor.execute("SELECT season_id FROM seasons WHERE is_active = 1 LIMIT 1")
        active_season = cursor.fetchone()
        active_season_id = active_season['season_id'] if active_season else None

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

        if view_mode == 'all' and (is_admin or is_developer):
            if season_id:
                cursor.execute(base_select + "WHERE t.season_id = %s", (season_id,))
            elif active_season_id:
                cursor.execute(base_select + "WHERE t.season_id = %s", (active_season_id,))
            else:
                cursor.execute(base_select)

        elif view_mode == 'manage' and (is_admin or is_gm or is_developer):
            if active_season_id:
                cursor.execute(base_select + "WHERE g.gm_id = %s AND t.season_id = %s",
                               (session['id'], active_season_id))
            else:
                cursor.execute(base_select + "WHERE g.gm_id = %s", (session['id'],))

        elif view_mode == 'past_managed' and (is_admin or is_gm or is_developer):
            if active_season_id:
                cursor.execute(base_select + """
                    WHERE g.gm_id = %s AND (t.season_id IS NULL OR t.season_id != %s)
                """, (session['id'], active_season_id))
            else:
                cursor.execute(base_select + "WHERE g.gm_id = %s AND t.season_id IS NOT NULL",
                               (session['id'],))

        elif view_mode == 'play' and is_player:
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
            if season_id:
                cursor.execute(base_select + "WHERE t.season_id = %s", (season_id,))
            else:
                return jsonify({'success': True, 'teams': []})

        else:
            # Default: highest-priority role, current season only
            if is_admin or is_developer:
                if active_season_id:
                    cursor.execute(base_select + "WHERE t.season_id = %s", (active_season_id,))
                else:
                    cursor.execute(base_select)
            elif is_gm:
                if active_season_id:
                    cursor.execute(base_select + "WHERE g.gm_id = %s AND t.season_id = %s",
                                   (session['id'], active_season_id))
                else:
                    cursor.execute(base_select + "WHERE g.gm_id = %s", (session['id'],))
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

        teams_list = [{
            'TeamID':          team['TeamID'],
            'teamName':        team['teamName'],
            'teamMaxSize':     team['teamMaxSize'],
            'gameID':          team['gameID'],
            'GameTitle':       team['GameTitle'],
            'member_count':    team['member_count'],
            'gm_id':           team['gm_id'],
            'has_game_image':  team.get('has_game_image', 0),
            'division':        team.get('Division', 'Other'),
            'season_id':       team.get('season_id'),
            'season_name':     team.get('season_name'),
            'season_is_active': team.get('season_is_active', 0)
        } for team in teams]

        return jsonify({'success': True, 'teams': teams_list})

    except Exception as e:
        print(f"Error fetching teams sidebar: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        cursor.close()


@app.route('/api/teams/sidebar-filters')
@login_required
def get_team_sidebar_filters():
    """Get list of available view options based on user's roles"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        perms = get_permissions_for_sidebar(session['id'])
        views = []

        if perms['is_admin'] or perms['is_developer']:
            views.append({'value': 'all', 'label': 'All Teams', 'priority': 1})

        if perms['manages_games']:
            views.append({'value': 'manage', 'label': 'Managed Teams', 'priority': 2})
            views.append({'value': 'past_managed', 'label': 'Old Managed Teams', 'priority': 3})

        if perms['in_teams']:
            views.append({'value': 'play', 'label': 'My Teams', 'priority': 4})
            views.append({'value': 'my_past_teams', 'label': 'My Old Teams', 'priority': 5})

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


@app.route('/api/teams/<team_id>/details')
@login_required
def team_details(team_id):
    """
    Get information about a team
    Includes team members, member count, and teammate roles
    """
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get team and season info
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

            # Check if user can manage
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

            # Check membership
            try:
                cursor.execute(f"SELECT 1 FROM team_members WHERE user_id = %s AND team_id = %s",
                               (session['id'], team_id))
                is_member = cursor.fetchone() is not None
            except:
                is_member = False

            # Count members
            try:
                cursor.execute(f"SELECT COUNT(*) as count FROM team_members WHERE team_id = %s", (team_id,))
                member_count = cursor.fetchone()['count']
            except:
                member_count = 0

            # Fetch members with season-appropriate roles
            formatted_members = []
            try:
                # Determine if season_roles (past) or permissions (current) should be used
                use_season_roles = (season_id is not None and season_is_active == 0)

                if use_season_roles:
                    # Past season - use frozen season_roles data
                    cursor.execute("""
                        SELECT u.id, u.firstname, u.lastname, u.username,
                               u.profile_picture, tm.joined_at,
                               COALESCE(sr.is_admin, 0) as is_admin,
                               COALESCE(sr.is_developer, 0) as is_developer,
                               COALESCE(sr.is_gm, 0) as is_gm,
                               COALESCE(sr.is_player, 0) as is_player
                        FROM team_members tm
                        JOIN users u ON tm.user_id = u.id
                        LEFT JOIN season_roles sr ON u.id = sr.userid AND sr.season_id = %s
                        WHERE tm.team_id = %s
                        ORDER BY u.firstname, u.lastname
                    """, (season_id, team_id))
                else:
                    # Current season or no season - use live permissions data
                    cursor.execute("""
                        SELECT u.id, u.firstname, u.lastname, u.username,
                               u.profile_picture, tm.joined_at,
                               COALESCE(p.is_admin, 0) as is_admin,
                               COALESCE(p.is_developer, 0) as is_developer,
                               COALESCE(p.is_gm, 0) as is_gm,
                               COALESCE(p.is_player, 0) as is_player
                        FROM team_members tm
                        JOIN users u ON tm.user_id = u.id
                        LEFT JOIN permissions p ON u.id = p.userid
                        WHERE tm.team_id = %s
                        ORDER BY u.firstname, u.lastname
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

            # Get game info
            cursor.execute('SELECT GameTitle, GameImage, Division FROM games WHERE GameID = %s', (game_id,))
            game_info = cursor.fetchone()
            game_title = game_info['GameTitle'] if game_info else 'Unknown Game'
            game_division = game_info['Division'] if game_info else None

            game_icon_url = None
            if game_info and game_info['GameImage']:
                game_icon_url = f'/game-image/{game_id}'

            return jsonify({
                'success': True,
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
                    'season_is_active': season_is_active,
                    'uses_season_roles': use_season_roles  # Flag for frontend
                }
            }), 200

        finally:
            cursor.close()

    except Exception as e:
        print(f"Error getting team details: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to load team details'}), 500


@app.route('/api/teams/<team_id>/next-scheduled-event')
@login_required
def next_team_scheduled_event(team_id):
    """
    Get the next upcoming scheduled event for the team's game
    Appears as a card in the team details section
    """
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        # Get the team's game
        game_id = get_team_game_id(cursor, team_id)
        if game_id is None:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        now = datetime.now(EST)
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

        start_time_str = format_time_to_12hr(event['StartTime'])
        end_time_str = format_time_to_12hr(event['EndTime'])

        # Check if all-day event
        is_all_day = is_all_day_event(start_time_str, end_time_str)

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
        return jsonify({'success': False, 'message': 'Failed to fetch event'}), 500


def is_team_season_active(mysql, team_id):
    """Check if a team's season is currently active"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("""
            SELECT s.is_active
            FROM teams t
            LEFT JOIN seasons s ON t.season_id = s.season_id
            WHERE t.TeamID = %s
        """, (team_id,))

        result = cursor.fetchone()
        if not result:
            return False, False

        season_is_active = result['is_active'] == 1 if result['is_active'] is not None else True

        return season_is_active
    finally:
        cursor.close()


@app.route('/api/teams/<team_id>/deletion-info', methods=['GET'])
@login_required
def get_team_deletion_info(team_id):
    """Get information about team deletion permissions and time window"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        info = check_team_deletion_permission(cursor, team_id, session['id'])

        if not info:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        return jsonify({
            'success': True,
            'can_delete': info['can_delete'],
            'restriction_level': info['restriction_level'],
            'team_name': info['team']['teamName'],
            'created_at': info['created_at'].isoformat(),
            'days_since_creation': info['days_since_creation'],
            'within_30_days': info['within_30_days'],
            'days_remaining': info['days_remaining'],
            'hours_remaining': info['hours_remaining'],
            'deletion_deadline': info['deletion_deadline'].isoformat(),
            'is_developer': info['is_developer'],
            'is_admin': info['is_admin'],
            'is_game_gm': info['is_game_gm']
        })

    except Exception as e:
        print(f"Error getting deletion info: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()


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

        info = check_team_deletion_permission(cursor, team_id, session['id'])

        if not info:
            return jsonify({'success': False, 'message': 'Team not found'}), 404

        if not info['can_delete']:
            return jsonify({'success': False, 'message': info['denial_reason']}), 403

        team = info['team']

        # Get all members before deleting
        cursor.execute('SELECT user_id FROM team_members WHERE team_id = %s', (team_id,))
        member_ids = [r['user_id'] for r in cursor.fetchall()]

        # Delete team-specific scheduled events
        cursor.execute("""
            SELECT schedule_id FROM scheduled_events
            WHERE team_id = %s AND visibility = 'team'
        """, (team_id,))

        for schedule in cursor.fetchall():
            cursor.execute("DELETE FROM generalevents WHERE schedule_id = %s", (schedule['schedule_id'],))

        cursor.execute("DELETE FROM scheduled_events WHERE team_id = %s AND visibility = 'team'", (team_id,))

        # Delete team data
        cursor.execute('DELETE FROM team_leagues WHERE team_id = %s', (team_id,))
        cursor.execute('DELETE FROM team_members WHERE team_id = %s', (team_id,))
        cursor.execute('DELETE FROM teams WHERE TeamID = %s', (team_id,))

        # Update player status for members no longer in any teams
        for member_id in member_ids:
            cursor.execute('SELECT COUNT(*) as count FROM team_members WHERE user_id = %s', (member_id,))
            if cursor.fetchone()['count'] == 0:
                cursor.execute('UPDATE permissions SET is_player = 0 WHERE userid = %s', (member_id,))

        mysql.connection.commit()

        return jsonify({'success': True, 'message': f'Team "{team["teamName"]}" deleted successfully'})

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error deleting team: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

    finally:
        cursor.close()


# =====================================
# HELPER FUNCTIONS
# =====================================
def get_permissions_for_sidebar(user_id):
    """
    Extends get_user_permissions with team/game membership checks
    needed to determine which sidebar views to show.
    """
    perms = get_user_permissions(user_id)

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        manages_games = False
        in_teams = False

        if perms['is_admin'] or perms['is_developer'] or perms['is_gm']:
            cursor.execute("SELECT COUNT(*) as count FROM games WHERE gm_id = %s", (user_id,))
            manages_games = cursor.fetchone()['count'] > 0

        if perms['is_player']:
            cursor.execute("SELECT COUNT(*) as count FROM team_members WHERE user_id = %s", (user_id,))
            in_teams = cursor.fetchone()['count'] > 0

        return {**perms, 'manages_games': manages_games, 'in_teams': in_teams}
    finally:
        cursor.close()

def check_team_deletion_permission(cursor, team_id, user_id):
    """
    Determines whether a team can be deleted by the user.
    Assigns a denial reason if the user cannot delete a team.
    """
    cursor.execute("""
        SELECT t.teamName, t.created_at, t.gameID, g.gm_id, s.is_active as season_is_active
        FROM teams t
        LEFT JOIN games g ON t.gameID = g.GameID
        LEFT JOIN seasons s ON t.season_id = s.season_id
        WHERE t.TeamID = %s
    """, (team_id,))
    team = cursor.fetchone()

    if not team:
        return None

    permissions = get_user_permissions(user_id)
    is_developer = permissions['is_developer']
    is_admin = permissions['is_admin']
    is_game_gm = (team['gm_id'] == user_id)
    season_is_active = team['season_is_active'] == 1 if team['season_is_active'] is not None else True

    created_at = localize_datetime(team['created_at'])

    now = datetime.now(EST)
    days_since_creation = (now - created_at).days
    within_30_days = days_since_creation <= 30
    deletion_deadline = created_at + timedelta(days=30)
    time_remaining = deletion_deadline - now
    days_remaining = max(time_remaining.days, 0)
    hours_remaining = time_remaining.seconds // 3600 if within_30_days else 0

    can_delete = False
    restriction_level = 'no_permission'
    denial_reason = "You don't have permission to delete this team."

    if is_developer:
        can_delete = True
        restriction_level = 'developer'
    elif (is_admin or is_game_gm) and season_is_active and within_30_days:
        can_delete = True
        restriction_level = 'time_limited'
    elif (is_admin or is_game_gm) and not season_is_active:
        restriction_level = 'expired'
        denial_reason = "Cannot delete teams from past seasons. Only developers can delete historical team data."
    elif (is_admin or is_game_gm) and not within_30_days:
        restriction_level = 'expired'
        denial_reason = f"Team was created {days_since_creation} days ago. Only developers can delete teams older than 30 days."

    return {
        'team': team,
        'can_delete': can_delete,
        'restriction_level': restriction_level,
        'denial_reason': denial_reason,
        'is_developer': is_developer,
        'is_admin': is_admin,
        'is_game_gm': is_game_gm,
        'days_since_creation': days_since_creation,
        'within_30_days': within_30_days,
        'days_remaining': days_remaining,
        'hours_remaining': hours_remaining,
        'deletion_deadline': deletion_deadline,
        'created_at': created_at,
    }