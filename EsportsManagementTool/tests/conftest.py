"""
This file provides fixtures for testing the EsMT application.
These fixtures set up the testing environment and provide a test
client for making requests to the application.

Test services (MySQL on 3307, Mailpit on 1025/8025) are defined in
docker-compose.test.yml and are started automatically by the `test_services`
fixture the first time a test needs the app or the database.
Unit tests that never touch `app` do not start Docker.

Fixture chain (each session):
    test_services  -> docker compose up --wait, then waits for Mailpit
    test_database  -> requires db/test-init/schema.sql (exits with instructions if it is missing),
                      drops and recreates `esmt_test`, ensures `test_user`,
                      loads the schema (structure only), then checks tables were created

Opt-in data helpers: `db` (raw connection) and `clean_db` (empty tables first).
"""

import pytest
import pymysql
import os
import shutil
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

from db_schema import assert_safe_target, load_schema

TEST_DB_HOST = os.getenv("TEST_MYSQL_HOST", "127.0.0.1")
TEST_DB_PORT = int(os.getenv("TEST_MYSQL_PORT", "3307"))
TEST_DB_NAME = os.getenv("TEST_MYSQL_DB", "esmt_test")
TEST_DB_USER = os.getenv("TEST_MYSQL_USER", "test_user")
TEST_DB_PASSWORD = os.getenv("TEST_MYSQL_USER_PASSWORD", "test_password")
TEST_DB_ROOT_PASSWORD = os.getenv("TEST_MYSQL_ROOT_PASSWORD", "test_root_password")
TEST_DB_USER_HOST = os.getenv("TEST_MYSQL_USER_HOST", "%")

assert_safe_target(TEST_DB_HOST, TEST_DB_NAME)   # fail at import, before anything can connect

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = REPO_ROOT / "docker-compose.test.yml"
SCHEMA_FILE = REPO_ROOT / "db" / "test-init" / "schema.sql"
MAILPIT_INFO_URL = "http://127.0.0.1:8025/api/v1/info"

# Runs before the app starts
# Updates env for test environment
os.environ.update({
    "FLASK_SECRET_KEY": "test-secret-key",
    "MYSQL_HOST": TEST_DB_HOST,
    "MYSQL_USER": TEST_DB_USER,
    "MYSQL_PASSWORD": TEST_DB_PASSWORD,
    "MYSQL_DB": TEST_DB_NAME,
    "AWS_REGION": "us-east-2",
    "DYNAMODB_TABLE": "esmt-test-chat",
    "AWS_ACCESS_KEY_ID": "testing",
    "AWS_SECRET_ACCESS_KEY": "testing",
    "MAILING_MODE": "testing",
    "MAIL_DEFAULT_SENDER": "test@example.com",
})

from werkzeug.serving import make_server
from EsportsManagementTool import app as application


def _wait_for_mailpit(timeout=20):
    """Mailpit has no Docker healthcheck, so poll its API until it answers."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(MAILPIT_INFO_URL, timeout=2):
                return
        except OSError:
            time.sleep(0.5)
    pytest.exit(f"Mailpit did not respond at {MAILPIT_INFO_URL} within {timeout}s", returncode=2)


# Starts MySQL + Mailpit once per test session, only if a test needs them
@pytest.fixture(scope="session")
def test_services():
    if not shutil.which("docker"):
        pytest.exit("Docker is required to run the tests but was not found on PATH. "
                    "Install and start Docker, then re-run.", returncode=2)
    compose = ["docker", "compose", "-f", str(COMPOSE_FILE)]
    result = subprocess.run(compose + ["up", "-d", "--wait"], capture_output=True, text=True)
    if result.returncode != 0:
        pytest.exit(f"Could not start test services:\n{result.stderr}", returncode=2)
    _wait_for_mailpit()
    yield
    subprocess.run(compose + ["down", "-v"], check=False)   # always clean up, pass or fail


def _connect(user, password, database=None, attempts=30):
    """Connect to the test MySQL, retrying briefly (covers slow CI service startup)."""
    last = None
    for _ in range(attempts):
        try:
            return pymysql.connect(
                host=TEST_DB_HOST, port=TEST_DB_PORT, user=user, password=password,
                database=database, autocommit=True, connect_timeout=5,
            )
        except pymysql.err.OperationalError as exc:
            last = exc
            time.sleep(1)
    pytest.exit(f"Cannot connect to test MySQL as {user}@{TEST_DB_HOST}:{TEST_DB_PORT}: {last}", returncode=2)


# Builds a fresh, schema-only copy of the app database once per test session.
# Source of truth is db/test-init/schema.sql (see db/test-init/README.md).
@pytest.fixture(scope="session")
def test_database(test_services):
    if not SCHEMA_FILE.exists():
        pytest.exit(
            f"Missing {SCHEMA_FILE}.\n"
            "It is gitignored on purpose (it describes the production DB layout).\n"
            "Generate it from the source DB (structure only):\n"
            "    docker compose --profile tools run --rm dump-test-schema\n"
            "See db/test-init/README.md.",
            returncode=2,
        )
    root = _connect("root", TEST_DB_ROOT_PASSWORD)
    try:
        with root.cursor() as cur:
            # DROP + CREATE (rather than "IF NOT EXISTS") so every session starts
            # empty and always matches the current schema.sql, even if the
            # container was left running from a previous session.
            cur.execute(f"DROP DATABASE IF EXISTS `{TEST_DB_NAME}`")
            cur.execute(f"CREATE DATABASE `{TEST_DB_NAME}` CHARACTER SET utf8mb4")
            # Idempotent. Grants survive DROP DATABASE, but this also covers a
            # service container that was started without MYSQL_USER.
            cur.execute("CREATE USER IF NOT EXISTS %s@%s IDENTIFIED BY %s",
                        (TEST_DB_USER, TEST_DB_USER_HOST, TEST_DB_PASSWORD))
            cur.execute(f"GRANT ALL ON `{TEST_DB_NAME}`.* TO %s@%s", (TEST_DB_USER, TEST_DB_USER_HOST))
            cur.execute(f"USE `{TEST_DB_NAME}`")
        load_schema(root, SCHEMA_FILE)
        with root.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = %s",
                        (TEST_DB_NAME,))
            if cur.fetchone()[0] == 0:
                pytest.exit(f"{SCHEMA_FILE.name} loaded but created no tables. Is it empty?", returncode=2)
    finally:
        root.close()
    yield TEST_DB_NAME


# Initializes the application for testing
@pytest.fixture(scope="session")
def app(test_database):
    application.config.update(
        TESTING=True,
        SESSION_COOKIE_SECURE=False,  # tests run over http
        MYSQL_CUSTOM_OPTIONS={"ssl_mode": "DISABLED"},  # local test DB w/o SSL
        MYSQL_PORT=TEST_DB_PORT,
    )
    assert application.config["MYSQL_PORT"] == TEST_DB_PORT
    assert_safe_target(application.config["MYSQL_HOST"], application.config["MYSQL_DB"])
    yield application


# Runs the app on a free port for the browser
@pytest.fixture(scope="session")
def live_server(app):
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    thread.join()


# Lets pytest use page.goto('/login') with relative paths
@pytest.fixture(scope="session")
def base_url(live_server):
    return live_server


# Tag tests by folder so pytest runs without decorators
def pytest_collection_modifyitems(items):
    for item in items:
        for name in ("unit", "functional", "e2e"):
            if name in item.path.parts:
                item.add_marker(name)


# --- CUSTOM FIXTURES ---

# Test client for making requests without a browser
@pytest.fixture()
def client(app):
    return app.test_client()

# Raw connection to the test DB (as test_user) for arranging/inspecting rows.
# autocommit is on so the live_server thread sees writes immediately.
@pytest.fixture()
def db(test_database):
    conn = pymysql.connect(
        host=TEST_DB_HOST, port=TEST_DB_PORT, user=TEST_DB_USER, password=TEST_DB_PASSWORD,
        database=TEST_DB_NAME, autocommit=True, cursorclass=pymysql.cursors.DictCursor,
    )
    yield conn
    conn.close()

# Opt-in: empties every table before the test, then hands back a connection.
@pytest.fixture()
def clean_db(db):
    with db.cursor() as cur:
        cur.execute("SELECT table_name AS t FROM information_schema.tables "
                    "WHERE table_schema = %s AND table_type = 'BASE TABLE'", (TEST_DB_NAME,))
        tables = [row["t"] for row in cur.fetchall()]
        cur.execute("SET FOREIGN_KEY_CHECKS=0")
        for table in tables:
            cur.execute(f"TRUNCATE TABLE `{table}`")
        cur.execute("SET FOREIGN_KEY_CHECKS=1")
    return db