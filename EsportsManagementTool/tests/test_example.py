"""
This file provides an example for testing the EsMT application.
"""
from conftest import *
from EsportsManagementTool import app as application

# Checks if the login page is accessible and returns a 200 status code
def test_request_example(client):
    response = client.get("/login")
    assert response.status_code == 200
