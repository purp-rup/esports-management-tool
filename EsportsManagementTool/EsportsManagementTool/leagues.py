"""
League management module
Handles CRUD operations for leagues
Stores images as BLOB data (matching games pattern)
"""
from flask import request, jsonify, send_file
from werkzeug.utils import secure_filename
import MySQLdb.cursors
from io import BytesIO
from datetime import datetime

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    if not filename:
        return False
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def register_league_routes(app, mysql, login_required, roles_required, get_user_permissions):
    """Register all league-related routes"""

    @app.route('/league/all', methods=['GET'])
    @login_required
    def get_all_leagues():
        """Get all leagues"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute('''
                SELECT id, name, website_url, created_at, updated_at,
                       CASE WHEN logo IS NOT NULL THEN 1 ELSE 0 END as has_logo
                FROM league
                ORDER BY name ASC
            ''')

            leagues = cursor.fetchall()

            # Add logo URL for frontend
            for league in leagues:
                league['logo'] = f'/league-image/{league["id"]}' if league['has_logo'] else None
                del league['has_logo']

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

            # Handle logo upload - store as BLOB
            logo_data = None
            logo_mime_type = None

            if 'logo' in request.files:
                file = request.files['logo']
                print(f"File object: {file}")
                print(f"Filename: {file.filename}")
                print(f"Content type: {file.content_type}")

                if file and file.filename:
                    print(f"File has filename, checking if allowed...")
                    if allowed_file(file.filename):
                        print(f"File is allowed, reading data...")
                        # Read file as binary data
                        logo_data = file.read()
                        logo_mime_type = file.content_type
                        print(f"Logo data read: {len(logo_data)} bytes")
                        print(f"MIME type: {logo_mime_type}")
                    else:
                        print(f"File NOT allowed: {file.filename}")
                else:
                    print("File object has no filename")
            else:
                print("No 'logo' key in request.files")

            # Check if league name already exists
            cursor.execute('SELECT id FROM league WHERE name = %s', (name,))
            if cursor.fetchone():
                return jsonify({'error': 'A league with this name already exists'}), 400

            # Insert into database
            print(f"\n=== INSERTING INTO DATABASE ===")
            print(f"Name: {name}")
            print(f"Logo data: {'YES (' + str(len(logo_data)) + ' bytes)' if logo_data else 'NO'}")
            print(f"Logo MIME: {logo_mime_type}")
            print(f"Website URL: {website_url if website_url else 'NULL'}")

            cursor.execute('''
                INSERT INTO league (name, logo, logo_mime_type, website_url)
                VALUES (%s, %s, %s, %s)
            ''', (name, logo_data, logo_mime_type, website_url if website_url else None))

            mysql.connection.commit()
            league_id = cursor.lastrowid

            print(f"\n=== INSERT SUCCESSFUL ===")
            print(f"League ID: {league_id}")

            # Verify what was inserted
            cursor.execute('SELECT name, LENGTH(logo) as logo_size, logo_mime_type, website_url FROM league WHERE id = %s', (league_id,))
            verify = cursor.fetchone()
            print(f"\n=== VERIFICATION ===")
            print(f"Name in DB: {verify['name']}")
            print(f"Logo size in DB: {verify['logo_size']} bytes")
            print(f"MIME in DB: {verify['logo_mime_type']}")
            print(f"URL in DB: {verify['website_url']}")
            print("=" * 50 + "\n")

            return jsonify({
                'message': 'League created successfully',
                'league': {
                    'id': league_id,
                    'name': name,
                    'logo': f'/league-image/{league_id}' if logo_data else None,
                    'website_url': website_url
                }
            }), 201

        except Exception as e:
            print(f"\n!!! ERROR CREATING LEAGUE !!!")
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            print("=" * 50 + "\n")
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
                SELECT id, name, website_url, created_at, updated_at,
                       CASE WHEN logo IS NOT NULL THEN 1 ELSE 0 END as has_logo
                FROM league
                WHERE id = %s
            ''', (league_id,))

            league = cursor.fetchone()
            if not league:
                return jsonify({'error': 'League not found'}), 404

            # Add logo URL
            league['logo'] = f'/league-image/{league["id"]}' if league['has_logo'] else None
            del league['has_logo']

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
            cursor.execute('SELECT logo FROM league WHERE id = %s', (league_id,))
            existing = cursor.fetchone()
            if not existing:
                return jsonify({'error': 'League not found'}), 404

            # Get form data
            name = request.form.get('name', '').strip()
            website_url = request.form.get('website_url', '').strip()

            print(f"Updating league {league_id}: name={name}, website_url={website_url}")

            if not name:
                return jsonify({'error': 'League name is required'}), 400

            # Check if new name conflicts with another league
            cursor.execute('SELECT id FROM league WHERE name = %s AND id != %s', (name, league_id))
            if cursor.fetchone():
                return jsonify({'error': 'A league with this name already exists'}), 400

            # Handle logo upload - store as BLOB
            logo_data = existing['logo']  # Keep existing by default
            logo_mime_type = None

            if 'logo' in request.files:
                file = request.files['logo']
                print(f"New file received: {file.filename if file else 'None'}")

                if file and file.filename and allowed_file(file.filename):
                    # Read new file as binary data
                    logo_data = file.read()
                    logo_mime_type = file.content_type
                    print(f"New logo data size: {len(logo_data)} bytes, MIME: {logo_mime_type}")
                else:
                    print("File validation failed")

            # Update database
            if logo_mime_type:
                # Update with new logo
                cursor.execute('''
                    UPDATE league
                    SET name = %s, logo = %s, logo_mime_type = %s, website_url = %s
                    WHERE id = %s
                ''', (name, logo_data, logo_mime_type, website_url if website_url else None, league_id))
            else:
                # Update without changing logo
                cursor.execute('''
                    UPDATE league
                    SET name = %s, website_url = %s
                    WHERE id = %s
                ''', (name, website_url if website_url else None, league_id))

            mysql.connection.commit()

            print(f"League {league_id} updated successfully")

            return jsonify({
                'message': 'League updated successfully',
                'league': {
                    'id': league_id,
                    'name': name,
                    'logo': f'/league-image/{league_id}' if logo_data else None,
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
            cursor.execute('SELECT name FROM league WHERE id = %s', (league_id,))
            league = cursor.fetchone()
            if not league:
                return jsonify({'error': 'League not found'}), 404

            # Delete from database (BLOB is automatically deleted)
            cursor.execute('DELETE FROM league WHERE id = %s', (league_id,))
            mysql.connection.commit()

            print(f"League {league_id} deleted successfully")

            return jsonify({'message': 'League deleted successfully'}), 200

        except Exception as e:
            print(f"Error deleting league: {e}")
            mysql.connection.rollback()
            return jsonify({'error': 'Failed to delete league'}), 500

        finally:
            cursor.close()

    @app.route('/league-image/<int:league_id>')
    def league_image(league_id):
        """Serve the league logo from the database (matching /game-image pattern)"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute("SELECT logo, logo_mime_type FROM league WHERE id = %s", (league_id,))
            league = cursor.fetchone()

            if league and league['logo']:
                return send_file(
                    BytesIO(league['logo']),
                    mimetype=league['logo_mime_type'] or 'image/png',
                    as_attachment=False,
                    download_name=f'league_{league_id}.png'
                )
            else:
                return jsonify({'error': 'Image not found'}), 404

        except Exception as e:
            print(f"Error serving league image: {str(e)}")
            return jsonify({'error': 'Error loading image'}), 500

        finally:
            cursor.close()