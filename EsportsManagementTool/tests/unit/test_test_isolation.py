"""
Guard-rail tests for the test environment itself (no MySQL or Docker needed).

These do not test application features. They fail if the isolation set up in
tests/conftest.py is removed or stops working, so a future change cannot quietly
let the suite touch real services or real credentials:

  - background schedulers (event notifications, season expiration,
    playoffs reminders) must not run during tests
  - real .env values must not leak into the test process
  - outbound network calls to non-local hosts must be blocked, while localhost stays reachable
  - the `nodb_client` fixture must serve DB-free routes without opening a MySQL connection

If one of these fails, check that the patches in conftest.py still run BEFORE
`from EsportsManagementTool import app`, since the app starts schedulers and
reads .env at import time.
"""

import gc
import os
import socket

import pytest
import requests
from apscheduler.schedulers.background import BackgroundScheduler


# Ensures no background schedulers are running (could interfere with tests)
# Tests will manually trigger any scheduler
def test_no_scheduler_is_running():
    assert [o for o in gc.get_objects() if isinstance(o, BackgroundScheduler) and o.running] == []

# Ensures the app reads fake or missing credentials
# Ensures BUILD_ENV is set to "test"
def test_real_env_values_cannot_leak():
    expected = {
        "BUILD_ENV": "test",
        "CLOUDINARY_API_KEY": "test-key",
        "MASTER_ENCRYPTION_SECRET": "test-master-secret",
        "TWITCH_CLIENT_ID": "test-twitch-id",
        "YOUTUBE_API_KEY": "test-youtube-key",
    }
    for name, value in expected.items():
        assert os.environ.get(name) == value, f"{name} is not the test value"

# Ensures NO .env secret key is being read,
# including variables not being tested
def test_dotenv_files_are_never_loaded(tmp_path, monkeypatch):
    import dotenv
    monkeypatch.delenv("DOTENV_PROBE", raising=False)   # cleanup even if the guard is broken
    env_file = tmp_path / ".env"
    env_file.write_text("DOTENV_PROBE=leaked\n")
    dotenv.load_dotenv(env_file)
    assert "DOTENV_PROBE" not in os.environ

# Ensures only localhost is able to run tests
# Ignores the warning that shows the test passed
@pytest.mark.filterwarnings("ignore:A test tried to use socket.socket.connect:UserWarning")
def test_external_network_is_blocked():
    with pytest.raises(Exception) as exc:
        requests.get("http://93.184.216.34/", timeout=2)   # skips DNS, hits the connect guard
    assert "SocketConnectBlockedError" in repr(exc.value) or "blocked" in str(exc.value).lower()

# Ensures localhost is connected and able to run tests
def test_localhost_is_still_allowed():
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)
    socket.create_connection(("127.0.0.1", srv.getsockname()[1]), timeout=2).close()
    srv.close()

# Ensures unit tests are able to run without needing test DB (Docker containers)
def test_nodb_client_serves_pages_without_a_database(nodb_client):
    assert nodb_client.get("/privacy-policy").status_code == 200
    assert nodb_client.get("/login").status_code == 200
    redirect = nodb_client.get("/dashboard")
    assert redirect.status_code == 302 and "/login" in redirect.headers["Location"]