"""
This file provides fixtures for testing the EsMT application.
These fixtures set up the testing environment and provide a test
client for making requests to the application.
"""
import pytest
from EsportsManagementTool import app as application

# Initializes the application for testing
@pytest.fixture()
def app():
    app = application
    app.config.update({
        "TESTING": True,
    })
    yield app

# Provides a test client for making requests to the application
@pytest.fixture()
def client(app):
    return app.test_client()

# Provides a test runner for executing CLI commands in the application
@pytest.fixture()
def runner(app):
    return app.test_cli_runner()
