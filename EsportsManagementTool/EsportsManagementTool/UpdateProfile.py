from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_mysqldb import MySQL
from flask_mail import Mail, Message
import bcrypt
from EsportsManagementTool import app
import MySQLdb.cursors
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
load_dotenv()

mysql = MySQL()

#DISCLAIMER: BELOW CODE WAS GENERATED USING CLAUDE AI

"""
Route to allow users to update personal information within the profile tab.
"""
@app.route('/api/profile/update', methods=['POST'])
def update_profile():
    """Update user profile information (excluding email)"""

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        data = request.get_json()
        user_id = session['id']

        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401

        # Validate required fields (email removed)
        if not all(key in data for key in ['firstname', 'lastname', 'username']):
            return jsonify({'error': 'Missing required fields'}), 400

        # Check if username is taken by another user
        cursor.execute(
            "SELECT id FROM users WHERE username = %s AND id != %s",
            (data['username'], user_id)
        )
        if cursor.fetchone():
            return jsonify({'error': 'Username already taken'}), 400

        # Update user fields (email not updated)
        cursor.execute(
            """UPDATE users
               SET firstname = %s,
                   lastname  = %s,
                   username  = %s
               WHERE id = %s""",
            (data['firstname'], data['lastname'], data['username'], user_id)
        )

        mysql.connection.commit()

        session['username'] = data['username']
        session.modified = True

        return jsonify({
            'success': True,
            'message': 'Profile updated successfully',
            'user': {
                'firstname': data['firstname'],
                'lastname': data['lastname'],
                'username': data['username']
            }
        }), 200


    except Exception as e:
        return jsonify({'error': str(e)}), 500

"""
Route to allow users to change their password within the profile tab.
"""
@app.route('/api/profile/change-password', methods=['POST'])
def change_password():
    """Change user password with current password verification"""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Invalid JSON body'}), 400

        user_id = session['id']

        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401

        # Validate required fields
        if not all(key in data for key in ['current_password', 'new_password']):
            return jsonify({'error': 'Missing required fields'}), 400

        # Validate new password length
        if len(data['new_password']) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        # Get current password hash from database
        cursor.execute("SELECT password FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()

        if not user:
            return jsonify({'error': 'User not found'}), 404

        current_hash = user['password']

        # Verify current password
        if not bcrypt.checkpw(data['current_password'].encode('utf-8'), current_hash.encode('utf-8')):
            return jsonify({'error': 'Current password is incorrect'}), 400

        # Check if new password is the same as the current password
        if bcrypt.checkpw(data['new_password'].encode('utf-8'), current_hash.encode('utf-8')):
            return jsonify({'error': 'New password cannot be the same as your current password'}), 400

        # Hash and update new password
        new_password_hash = bcrypt.hashpw(data['new_password'].encode('utf-8'), bcrypt.gensalt())

        cursor.execute(
            "UPDATE users SET password = %s WHERE id = %s",
            (new_password_hash.decode('utf-8'), user_id)
        )
        mysql.connection.commit()

        return jsonify({
            'success': True,
            'message': 'Password changed successfully'
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

    finally:
        cursor.close()

# Uploads PFP to Cloudinary

@app.route('/api/profile/upload-picture', methods=['POST'])
def upload_profile_picture():
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        user_id = session.get('id')

        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401

        if 'profile_picture' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['profile_picture']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Get old public_id to delete from Cloudinary
        cursor.execute("SELECT cloudinary_public_id FROM users WHERE id = %s", (user_id,))
        old_user = cursor.fetchone()
        old_public_id = old_user.get('cloudinary_public_id') if old_user else None

        # Upload new image to Cloudinary
        result = cloudinary.uploader.upload(
            file,
            folder='profile_pictures/',
            transformation=[{'width': 400, 'height': 400, 'crop': 'fill'}]
        )

        picture_url = result['secure_url']
        public_id = result['public_id']

        # Delete old image from Cloudinary if it exists
        if old_public_id:
            cloudinary.uploader.destroy(old_public_id)

        # Save new URL and public_id to MySQL
        cursor.execute(
            "UPDATE users SET profile_picture = %s, cloudinary_public_id = %s WHERE id = %s",
            (picture_url, public_id, user_id)
        )
        mysql.connection.commit()

        return jsonify({
            'success': True,
            'profile_picture_url': picture_url
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

    finally:
        cursor.close()

#DISCLAIMER: ABOVE CODE WAS GENERATED USING CLAUDE AI