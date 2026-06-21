"""
Discord OAuth2 Integration for Flask Application
Final version with encrypted discord_id using VARCHAR storage
"""

from flask import request, redirect, url_for, session, flash, jsonify
import MySQLdb.cursors
from EsportsManagementTool import app, mysql
from EsportsManagementTool.encryption_utils import encrypt_token, decrypt_token
import requests
from datetime import datetime, timedelta
import os
from EsportsManagementTool import EST
from io import BytesIO
import cloudinary
import cloudinary.uploader

# Discord OAuth2 Configuration
DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
DISCORD_CLIENT_SECRET = os.getenv('DISCORD_CLIENT_SECRET')
DISCORD_REDIRECT_URI = os.getenv('DISCORD_REDIRECT_URI', 'http://localhost:5000/discord/callback')

# Discord API endpoints
DISCORD_API_BASE = 'https://discord.com/api/v10'
DISCORD_AUTH_URL = f'{DISCORD_API_BASE}/oauth2/authorize'
DISCORD_TOKEN_URL = f'{DISCORD_API_BASE}/oauth2/token'
DISCORD_USER_URL = f'{DISCORD_API_BASE}/users/@me'


def find_discord_by_id(discord_id, exclude_userid=None):
    """
    Helper function to find Discord connection by discord_id
    Handles decryption of stored encrypted discord_ids
    
    Args:
        discord_id (str): Plain discord ID to search for
        exclude_userid (int): Optional user ID to exclude from search
    
    Returns:
        dict: Discord connection data or None
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    
    if exclude_userid:
        cursor.execute("SELECT * FROM discord WHERE userid != %s", (exclude_userid,))
    else:
        cursor.execute("SELECT * FROM discord")
    
    all_records = cursor.fetchall()
    cursor.close()
    
    # Decrypt and compare each discord_id
    for record in all_records:
        decrypted_id = decrypt_token(record['discord_id'])
        if decrypted_id == discord_id:
            return record
    
    return None


@app.route('/discord/connect')
def discord_connect():
    """
    Initiates Discord OAuth2 flow
    Redirects user to Discord authorization page
    """
    if 'loggedin' not in session:
        flash('Please log in first', 'error')
        return redirect(url_for('login'))
    
    # Check if Discord credentials are configured
    if not DISCORD_CLIENT_ID or not DISCORD_CLIENT_SECRET:
        flash('Discord integration is not configured', 'error')
        return redirect(url_for('dashboard'))
    
    # Build Discord authorization URL
    params = {
        'client_id': DISCORD_CLIENT_ID,
        'redirect_uri': DISCORD_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'identify email',
        'state': str(session['id'])
    }
    
    auth_url = f"{DISCORD_AUTH_URL}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
    return redirect(auth_url)


@app.route('/discord/callback')
def discord_callback():
    """
    Handles Discord OAuth2 callback
    Exchanges authorization code for access token and saves user data
    Encrypts discord_id, access_token, and refresh_token before storage
    """
    if 'loggedin' not in session:
        flash('Session expired. Please log in again.', 'error')
        return redirect(url_for('login'))
    
    # Get authorization code from callback
    code = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')
    
    # Handle user denial
    if error:
        flash('Discord connection was cancelled', 'warning')
        return redirect(url_for('dashboard'))
    
    # Verify state parameter (security check)
    if str(session['id']) != state:
        flash('Invalid state parameter', 'error')
        return redirect(url_for('dashboard'))
    
    if not code:
        flash('No authorization code received', 'error')
        return redirect(url_for('dashboard'))
    
    try:
        # Exchange code for access token
        token_data = {
            'client_id': DISCORD_CLIENT_ID,
            'client_secret': DISCORD_CLIENT_SECRET,
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': DISCORD_REDIRECT_URI
        }
        
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        
        token_response = requests.post(DISCORD_TOKEN_URL, data=token_data, headers=headers)
        token_response.raise_for_status()
        token_json = token_response.json()
        
        access_token = token_json['access_token']
        refresh_token = token_json.get('refresh_token')
        expires_in = token_json.get('expires_in', 604800)
        
        # Calculate token expiration
        expires_at = datetime.now(EST) + timedelta(seconds=expires_in)
        
        # Fetch Discord user info
        user_headers = {'Authorization': f'Bearer {access_token}'}
        user_response = requests.get(DISCORD_USER_URL, headers=user_headers)
        user_response.raise_for_status()
        discord_user = user_response.json()
        
        # Extract user data
        discord_id = discord_user['id']
        discord_username = discord_user['username']
        discord_discriminator = discord_user.get('discriminator', '0')
        discord_avatar = discord_user.get('avatar')
        
        # Encrypt all sensitive data and decode to string for VARCHAR storage
        encrypted_discord_id = encrypt_token(discord_id).decode('utf-8')
        encrypted_access_token = encrypt_token(access_token).decode('utf-8')
        encrypted_refresh_token = encrypt_token(refresh_token).decode('utf-8') if refresh_token else None
        
        # Check if Discord account is already linked to another user
        existing = find_discord_by_id(discord_id, exclude_userid=session['id'])
        
        if existing:
            flash('This Discord account is already linked to another user', 'error')
            return redirect(url_for('dashboard'))
        
        # Insert or update Discord connection with ALL encrypted sensitive data
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute("""
            INSERT INTO discord 
            (userid, discord_id, discord_username, discord_discriminator, 
             discord_avatar, access_token, refresh_token, token_expires_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
            discord_id = VALUES(discord_id),
            discord_username = VALUES(discord_username),
            discord_discriminator = VALUES(discord_discriminator),
            discord_avatar = VALUES(discord_avatar),
            access_token = VALUES(access_token),
            refresh_token = VALUES(refresh_token),
            token_expires_at = VALUES(token_expires_at),
            updated_at = CURRENT_TIMESTAMP
        """, (session['id'], encrypted_discord_id, discord_username, discord_discriminator,
              discord_avatar, encrypted_access_token, encrypted_refresh_token, expires_at))
        
        mysql.connection.commit()
        cursor.close()
        
        flash('Discord account connected successfully!', 'success')
        return redirect(url_for('dashboard'))
        
    except requests.exceptions.RequestException as e:
        print(f"Discord API error: {str(e)}")
        flash('Failed to connect Discord account. Please try again.', 'error')
        return redirect(url_for('dashboard'))
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        flash('An error occurred. Please try again.', 'error')
        return redirect(url_for('dashboard'))


@app.route('/discord/disconnect', methods=['POST'])
def discord_disconnect():
    """
    Disconnects Discord account from user profile
    """
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute("""
            DELETE FROM discord WHERE userid = %s
        """, (session['id'],))
        mysql.connection.commit()
        cursor.close()
        
        return jsonify({'success': True, 'message': 'Discord account disconnected'})
    except Exception as e:
        print(f"Error disconnecting Discord: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to disconnect'}), 500


@app.route('/api/discord/info')
def get_discord_info():
    """
    Returns Discord connection info for the current user
    Decrypts discord_id for avatar URL construction
    """
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute("""
            SELECT discord_id, discord_username, discord_discriminator, 
                   discord_avatar, connected_at
            FROM discord
            WHERE userid = %s
        """, (session['id'],))
        
        discord_data = cursor.fetchone()
        cursor.close()
        
        if discord_data:
            # Decrypt the discord_id for use in avatar URL
            decrypted_discord_id = decrypt_token(discord_data['discord_id'])
            
            if not decrypted_discord_id:
                return jsonify({'success': False, 'message': 'Failed to decrypt Discord data'}), 500
            
            # Build avatar URL
            avatar_url = None
            if discord_data['discord_avatar']:
                avatar_url = f"https://cdn.discordapp.com/avatars/{decrypted_discord_id}/{discord_data['discord_avatar']}.png?size=256"
            
            return jsonify({
                'success': True,
                'connected': True,
                'discord_id': decrypted_discord_id,
                'username': discord_data['discord_username'],
                'discriminator': discord_data['discord_discriminator'],
                'avatar_url': avatar_url,
                'connected_at': discord_data['connected_at'].strftime('%B %d, %Y')
            })
        else:
            return jsonify({'success': True, 'connected': False})
            
    except Exception as e:
        print(f"Error fetching Discord info: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to fetch Discord info'}), 500


@app.route('/discord/sync-avatar', methods=['POST'])
def sync_discord_avatar():
    """
    Syncs Discord profile picture to user's profile via Cloudinary
    Downloads Discord avatar and uploads it to Cloudinary
    Decrypts discord_id for avatar URL construction
    """
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    try:
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        cursor.execute("""
            SELECT discord_id, discord_avatar, access_token, cloudinary_public_id
            FROM discord
            WHERE userid = %s
        """, (session['id'],))
        
        discord_data = cursor.fetchone()
        
        # Decrypt access token
        access_token = decrypt_token(discord_data['access_token'])
        decrypted_discord_id = decrypt_token(discord_data['discord_id'])

        # FETCH FRESH USER DATA FROM DISCORD - gets CURRENT avatar hash
        user_headers = {'Authorization': f'Bearer {access_token}'}
        user_response = requests.get(DISCORD_USER_URL, headers=user_headers)
        user_response.raise_for_status()
        fresh_user_data = user_response.json()

        if not discord_data:
            cursor.close()
            return jsonify({'success': False, 'message': 'No Discord account connected'}), 400
        
        if not access_token or not decrypted_discord_id:
            cursor.close()
            return jsonify({'success': False,
                            'message': 'Failed to decrypt Discord data. Please reconnect your Discord account.'}), 500

        # GET FRESH AVATAR HASH FROM DISCORD, NOT FROM DATABASE
        discord_avatar = fresh_user_data.get('avatar')

        avatar_url = f"https://cdn.discordapp.com/avatars/{decrypted_discord_id}/{discord_avatar}.png?size=512"

        if not decrypted_discord_id or not access_token:
            cursor.close()
            return jsonify({'success': False,
                            'message': 'Failed to decrypt Discord data. Please reconnect your Discord account.'}), 500

        if not discord_avatar:
            cursor.close()
            return jsonify({'success': False,
                            'message': 'You do not have a custom Discord avatar set. Please set a profile picture on Discord and try again.'}), 400

        # Build avatar URL using decrypted discord_id
        avatar_url = f"https://cdn.discordapp.com/avatars/{decrypted_discord_id}/{discord_data['discord_avatar']}.png?size=512"
        
        # Download the avatar image
        avatar_response = requests.get(avatar_url)
        avatar_response.raise_for_status()

        # Get old Cloudinary public_id if it exists (for deletion)
        old_public_id = discord_data.get('cloudinary_public_id')

        # Delete old image from Cloudinary if it exists
        if old_public_id:
            cloudinary.uploader.destroy(old_public_id)

        # Wrap image bytes in BytesIO to upload to Cloudinary
        image_file = BytesIO(avatar_response.content)
        image_file.name = f"discord_avatar_{session['id']}.png"

        # Upload to Cloudinary
        upload_result = cloudinary.uploader.upload(
            image_file,
            folder='profile_pictures/',
            transformation=[{'width': 400, 'height': 400, 'crop': 'fill'}]
        )

        picture_url = upload_result.get('secure_url')
        public_id = upload_result.get('public_id')

        # Update user's profile_picture in database with Cloudinary URL
        cursor.execute("""
            UPDATE users 
            SET profile_picture = %s,
                cloudinary_public_id = %s
            WHERE id = %s
        """, (picture_url, public_id, session['id']))

        # Update discord table with FRESH avatar hash so it's current for next time
        cursor.execute("""
                    UPDATE discord
                    SET discord_avatar = %s
                    WHERE userid = %s
                """, (discord_avatar, session['id']))

        mysql.connection.commit()
        cursor.close()
        
        return jsonify({
            'success': True,
            'message': 'Profile picture synced successfully!',
            'avatar_url': picture_url
        })
        
    except requests.exceptions.RequestException as e:
        print(f"Error downloading avatar: {str(e)}")
        return jsonify({'success': False, 'message': 'Failed to download Discord avatar'}), 500
    except Exception as e:
        print(f"Error syncing avatar: {str(e)}")
        import traceback
        traceback.print_exc()
        mysql.connection.rollback()
        return jsonify({'success': False, 'message': 'Failed to sync avatar'}), 500