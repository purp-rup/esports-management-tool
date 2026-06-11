"""
Tournament Results Notification Scheduler
Sends email reminders to Game Managers to record tournament results
"""
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from EsportsManagementTool import email_manager
import MySQLdb.cursors


def initialize_tournament_scheduler(app, mysql):
    """
    Initialize the tournament notification scheduler
    Runs daily to check and send reminders
    """
    scheduler = BackgroundScheduler()
    
    # Run daily at 9:00 AM
    scheduler.add_job(
        func=lambda: check_and_send_reminders(app, mysql),
        trigger=CronTrigger(hour=9, minute=0),
        id='tournament_reminders',
        name='Send tournament result reminders to GMs',
        replace_existing=True
    )
    
    scheduler.start()
    print("Tournament notification scheduler initialized")
    
    # Shutdown scheduler when app closes
    import atexit
    atexit.register(lambda: scheduler.shutdown())

def check_and_send_reminders(app, mysql):
    """
    Check for seasons nearing end and send reminders to GMs
    
    Reminder schedule:
    - One reminder at exactly 21 days before end
    - One reminder at exactly 7 days before end
    - Daily reminders for last 3 days
    """
    with app.app_context():
        cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
        
        try:
            # Get active seasons within 21 days of ending
            cursor.execute("""
                SELECT season_id, season_name, end_date
                FROM seasons
                WHERE is_active = 1
                AND end_date >= CURDATE()
                AND end_date <= DATE_ADD(CURDATE(), INTERVAL 21 DAY)
            """)
            
            seasons = cursor.fetchall()
            
            for season in seasons:
                season_id = season['season_id']
                season_name = season['season_name']
                end_date = season['end_date']
                days_until_end = (end_date - datetime.now().date()).days
                
                print(f"Checking reminders for {season_name} - {days_until_end} days until end")
                
                # Send reminders:
                # - Exactly 21 days out, exactly 7 days out, last 3 days
                should_send = days_until_end <= 3 or days_until_end == 7 or days_until_end == 21
                
                if should_send:
                    send_season_reminders(mysql, season_id, season_name, end_date, days_until_end)
                    
        except Exception as e:
            print(f"Error in tournament reminder scheduler: {str(e)}")
        finally:
            cursor.close()

def send_season_reminders(mysql, season_id, season_name, end_date, days_until_end):
    """
    Send reminders to all GMs who haven't completed their tournament results
    """
    cursor = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    
    try:
        # Get GMs who manage games with teams in this season and haven't completed results
        cursor.execute("""
            SELECT DISTINCT
                u.id as gm_id,
                u.email,
                u.firstname,
                g.GameID,
                g.GameTitle
            FROM users u
            JOIN permissions p ON u.id = p.userid
            JOIN games g ON g.gm_id = u.id
            JOIN teams t ON t.gameID = g.GameID
            WHERE p.is_gm = 1
            AND t.season_id = %s
            AND NOT EXISTS (
                SELECT 1 
                FROM tournament_result_notifications trn
                WHERE trn.gm_id = u.id 
                AND trn.season_id = %s
                AND trn.game_id = g.GameID
                AND trn.is_completed = TRUE
            )
            GROUP BY u.id, u.email, u.firstname, g.GameID, g.GameTitle
        """, (season_id, season_id))
        
        gms = cursor.fetchall()
        
        for gm in gms:
            gm_id = gm['gm_id']
            game_id = gm['GameID']
            
            # Check if GM has pending results for this game
            cursor.execute("""
                SELECT COUNT(DISTINCT t.teamID) as pending_count
                FROM teams t
                JOIN team_leagues tl ON t.teamID = tl.team_id
                LEFT JOIN tournament_results tr ON (
                    tr.team_id = t.teamID 
                    AND tr.league_id = tl.league_id 
                    AND tr.season_id = %s
                )
                WHERE t.season_id = %s
                AND t.gameID = %s
                AND tr.result_id IS NULL
            """, (season_id, season_id, game_id))
            
            result = cursor.fetchone()
            pending_count = result['pending_count']
            
            if pending_count > 0:
                # Check last reminder sent
                cursor.execute("""
                    SELECT last_reminder_sent, reminder_count
                    FROM tournament_result_notifications
                    WHERE gm_id = %s AND season_id = %s AND game_id = %s
                """, (gm_id, season_id, game_id))
                
                notification_record = cursor.fetchone()

                if notification_record:
                    last_sent = notification_record['last_reminder_sent']
                    if last_sent and (datetime.now() - last_sent).days < 1:
                        continue  # Already sent today, skip

                # Send email
                email_manager.send_reminder_email(
                    gm['email'], 
                    gm['firstname'],
                    season_name,
                    gm['GameTitle'],
                    pending_count,
                    days_until_end
                )
                
                # Update or create notification record
                if notification_record:
                    cursor.execute("""
                        UPDATE tournament_result_notifications
                        SET last_reminder_sent = NOW(),
                            reminder_count = reminder_count + 1
                        WHERE gm_id = %s AND season_id = %s AND game_id = %s
                    """, (gm_id, season_id, game_id))
                else:
                    cursor.execute("""
                        INSERT INTO tournament_result_notifications
                        (gm_id, season_id, game_id, last_reminder_sent, reminder_count)
                        VALUES (%s, %s, %s, NOW(), 1)
                    """, (gm_id, season_id, game_id))
                
                mysql.connection.commit()
                print(f"Sent reminder to {gm['email']} for {gm['GameTitle']}")
                
    except Exception as e:
        print(f"Error sending season reminders: {str(e)}")
    finally:
        cursor.close()
