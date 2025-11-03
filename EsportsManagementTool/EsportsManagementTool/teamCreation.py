from EsportsManagementTool import app, mysql, login_required, roles_required, get_user_permissions, has_role
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_mysqldb import MySQL
from flask_mail import Mail, Message
from datetime import datetime
import calendar as cal
import MySQLdb.cursors
import re
import bcrypt
import secrets
from dotenv import load_dotenv
import os
import requests
from datetime import datetime, timedelta
from functools import wraps


@app.route('/create-team', methods=['POST', 'GET'])
@roles_required('admin', 'gm')
def create_team():

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    try:
        callout = print("yay!")
        ##i have no idea what to do here for now. Working laptop only sucks.

        cursor.execute('SELECT GameTitle FROM games')
        games = cursor.fetchall()
        return f"Here are the games: {games}"

    finally:
        cursor.close()


@app.route('/delete-team', methods=['POST'])
@roles_required('admin', 'gm')
def delete_team():
    if 'loggedin' not in session:
        return jsonify({'success': False, 'message': 'Unauthorized - Please log in'}), 401

    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    return print("hello!")
