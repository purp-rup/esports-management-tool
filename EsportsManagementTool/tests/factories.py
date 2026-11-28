"""
Database seeding helpers for tests.

RULES
    * Pure SQL through the `db` fixture connection (pymysql, autocommit on).
    * No imports from the app: factories must keep working even if app code moves.
    * Every datetime written here is *Eastern wall-clock time*.
      The app runs `SET time_zone` to the Eastern offset on
      every request and writes `datetime.now(EST)`.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import bcrypt

EASTERN = ZoneInfo("America/New_York")
DEFAULT_PASSWORD = "Passw0rd!test"

# role name used in tests -> column in `permissions`
ROLE_COLUMNS = {
    "admin": "is_admin",
    "developer": "is_developer",
    "gm": "is_gm",
    "player": "is_player",
}


def est_now() -> datetime:
    """Naive Eastern wall-clock 'now', matching what MySQL's NOW() returns inside the app."""
    return datetime.now(EASTERN).replace(tzinfo=None)


@dataclass
class User:
    """What a test needs to know about a seeded user."""
    id: int
    username: str
    password: str # plaintext
    email: str
    firstname: str
    lastname: str

def create_user(
    db,
    username: str,
    *,
    password: str = DEFAULT_PASSWORD,
    email: str | None = None,
    firstname: str = "Test",
    lastname: str = "User",
    verified: bool = True,
    roles: tuple[str, ...] = (),
    remember_token: str | None = None,
    verification_token: str | None = None,
    token_expiry: datetime | None = None,
) -> User:
    """
    Insert a complete user.
    """
    unknown = set(roles) - set(ROLE_COLUMNS)
    if unknown:
        raise ValueError(f"Unknown role(s) {sorted(unknown)}; expected {sorted(ROLE_COLUMNS)}")

    email = email or f"{username}@go.stockton.edu".lower()

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=4)).decode("utf-8")

    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO users (firstname, lastname, username, password, email, remember_token) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (firstname, lastname, username, hashed, email, remember_token),
        )
        user_id = cur.lastrowid

        cur.execute(
            "INSERT INTO verified_users (userid, is_verified, verification_token, token_expiry) "
            "VALUES (%s, %s, %s, %s)",
            (user_id, 1 if verified else 0, verification_token, token_expiry),
        )

        flags = {column: int(role in roles) for role, column in ROLE_COLUMNS.items()}
        cur.execute(
            "INSERT INTO permissions (userid, is_admin, is_developer, is_gm, is_player) "
            "VALUES (%s, %s, %s, %s, %s)",
            (user_id, flags["is_admin"], flags["is_developer"], flags["is_gm"], flags["is_player"]),
        )

        cur.execute(
            "INSERT INTO user_activity (userid, is_active, last_seen) VALUES (%s, 0, NULL)",
            (user_id,),
        )

    return User(user_id, username, password, email, firstname, lastname)

def suspend_user(db, user: User, *, hours: float = 48, by: User | None = None) -> None:
    """
    Create an active suspension ending `hours` from now minus the session invalidation,
    which only matters for already-logged-in users.
    """
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO user_suspensions (user_id, suspended_until, suspended_by, is_active) "
            "VALUES (%s, %s, %s, 1)",
            (user.id, est_now() + timedelta(hours=hours), by.id if by else None),
        )

def fetch_one(db, sql: str, *params):
    """Run a SELECT and return the first row as a dict (or None). For asserting on DB state."""
    with db.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()

def count_rows(db, table: str, where: str = "1=1", *params) -> int:
    """SELECT COUNT(*) for `table`."""
    row = fetch_one(db, f"SELECT COUNT(*) AS n FROM `{table}` WHERE {where}", *params)
    return row["n"]

## --- landing page content (events, streams, photos) ---
def create_game(db, title: str = "Test Game") -> int:
    """Insert a minimal community (games row) and return its id. Scheduled events need one."""
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO games (GameTitle, Description, TeamSizes) VALUES (%s, %s, %s)",
            (title, "Test description", "1"),
        )
        return cur.lastrowid

def create_schedule(db, creator: User, game_id: int, name: str, *, on: date,
                    visibility: str = "all_members") -> int:
    """
    Insert a one-time scheduled_events row and return its id. Only exists so a generalevents
    row can point at it: the calendar's visibility filter reads visibility from this table.
    """
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO scheduled_events (game_id, event_name, event_type, specific_date, "
            "start_time, end_time, frequency, visibility, schedule_end_date, schedule_start_date, "
            "created_by, is_active) "
            "VALUES (%s, %s, 'Misc', %s, '18:00:00', '20:00:00', 'Once', %s, %s, %s, %s, 1)",
            (game_id, name, on, visibility, on, on, creator.id),
        )
        return cur.lastrowid

def create_event(db, creator: User, name: str, *, on: date, start: str = "18:00:00",
                 end: str = "20:00:00", event_type: str = "Event", location: str = "Esports Lab",
                 description: str = "", schedule_id: int | None = None) -> int:
    """
    Insert one calendar event (generalevents row) and return its id.
    `schedule_id=None` -> a standalone event, visible to everyone.
    `schedule_id=<id>` -> a scheduled occurrence; visibility then comes from that schedule.
    """
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO generalevents (EventName, Date, StartTime, EndTime, Description, "
            "EventType, Location, created_by, schedule_id, is_scheduled) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (name, on, start, end, description, event_type, location, creator.id,
             schedule_id, 1 if schedule_id else 0),
        )
        return cur.lastrowid

def create_stream(db, name: str, *, on: date, at: str = "19:00:00", platform: str = "twitch",
                  hidden: bool = False) -> int:
    """Insert a stream_schedule row (hidden=True is how the app 'deletes' a stream)."""
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO stream_schedule (stream_name, stream_date, stream_time, platform, hidden) "
            "VALUES (%s, %s, %s, %s, %s)",
            (name, on, at, platform, 1 if hidden else 0),
        )
        return cur.lastrowid

def create_photo(db, url: str, *, hidden: bool = False) -> int:
    """Insert a photo_upload row for the landing gallery (stub URL; Cloudinary is never called)."""
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO photo_upload (photo_url, cloudinary_public_id, is_hidden) "
            "VALUES (%s, %s, %s)",
            (url, f"test/{abs(hash(url))}", 1 if hidden else 0),
        )
        return cur.lastrowid
