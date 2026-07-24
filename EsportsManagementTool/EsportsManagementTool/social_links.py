"""
Social links module
Handles CRUD operations for the landing page social media links.
Default platform rows are seeded via migration and are protected from full deletion —
"default" status is derived by matching link_name against DEFAULT_SOCIAL_LINK_NAMES,
not stored as a column. Only their `url` can be set/cleared. Custom links can be
fully created/deleted.
"""
from flask import request, jsonify
import MySQLdb.cursors

# The 6 seeded platform names. Matched case-insensitively to determine
# delete-protection and (client-side) icon selection.
DEFAULT_SOCIAL_LINK_NAMES = ['discord', 'instagram', 'youtube', 'twitch', 'twitter', 'tiktok']


def _is_default_link(link_name):
    return link_name.strip().lower() in DEFAULT_SOCIAL_LINK_NAMES


def register_social_link_routes(app, mysql, login_required, roles_required):
    """Register all social-link-related routes"""

    @app.route('/social-links/all', methods=['GET'])
    def get_all_social_links():
        """Get all social links. Public (no login_required) since the landing page renders these for anonymous visitors too."""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute('''
                SELECT link_id, link_name, url
                FROM social_links
                ORDER BY link_id ASC
            ''')

            links = cursor.fetchall()

            # Compute is_default on the fly rather than storing it
            for link in links:
                link['is_default'] = _is_default_link(link['link_name'])

            return jsonify({'links': links}), 200

        except Exception as e:
            print(f"Error fetching social links: {e}")
            return jsonify({'error': 'Failed to fetch social links'}), 500

        finally:
            cursor.close()

    @app.route('/social-links/<int:link_id>/link', methods=['PUT'])
    @roles_required('admin', 'developer')
    def set_social_link_url(link_id):
        """Set (add) the URL on an existing social link row (default or custom)"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            data = request.get_json(silent=True) or {}
            url = (data.get('url') or '').strip()

            if not url:
                return jsonify({'error': 'A link URL is required'}), 400

            if not url.startswith('http://') and not url.startswith('https://'):
                url = f'https://{url}'

            cursor.execute('SELECT link_id FROM social_links WHERE link_id = %s', (link_id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Social link not found'}), 404

            cursor.execute('UPDATE social_links SET url = %s WHERE link_id = %s', (url, link_id))
            mysql.connection.commit()

            return jsonify({'message': 'Link updated successfully', 'url': url}), 200

        except Exception as e:
            print(f"Error setting social link url: {e}")
            mysql.connection.rollback()
            return jsonify({'error': 'Failed to update link'}), 500

        finally:
            cursor.close()

    @app.route('/social-links/<int:link_id>/link', methods=['DELETE'])
    @roles_required('admin', 'developer')
    def clear_social_link_url(link_id):
        """Clear the URL on a social link row without deleting the row itself (used for default platforms)"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute('SELECT link_id FROM social_links WHERE link_id = %s', (link_id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Social link not found'}), 404

            cursor.execute('UPDATE social_links SET url = NULL WHERE link_id = %s', (link_id,))
            mysql.connection.commit()

            return jsonify({'message': 'Link removed successfully'}), 200

        except Exception as e:
            print(f"Error clearing social link url: {e}")
            mysql.connection.rollback()
            return jsonify({'error': 'Failed to remove link'}), 500

        finally:
            cursor.close()

    @app.route('/social-links/create', methods=['POST'])
    @roles_required('admin', 'developer')
    def create_custom_social_link():
        """Create a new custom social link"""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            data = request.get_json(silent=True) or {}
            link_name = (data.get('link_name') or '').strip()
            url = (data.get('url') or '').strip()

            if not link_name or not url:
                return jsonify({'error': 'A name and URL are required'}), 400

            if _is_default_link(link_name):
                return jsonify({'error': 'That name is reserved for a default platform'}), 400

            if not url.startswith('http://') and not url.startswith('https://'):
                url = f'https://{url}'

            cursor.execute('''
                INSERT INTO social_links (link_name, url)
                VALUES (%s, %s)
            ''', (link_name, url))

            mysql.connection.commit()
            link_id = cursor.lastrowid

            return jsonify({
                'message': 'Custom link created successfully',
                'link': {
                    'link_id': link_id,
                    'link_name': link_name,
                    'url': url,
                    'is_default': False
                }
            }), 201

        except Exception as e:
            print(f"Error creating custom social link: {e}")
            mysql.connection.rollback()
            return jsonify({'error': 'Failed to create custom link'}), 500

        finally:
            cursor.close()

    @app.route('/social-links/<int:link_id>', methods=['DELETE'])
    @roles_required('admin', 'developer')
    def delete_social_link(link_id):
        """Fully delete a social link row. Default platforms cannot be deleted, only cleared."""
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

        try:
            cursor.execute('SELECT link_name FROM social_links WHERE link_id = %s', (link_id,))
            existing = cursor.fetchone()

            if not existing:
                return jsonify({'error': 'Social link not found'}), 404

            if _is_default_link(existing['link_name']):
                return jsonify({'error': 'Default platform links cannot be deleted, only their URL can be removed'}), 400

            cursor.execute('DELETE FROM social_links WHERE link_id = %s', (link_id,))
            mysql.connection.commit()

            return jsonify({'message': 'Custom link deleted successfully'}), 200

        except Exception as e:
            print(f"Error deleting social link: {e}")
            mysql.connection.rollback()
            return jsonify({'error': 'Failed to delete link'}), 500

        finally:
            cursor.close()