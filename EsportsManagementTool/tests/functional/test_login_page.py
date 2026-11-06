"""
This file provides tests for the login page.
"""

from conftest import *
from EsportsManagementTool import app as application


# Checks if the login page is accessible and returns a 200 status code
def test_login_page_loads(client):
    assert client.get("/login").status_code == 200