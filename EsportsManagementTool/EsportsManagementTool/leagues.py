"""
League management module
Handles CRUD operations for leagues
Stores images as BLOB data (matching games pattern)
"""
from EsportsManagementTool.universal_helpers import get_user_permissions
from flask import request, jsonify, send_file
from werkzeug.utils import secure_filename
import MySQLdb.cursors
from io import BytesIO
import cloudinary
import cloudinary.uploader
import os

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    if not filename:
        return False
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def register_league_routes(app, mysql, login_required, roles_required):
    """Register all league-related routes"""

    @app.route('/league/all', methods=['GET'])
    @login_required
    def get_all_leagues():
        """Get all leagues"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute('''
                SELECT id, name, website_url, created_at, updated_at, logo
                FROM league
                ORDER BY name ASC
            ''')

            leagues = cursor.fetchall()

            return jsonify({'leagues': leagues}), 200

        except Exception as e:
            print(f"Error fetching leagues: {e}")
            return jsonify({'error': 'Failed to fetch leagues'}), 500

        finally:
            cursor.close()

    @app.route('/league/create', methods=['POST'])
    @roles_required('admin', 'developer')
    def create_league():
        """Create a new league"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Get form data
            name = request.form.get('name', '').strip()
            website_url = request.form.get('website_url', '').strip()

            print(f"\n=== LEAGUE CREATE DEBUG ===")
            print(f"Name: {name}")
            print(f"Website URL: {website_url}")
            print(f"Request files keys: {list(request.files.keys())}")
            print(f"Request form keys: {list(request.form.keys())}")

            if not name:
                return jsonify({'error': 'League name is required'}), 400

            # Check if league name already exists
            cursor.execute('SELECT id FROM league WHERE name = %s', (name,))
            if cursor.fetchone():
                return jsonify({'error': 'A league with this name already exists'}), 400

            logo_url = None
            public_id = None

            if 'logo' in request.files:
                file = request.files['logo']
                if file and file.filename and allowed_file(file.filename):
                    result = cloudinary.uploader.upload(
                        file,
                        folder='league_logos/',
                        transformation=[{'width': 400, 'height': 400, 'crop': 'fill'}]
                    )
                    logo_url = result['secure_url']
                    public_id = result['public_id']

            cursor.execute('''
                INSERT INTO league (name, logo, cloudinary_public_id, website_url)
                VALUES (%s, %s, %s, %s)
            ''', (name, logo_url, public_id, website_url if website_url else None))

            mysql.connection.commit()
            league_id = cursor.lastrowid

            return jsonify({
                'message': 'League created successfully',
                'league': {
                    'id': league_id,
                    'name': name,
                    'logo': logo_url,
                    'website_url': website_url
                }
            }), 201

        except Exception as e:
            print(f"\n!!! ERROR CREATING LEAGUE !!!: {e}")
            mysql.connection.rollback()
            return jsonify({'error': 'Failed to create league'}), 500

        finally:
            cursor.close()

    @app.route('/league/<int:league_id>', methods=['GET'])
    @login_required
    def get_league(league_id):
        """Get a specific league"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute('''
                SELECT id, name, logo, website_url, created_at, updated_at
                FROM league WHERE id = %s
            ''', (league_id,))

            league = cursor.fetchone()
            if not league:
                return jsonify({'error': 'League not found'}), 404

            return jsonify({'league': league}), 200

        except Exception as e:
            print(f"Error fetching league: {e}")
            return jsonify({'error': 'Failed to fetch league'}), 500

        finally:
            cursor.close()

    @app.route('/league/<int:league_id>', methods=['PUT', 'POST'])
    @roles_required('admin', 'developer')
    def update_league(league_id):
        """Update an existing league"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Check if league exists
            cursor.execute('SELECT logo, cloudinary_public_id FROM league WHERE id = %s', (league_id,))
            existing = cursor.fetchone()
            if not existing:
                return jsonify({'error': 'League not found'}), 404

            # Get form data
            name = request.form.get('name', '').strip()
            website_url = request.form.get('website_url', '').strip()

            if not name:
                return jsonify({'error': 'League name is required'}), 400

            # Check if new name conflicts with another league
            cursor.execute('SELECT id FROM league WHERE name = %s AND id != %s', (name, league_id))
            if cursor.fetchone():
                return jsonify({'error': 'A league with this name already exists'}), 400

            # Handle logo upload - store as BLOB
            logo_url = existing['logo']
            public_id = existing['cloudinary_public_id']

            if 'logo' in request.files:
                file = request.files['logo']

                if file and file.filename and allowed_file(file.filename):
                    # Delete old logo from Cloudinary
                    if public_id:
                        cloudinary.uploader.destroy(public_id)

                    # Upload new logo
                    result = cloudinary.uploader.upload(
                        file,
                        folder='league_logos/',
                        transformation=[{'width': 400, 'height': 400, 'crop': 'fill'}]
                    )
                    logo_url = result['secure_url']
                    public_id = result['public_id']

            cursor.execute('''
                            UPDATE league
                            SET name = %s, logo = %s, cloudinary_public_id = %s, website_url = %s
                            WHERE id = %s
                        ''', (name, logo_url, public_id, website_url if website_url else None, league_id))

            mysql.connection.commit()

            print(f"League {league_id} updated successfully")

            return jsonify({
                'message': 'League updated successfully',
                'league': {
                    'id': league_id,
                    'name': name,
                    'logo': logo_url,
                    'website_url': website_url
                }
            }), 200

        except Exception as e:
            print(f"Error updating league: {e}")
            import traceback
            traceback.print_exc()
            mysql.connection.rollback()
            return jsonify({'error': 'Failed to update league'}), 500

        finally:
            cursor.close()

    @app.route('/league/<int:league_id>', methods=['DELETE'])
    @roles_required('admin', 'developer')
    def delete_league(league_id):
        """Delete a league"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            # Check if league exists
            cursor.execute('SELECT name, cloudinary_public_id FROM league WHERE id = %s', (league_id,))
            league = cursor.fetchone()
            if not league:
                return jsonify({'error': 'League not found'}), 404

            # Delete logo from Cloudinary if it exists
            if league['cloudinary_public_id']:
                cloudinary.uploader.destroy(league['cloudinary_public_id'])

            cursor.execute('DELETE FROM league WHERE id = %s', (league_id,))
            mysql.connection.commit()

            return jsonify({'message': 'League deleted successfully'}), 200

        except Exception as e:
            print(f"Error deleting league: {e}")
            mysql.connection.rollback()
            return jsonify({'error': 'Failed to delete league'}), 500

        finally:
            cursor.close()

    @app.route('/league-image/<int:league_id>')
    def league_image(league_id):
        """Redirect to Cloudinary URL instead of serving from DB"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("SELECT logo FROM league WHERE id = %s", (league_id,))
            league = cursor.fetchone()

            if league and league['logo']:
                from flask import redirect
                return redirect(league['logo'])
            else:
                return jsonify({'error': 'Image not found'}), 404

        except Exception as e:
            print(f"Error serving league image: {str(e)}")
            return jsonify({'error': 'Error loading image'}), 500

        finally:
            cursor.close()