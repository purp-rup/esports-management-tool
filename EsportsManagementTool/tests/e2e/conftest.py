"""
Fixtures that apply ONLY to tests under tests/e2e/.

Inherited from tests/conftest.py (do not redefine):
    live_server / base_url  real Flask app on a free port
    db / clean_db           raw MySQL connection to the test DB / emptied tables
    inbox                   emptied Mailpit inbox
    mock_cloudinary         autouse; uploads/destroys are faked
Inherited from pytest-playwright:
    page, context, browser, new_context, browser_context_args
"""

from datetime import datetime
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import pytest
from flask.sessions import SecureCookieSessionInterface

LOCAL_HOSTS = {"127.0.0.1", "localhost"}


# browser setup
@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    """
    Pin the things that change what the page shows.
      * viewport  - desktop layout
      * locale    - date/number formatting
      * timezone  - the app is Eastern-time everywhere; calendar tests need the same clock
    """
    return {
        **browser_context_args,
        "viewport": {"width": 1280, "height": 800},
        "locale": "en-US",
        "timezone_id": "America/New_York",
    }

def _only_local(route):
    """Allow the app, refuse everything else."""
    if urlparse(route.request.url).hostname in LOCAL_HOSTS:
        route.continue_()
    else:
        route.abort()


@pytest.fixture(autouse=True)
def hermetic_browser(context):
    """
    pytest-socket only polices the *Python* process. Chromium is a separate process.

    Tests that genuinely need a third-party asset opt in by registering a more specific
    `page.route(...)` that serves a local stub.
    """
    context.route("**/*", _only_local)


@pytest.fixture
def new_page(new_context):
    """
    Factory for an extra, isolated browser "person": own cookies, own session, same
    hermetic rules and viewport. `page` is person #1; call `new_page()` for person #2.
    """
    def _make():
        extra_context = new_context()
        extra_context.route("**/*", _only_local)
        return extra_context.new_page()
    return _make


# state / isolation
@pytest.fixture(autouse=True)
def isolated_state(clean_db, inbox):
    """
    Every E2E test starts from: all tables empty, Mailpit inbox empty.
    """
    yield clean_db


# authentication
@pytest.fixture
def login_as(app, base_url):
    """
    Log a seeded user into a browser context without visiting /login.

        login_as(page.context, admin)
        page.goto("/dashboard")
    """
    serializer = SecureCookieSessionInterface().get_signing_serializer(app)
    eastern = ZoneInfo("America/New_York")

    def _login(context, user):
        payload = {
            "loggedin": True,
            "id": user.id,
            "username": user.username,
            "login_time": datetime.now(eastern).isoformat(),
        }
        context.add_cookies([{
            "name": "session",
            "value": serializer.dumps(payload),
            "url": base_url,
        }])

    return _login