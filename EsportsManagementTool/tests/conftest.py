"""
This file provides fixtures for testing the EsMT application.
These fixtures set up the testing environment and provide a test
client for making requests to the application.
"""

import pytest
import os
import threading

# Runs before the app starts
# Updates env for test environment
os.environ.update({
    "FLASK_SECRET_KEY": "test-secret-key",
    "MYSQL_HOST": "localhost",
    "MYSQL_USER": "test_user",
    "MYSQL_PASSWORD": "test_password",
    "MYSQL_DB": "esmt_test",
    "AWS_REGION": "us-east-2",
    "DYNAMODB_TABLE": "esmt-test-chat",
    "AWS_ACCESS_KEY_ID": "testing",
    "AWS_SECRET_ACCESS_KEY": "testing",
    "MAILING_MODE": "testing",
    "MAIL_DEFAULT_SENDER": "test@example.com",
})

from werkzeug.serving import make_server
from EsportsManagementTool import app as application


# Initializes the application for testing
@pytest.fixture(scope="session")
def app():
    application.config.update(
        TESTING=True,
        SESSION_COOKIE_SECURE=False,  # tests run over http
        MYSQL_CUSTOM_OPTIONS={"ssl_mode": "DISABLED"},  # local test DB w/o SSL
    )
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

