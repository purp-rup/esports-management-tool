from EsportsManagementTool import app, login_required, mysql
from EsportsManagementTool.universal_helpers import get_user_permissions
from flask import request, session, jsonify
import MySQLdb.cursors
import cloudinary
import cloudinary.uploader
import random

PHOTO_LIMIT = 6
LANDING_PHOTO_LIMIT = 12


def _can_edit(game_id, cursor):
    """Return True if the current user is an admin, developer, or GM of this game."""
    cursor.execute("SELECT gm_id FROM games WHERE GameID = %s", (game_id,))
    game = cursor.fetchone()
    if not game:
        return False, None
    permissions = get_user_permissions(session['id'])
    allowed = (
        permissions['is_admin'] or
        permissions['is_developer'] or
        game['gm_id'] == session['id']
    )
    return allowed, game


@app.route('/api/game/<int:game_id>/photos', methods=['GET'])
@login_required
def get_community_photos(game_id):
    """Return all photos for a community, ordered oldest first."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("""
            SELECT photo_id, photo_url
            FROM photo_upload
            WHERE community_id = %s
            ORDER BY uploaded_at ASC
        """, (game_id,))
        photos = cursor.fetchall()
        return jsonify({'success': True, 'photos': photos}), 200

    except Exception as e:
        print(f"Error fetching photos: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch photos: {str(e)}'}), 500

    finally:
        cursor.close()


@app.route('/api/game/<int:game_id>/photos', methods=['POST'])
@login_required
def upload_community_photo(game_id):
    """Upload a photo to a community. Enforces the six-photo limit."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        allowed, _ = _can_edit(game_id, cursor)
        if not allowed:
            return jsonify({'success': False, 'message': 'Permission denied'}), 403

        cursor.execute(
            "SELECT COUNT(*) AS total FROM photo_upload WHERE community_id = %s",
            (game_id,)
        )
        count = cursor.fetchone()['total']
        if count >= PHOTO_LIMIT:
            return jsonify({
                'success': False,
                'limit_reached': True,
                'message': f'This community already has {PHOTO_LIMIT} photos. Delete one before uploading more.'
            }), 400

        if 'photo' not in request.files or not request.files['photo'].filename:
            return jsonify({'success': False, 'message': 'No photo file provided'}), 400

        file = request.files['photo']
        upload_result = cloudinary.uploader.upload(file, folder="photo_upload")
        photo_url = upload_result.get('secure_url')
        public_id = upload_result.get('public_id')

        cursor.execute(
            "INSERT INTO photo_upload (community_id, photo_url, cloudinary_public_id) VALUES (%s, %s, %s)",
            (game_id, photo_url, public_id)
        )
        mysql.connection.commit()
        photo_id = cursor.lastrowid

        return jsonify({'success': True, 'photo': {'photo_id': photo_id, 'photo_url': photo_url}}), 200

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error uploading photo: {str(e)}")
        return jsonify({'success': False, 'message': f'Upload failed: {str(e)}'}), 500

    finally:
        cursor.close()


@app.route('/api/game/<int:game_id>/photos/<int:photo_id>', methods=['DELETE'])
@login_required
def delete_community_photo(game_id, photo_id):
    """Delete a community photo from the database and Cloudinary."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        allowed, _ = _can_edit(game_id, cursor)
        if not allowed:
            return jsonify({'success': False, 'message': 'Permission denied'}), 403

        cursor.execute(
            "SELECT cloudinary_public_id FROM photo_upload WHERE photo_id = %s AND community_id = %s",
            (photo_id, game_id)
        )
        photo = cursor.fetchone()
        if not photo:
            return jsonify({'success': False, 'message': 'Photo not found'}), 404

        cloudinary.uploader.destroy(photo['cloudinary_public_id'])

        cursor.execute("DELETE FROM photo_upload WHERE photo_id = %s", (photo_id,))
        mysql.connection.commit()

        return jsonify({'success': True}), 200

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error deleting photo: {str(e)}")
        return jsonify({'success': False, 'message': f'Delete failed: {str(e)}'}), 500

    finally:
        cursor.close()

# ============================================================
# LANDING PAGE GALLERY
# ============================================================
@app.route('/api/landing/photos', methods=['GET'])
def get_landing_photos():
    """Return every photo in the system in a shuffled order that stays fixed for this
    visitor's session, so the reel loops without repeats until every photo has been shown once.
    This pulls from the whole table, unlike the admin management endpoints below which only
    touch community_id IS NULL rows."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("""
            SELECT photo_id, photo_url
            FROM photo_upload
            WHERE is_hidden = 0
            ORDER BY uploaded_at ASC
        """)
        photos = cursor.fetchall()
        photo_map = {p['photo_id']: p for p in photos}
        current_ids = set(photo_map.keys())

        stored_order = session.get('landing_photo_order')
        stored_ids = set(session.get('landing_photo_ids', []))

        # Reshuffle only if this is a new visitor or the photo set changed
        # (admin added/removed something) — otherwise keep the same order
        # so refreshing the page doesn't reset the reel.
        if not stored_order or stored_ids != current_ids:
            order = list(current_ids)
            random.shuffle(order)
            session['landing_photo_order'] = order
            session['landing_photo_ids'] = list(current_ids)
        else:
            order = stored_order

        ordered_photos = [photo_map[pid] for pid in order if pid in photo_map]
        return jsonify({'success': True, 'photos': ordered_photos}), 200

    except Exception as e:
        print(f"Error fetching landing photos: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch photos: {str(e)}'}), 500

    finally:
        cursor.close()


@app.route('/api/admin/landing-photos', methods=['GET'])
@login_required
def get_landing_photos_admin():
    """Admin-only: list all landing photos (plain order) for the management modal."""
    permissions = get_user_permissions(session['id'])
    if not (permissions['is_admin'] or permissions['is_developer']):
        return jsonify({'success': False, 'message': 'Permission denied'}), 403

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("""
            SELECT photo_id, photo_url
            FROM photo_upload
            WHERE community_id IS NULL
            ORDER BY uploaded_at DESC
        """)
        photos = cursor.fetchall()
        return jsonify({'success': True, 'photos': photos}), 200

    except Exception as e:
        print(f"Error fetching landing photos: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch photos: {str(e)}'}), 500

    finally:
        cursor.close()

@app.route('/api/admin/landing-photos/communities', methods=['GET'])
@login_required
def get_landing_photos_by_community():
    """Admin-only: list every community alongside its uploaded photos, for the
    Communities tab of the landing gallery management modal."""
    permissions = get_user_permissions(session['id'])
    if not (permissions['is_admin'] or permissions['is_developer']):
        return jsonify({'success': False, 'message': 'Permission denied'}), 403

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("""
            SELECT g.GameID AS game_id, g.GameTitle AS game_title, g.GameImage AS game_image,
                   p.photo_id, p.photo_url, p.is_hidden
            FROM games g
            LEFT JOIN photo_upload p ON p.community_id = g.GameID
            ORDER BY g.GameTitle ASC, p.uploaded_at ASC
        """)
        rows = cursor.fetchall()

        communities = {}
        for row in rows:
            gid = row['game_id']
            if gid not in communities:
                communities[gid] = {
                    'game_id': gid,
                    'game_title': row['game_title'],
                    'game_image': row['game_image'],
                    'photos': []
                }
            if row['photo_id'] is not None:
                communities[gid]['photos'].append({
                    'photo_id': row['photo_id'],
                    'photo_url': row['photo_url'],
                    'is_hidden': bool(row['is_hidden'])
                })

        return jsonify({'success': True, 'communities': list(communities.values())}), 200

    except Exception as e:
        print(f"Error fetching community photos: {str(e)}")
        return jsonify({'success': False, 'message': f'Failed to fetch photos: {str(e)}'}), 500

    finally:
        cursor.close()


@app.route('/api/admin/landing-photos', methods=['POST'])
@login_required
def upload_landing_photo():
    """Admin-only: upload a photo to the landing page gallery. Enforces the limit."""
    permissions = get_user_permissions(session['id'])
    if not (permissions['is_admin'] or permissions['is_developer']):
        return jsonify({'success': False, 'message': 'Permission denied'}), 403

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute("SELECT COUNT(*) AS total FROM photo_upload WHERE community_id IS NULL")
        count = cursor.fetchone()['total']
        if count >= LANDING_PHOTO_LIMIT:
            return jsonify({
                'success': False,
                'limit_reached': True,
                'message': f'The landing gallery already has {LANDING_PHOTO_LIMIT} photos. Delete one before uploading more.'
            }), 400

        if 'photo' not in request.files or not request.files['photo'].filename:
            return jsonify({'success': False, 'message': 'No photo file provided'}), 400

        file = request.files['photo']
        upload_result = cloudinary.uploader.upload(file, folder="photo_upload")
        photo_url = upload_result.get('secure_url')
        public_id = upload_result.get('public_id')

        cursor.execute(
            "INSERT INTO photo_upload (community_id, photo_url, cloudinary_public_id) VALUES (NULL, %s, %s)",
            (photo_url, public_id)
        )
        mysql.connection.commit()
        photo_id = cursor.lastrowid

        return jsonify({'success': True, 'photo': {'photo_id': photo_id, 'photo_url': photo_url}}), 200

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error uploading landing photo: {str(e)}")
        return jsonify({'success': False, 'message': f'Upload failed: {str(e)}'}), 500

    finally:
        cursor.close()


@app.route('/api/admin/landing-photos/<int:photo_id>', methods=['DELETE'])
@login_required
def delete_landing_photo(photo_id):
    """Admin-only: delete a landing page photo from the database and Cloudinary."""
    permissions = get_user_permissions(session['id'])
    if not (permissions['is_admin'] or permissions['is_developer']):
        return jsonify({'success': False, 'message': 'Permission denied'}), 403

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cursor.execute(
            "SELECT cloudinary_public_id FROM photo_upload WHERE photo_id = %s AND community_id IS NULL",
            (photo_id,)
        )
        photo = cursor.fetchone()
        if not photo:
            return jsonify({'success': False, 'message': 'Photo not found'}), 404

        cloudinary.uploader.destroy(photo['cloudinary_public_id'])

        cursor.execute("DELETE FROM photo_upload WHERE photo_id = %s", (photo_id,))
        mysql.connection.commit()

        return jsonify({'success': True}), 200

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error deleting landing photo: {str(e)}")
        return jsonify({'success': False, 'message': f'Delete failed: {str(e)}'}), 500

    finally:
        cursor.close()


@app.route('/api/game/<int:game_id>/photos/<int:photo_id>/hide', methods=['PATCH'])
@login_required
def toggle_community_photo_hidden(game_id, photo_id):
    """Toggle whether a community photo is hidden from the landing page gallery.
    The photo stays visible on the community's own page either way."""
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        allowed, _ = _can_edit(game_id, cursor)
        if not allowed:
            return jsonify({'success': False, 'message': 'Permission denied'}), 403

        cursor.execute(
            "SELECT is_hidden FROM photo_upload WHERE photo_id = %s AND community_id = %s",
            (photo_id, game_id)
        )
        photo = cursor.fetchone()
        if not photo:
            return jsonify({'success': False, 'message': 'Photo not found'}), 404

        new_hidden = not photo['is_hidden']
        cursor.execute(
            "UPDATE photo_upload SET is_hidden = %s WHERE photo_id = %s",
            (new_hidden, photo_id)
        )
        mysql.connection.commit()

        return jsonify({'success': True, 'is_hidden': new_hidden}), 200

    except Exception as e:
        mysql.connection.rollback()
        print(f"Error toggling photo visibility: {str(e)}")
        return jsonify({'success': False, 'message': f'Update failed: {str(e)}'}), 500

    finally:
        cursor.close()