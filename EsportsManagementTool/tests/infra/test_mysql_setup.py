"""
Infra smoke tests for the dedicated TEST MySQL instance (docker-compose.test.yml).

Ensures test database is healthy, correctly configured, and loaded with the proper schema.

  - server reachable on the host port (default 3307)
  - database `esmt_test` exists
  - `test_user` has ALL privileges on that database only
  - password changes work (old password stops working, new one works)
  - the application schema has been loaded

Run:  python -m pytest tests/infra -v      (Docker services start automatically)

Configuration uses TEST_MYSQL_* names on purpose. Do NOT reuse MYSQL_*: those are
the dev database's variables and a dev .env could point these tests at the wrong server.
"""

import os
import re
import urllib.request

import pymysql
import pytest

pytestmark = pytest.mark.infra

HOST = os.getenv("TEST_MYSQL_HOST", "127.0.0.1")
PORT = int(os.getenv("TEST_MYSQL_PORT", "3307"))
ROOT_USER = "root"
ROOT_PASSWORD = os.getenv("TEST_MYSQL_ROOT_PASSWORD", "test_root_password")
DB_NAME = os.getenv("TEST_MYSQL_DB", "esmt_test")
USER_NAME = os.getenv("TEST_MYSQL_USER", "test_user")
USER_PASSWORD = os.getenv("TEST_MYSQL_USER_PASSWORD", "test_password")
USER_HOST = os.getenv("TEST_MYSQL_USER_HOST", "%")

# Tables the app needs for testing. Extend as the schema grows.
REQUIRED_TABLES = {"users", "verified_users", "permissions", "user_activity"}

MAILPIT_INFO_URL = os.getenv("TEST_MAILPIT_URL", "http://127.0.0.1:8025") + "/api/v1/info"

ACCESS_DENIED = 1045      # wrong password
DB_ACCESS_DENIED = 1044   # no privilege on that database

# --- Safety guards: these tests run ALTER USER and GRANT with root credentials. ---
if HOST not in ("127.0.0.1", "localhost", "::1"):
    raise ValueError(f"Refusing to run infra tests against non-local host {HOST!r}")
if not DB_NAME.endswith("_test"):
    raise ValueError(f"Refusing to run: database {DB_NAME!r} does not end with '_test'")
for _name in (DB_NAME, USER_NAME):
    if not re.fullmatch(r"[A-Za-z0-9_]+", _name):
        raise ValueError(f"Unsafe identifier: {_name!r}")


def connect(user, password, database=None):
    return pymysql.connect(
        host=HOST, port=PORT, user=user, password=password,
        database=database, autocommit=True, connect_timeout=5,
    )


# ----- fixtures -----


@pytest.fixture(scope="module")
def admin(test_services):
    """Root connection. Depends on test_services so Docker is started if needed."""
    try:
        conn = connect(ROOT_USER, ROOT_PASSWORD)
    except pymysql.err.OperationalError as exc:
        pytest.fail(
            f"Cannot connect as {ROOT_USER}@{HOST}:{PORT}: {exc}\n",
            pytrace=False,
        )
    yield conn
    conn.close()


@pytest.fixture(scope="module")
def database(admin, test_database):
    # test_database (conftest) rebuilds the DB from db/test-init/schema.sql first,
    # so the schema test below checks what the suite will really run against.
    with admin.cursor() as cur:
        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`")
    return DB_NAME


@pytest.fixture
def user(admin, database):
    """Ensure test_user exists with the known password and ALL on the test DB (idempotent)."""
    with admin.cursor() as cur:
        cur.execute("CREATE USER IF NOT EXISTS %s@%s IDENTIFIED BY %s", (USER_NAME, USER_HOST, USER_PASSWORD))
        cur.execute("ALTER USER %s@%s IDENTIFIED BY %s", (USER_NAME, USER_HOST, USER_PASSWORD))
        cur.execute(f"GRANT ALL ON `{DB_NAME}`.* TO %s@%s", (USER_NAME, USER_HOST))
    return USER_NAME


# ----- tests -----


def test_server_is_reachable_and_mysql8(admin):
    with admin.cursor() as cur:
        cur.execute("SELECT @@version")
        assert cur.fetchone()[0].startswith("8.")


def test_database_exists(admin, database):
    with admin.cursor() as cur:
        cur.execute("SHOW DATABASES LIKE %s", (DB_NAME,))
        assert cur.fetchone() is not None


def test_user_exists(admin, user):
    with admin.cursor() as cur:
        cur.execute("SELECT 1 FROM mysql.user WHERE user = %s AND host = %s", (USER_NAME, USER_HOST))
        assert cur.fetchone() is not None


def test_user_has_grants_on_database(admin, user):
    with admin.cursor() as cur:
        cur.execute("SHOW GRANTS FOR %s@%s", (USER_NAME, USER_HOST))
        grants = " ".join(row[0] for row in cur.fetchall())
    assert f"`{DB_NAME}`.*" in grants
    assert "ALL PRIVILEGES" in grants


def test_user_can_log_in(user):
    conn = connect(USER_NAME, USER_PASSWORD, DB_NAME)
    with conn.cursor() as cur:
        cur.execute("SELECT CURRENT_USER()")
        assert cur.fetchone()[0].startswith(USER_NAME)
    conn.close()


def test_user_can_create_and_use_tables(user):
    conn = connect(USER_NAME, USER_PASSWORD, DB_NAME)
    with conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS pytest_items")
        cur.execute("CREATE TABLE pytest_items (id INT PRIMARY KEY, name VARCHAR(50))")
        cur.execute("INSERT INTO pytest_items VALUES (1, 'widget')")
        cur.execute("SELECT name FROM pytest_items WHERE id = 1")
        assert cur.fetchone()[0] == "widget"
        cur.execute("DROP TABLE pytest_items")
    conn.close()


def test_user_cannot_access_other_databases(user):
    with pytest.raises(pymysql.err.OperationalError) as exc:
        connect(USER_NAME, USER_PASSWORD, "mysql")
    assert exc.value.args[0] == DB_ACCESS_DENIED


def test_user_cannot_create_other_databases(user):
    conn = connect(USER_NAME, USER_PASSWORD, DB_NAME)
    with conn.cursor() as cur:
        with pytest.raises(pymysql.err.OperationalError) as exc:
            cur.execute("CREATE DATABASE pytest_should_not_exist")
    assert exc.value.args[0] == DB_ACCESS_DENIED
    conn.close()


def test_wrong_password_is_rejected(user):
    with pytest.raises(pymysql.err.OperationalError) as exc:
        connect(USER_NAME, "definitely_wrong_password", DB_NAME)
    assert exc.value.args[0] == ACCESS_DENIED


def test_alter_user_password(admin, user):
    new_password = "a_new_strong_password_123"
    try:
        with admin.cursor() as cur:
            cur.execute("ALTER USER %s@%s IDENTIFIED BY %s", (USER_NAME, USER_HOST, new_password))

        with pytest.raises(pymysql.err.OperationalError) as exc:   # old password stops working
            connect(USER_NAME, USER_PASSWORD, DB_NAME)
        assert exc.value.args[0] == ACCESS_DENIED

        connect(USER_NAME, new_password, DB_NAME).close()          # new one works
    finally:
        with admin.cursor() as cur:                                # restore for other tests and reruns
            cur.execute("ALTER USER %s@%s IDENTIFIED BY %s", (USER_NAME, USER_HOST, USER_PASSWORD))


def test_application_schema_is_loaded(user):
    conn = connect(USER_NAME, USER_PASSWORD, DB_NAME)
    with conn.cursor() as cur:
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = %s", (DB_NAME,))
        found = {row[0].lower() for row in cur.fetchall()}
    conn.close()
    missing = REQUIRED_TABLES - found
    assert not missing, f"Schema not loaded; missing tables: {sorted(missing)}. Regenerate db/test-init/schema.sql (see db/test-init/README.md)."


def test_mailpit_is_reachable(test_services):
    with urllib.request.urlopen(MAILPIT_INFO_URL, timeout=5) as resp:
        assert resp.status == 200