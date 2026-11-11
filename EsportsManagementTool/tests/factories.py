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
from datetime import datetime, timedelta
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