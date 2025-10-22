from flask import render_template, redirect, url_for, session, flash
from datetime import datetime
import calendar as cal
import MySQLdb.cursors
#Claude AI assisted in the creation of this file

def register_calendar_routes(app, mysql):
    """Register calendar routes with the Flask app"""
    
    @app.route('/calendar')
    @app.route('/calendar/<int:year>/<int:month>')
    def calendar(year=None, month=None):
        
        # Default to current month/year if not specified
        if year is None or month is None:
            today = datetime.now()
            year = today.year
            month = today.month
        
        # Validate month and year
        if month < 1 or month > 12:
            flash('Invalid month!')
            return redirect(url_for('calendar'))
        if year < 1900 or year > 2100:
            flash('Year must be between 1900 and 2100!')
            return redirect(url_for('calendar'))
        
        # Get today's date for highlighting
        today = datetime.now()
        today_str = today.strftime('%Y-%m-%d')
        
        # Get calendar information
        cal.setfirstweekday(cal.SUNDAY)
        month_calendar = cal.monthcalendar(year, month)
        month_name = cal.month_name[month]
        
        # Calculate previous and next month
        if month == 1:
            prev_month = 12
            prev_year = year - 1
        else:
            prev_month = month - 1
            prev_year = year
        
        if month == 12:
            next_month = 1
            next_year = year + 1
        else:
            next_month = month + 1
            next_year = year
        
        # Get events from database for this month
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        try:
            # Get events for the current month
            cursor.execute(
                'SELECT * FROM generalevents WHERE YEAR(Date) = %s AND MONTH(Date) = %s ORDER BY Date, StartTime',
                (year, month)
            )
            events = cursor.fetchall()
            
            # Organize events by date
            events_by_date = {}
            for event in events:
                date_str = event['Date'].strftime('%Y-%m-%d')
                
                # Handle timedelta for StartTime
                if event['StartTime']:
                    total_seconds = int(event['StartTime'].total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    time_str = f"{hours:02d}:{minutes:02d}"
                else:
                    time_str = None
                
                event_data = {
                    'id': event['EventID'],
                    'time': time_str,
                    'title': event['EventName'],
                    'description': event['Description'] if event['Description'] else ''
                }
                
                if date_str not in events_by_date:
                    events_by_date[date_str] = []
                events_by_date[date_str].append(event_data)
            
            return render_template(
                "calendar.html",
                month_calendar=month_calendar,
                month_name=month_name,
                year=year,
                month=month,
                events_by_date=events_by_date,
                today_str=today_str,
                prev_year=prev_year,
                prev_month=prev_month,
                next_year=next_year,
                next_month=next_month
            )
        
        finally:
            cursor.close()
    # Replaced with API calls in __init__.py for Event Details Modals in dashboard.html
    # @app.route('/event/<int:event_id>')
    # def event_details(event_id):
    #     cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    #     try:
    #         cursor.execute('SELECT * FROM generalevents WHERE EventID = %s', (event_id,))
    #         event = cursor.fetchone()
    #
    #         if not event:
    #             flash('Event not found!')
    #             return redirect(url_for('calendar'))
    #
    #         # Format the event data
    #         event_data = {
    #             'id': event['EventID'],
    #             'name': event['EventName'],
    #             'date': event['Date'].strftime('%B %d, %Y'),  # e.g., "October 22, 2025"
    #             'start_time': None,
    #             'end_time': None,
    #             'description': event['Description'] if event['Description'] else 'No description provided',
    #             'event_type': event['EventType'] if event['EventType'] else 'General',
    #             'game': event['Game'] if event['Game'] else 'N/A',
    #             'location': event['Location'] if event['Location'] else 'TBD'
    #         }
    #
    #         # Handle timedelta for StartTime
    #         if event['StartTime']:
    #             total_seconds = int(event['StartTime'].total_seconds())
    #             hours = total_seconds // 3600
    #             minutes = (total_seconds % 3600) // 60
    #             event_data['start_time'] = f"{hours:02d}:{minutes:02d}"
    #
    #         # Handle timedelta for EndTime
    #         if event['EndTime']:
    #             total_seconds = int(event['EndTime'].total_seconds())
    #             hours = total_seconds // 3600
    #             minutes = (total_seconds % 3600) // 60
    #             event_data['end_time'] = f"{hours:02d}:{minutes:02d}"
    #
    #         return render_template('event-details.html', event=event_data)
    #     finally:
    #         cursor.close()
