from EsportsManagementTool import app, mysql
from flask import render_template, session, redirect, url_for, flash, jsonify
import MySQLdb.cursors

@app.route('/admin-panel')
def admin_panel():
    if 'loggedin' not in session:
        flash('Please log in to access the admin panel', 'error')
        return redirect(url_for('login'))

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    # --- Total Users ---
    cursor.execute("SELECT COUNT(*) AS total_users FROM users")
    total_users = cursor.fetchone()['total_users']

    # --- Active Users ---
    # For now, you can treat all registered users as "active"
    active_users = total_users

    # --- Admins --- WORK IN PROGRESS
    cursor.execute("""
            SELECT COUNT(DISTINCT u.id) AS admins
            FROM users u
            INNER JOIN permissions p ON p.user_id = u.id
            WHERE p.is_admin = 1
        """)
    admins = cursor.fetchone()['admins']

    # --- Game Managers --- WORK IN PROGRESS
    cursor.execute("SELECT COUNT(*) AS gms FROM permissions WHERE is_gm = 1")
    gms = cursor.fetchone()['gms']

    cursor.close()

    # Pass the data into your dashboard template
    return render_template(
        'dashboard.html',
        user={'firstname': session.get('firstname', 'Admin')},
        total_users=total_users,
        active_users=active_users,
        admins=admins,
        gms=gms,
    )


#Provide JSON data endpoint for live updates
@app.route('/api/admin-stats')
def get_admin_stats():
    if 'loggedin' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    cursor.execute("SELECT COUNT(*) AS total_users FROM users")
    total_users = cursor.fetchone()['total_users']

    #WORK IN PROGRESS
    cursor.execute("""
        SELECT COUNT(DISTINCT u.id) AS admins
        FROM users u
        INNER JOIN permissions p ON p.user_id = u.id
        WHERE p.is_admin = 1
    """)
    admins = cursor.fetchone()['admins']

    cursor.execute("SELECT COUNT(*) AS gms FROM permissions WHERE is_gm = 1")
    gms = cursor.fetchone()['gms']

    cursor.close()

    return jsonify({
        'total_users': total_users,
        'admins': admins,
        'gms': gms
    })
