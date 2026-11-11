"""
E2E-AU | Auth & Session Journeys

Scope rule for this file: a test here exists because it needs a rendered page, JavaScript,
several pages in a row, or an email.

Input-validation matrices (bad password, expired
token, 405 on GET /logout, ...) live in FN-EC-01..04 and UT-01/UT-05, NOT here.
"""

import secrets
import time

from playwright.sync_api import expect

from e2e.ui import add_cookie, expect_path, expect_toast, get_cookie, login_via_form, open_dashboard_tab
from factories import count_rows, create_user, fetch_one, suspend_user
from mail_helpers import first_link, wait_for_email


# --- helpers ---
def _register(page, *, username="newplayer", email="newplayer@go.stockton.edu",
              password="Passw0rd!test", confirm=None, firstname="New", lastname="Player"):
    """Fill and submit the real /register form."""
    page.goto("/register")
    page.locator("#firstname").fill(firstname)
    page.locator("#lastname").fill(lastname)
    page.locator("#username").fill(username)
    page.locator("#email").fill(email)
    page.locator("#password").fill(password)
    page.locator("#passwordconfirm").fill(password if confirm is None else confirm)
    page.get_by_role("button", name="Create Account").click()

def _request_reset_link(page, user):
    """Use the 'Forgot password?' modal and return the link from the Mailpit email."""
    page.goto("/login")
    page.get_by_role("link", name="Forgot password?").click()
    expect(page.locator("#forgot-modal")).to_be_visible()
    page.locator("#reset-email").fill(user.email)
    page.get_by_role("button", name="Send Reset Link").click()
    expect_toast(page, "If that email is registered")     # also our "request finished" sync point
    return first_link(wait_for_email(user.email), "/reset-password/")


# AU-01
# GET / - logged-out vs logged-in landing page; remember_token auto-login; suspended token
def test_e2e_au_01_logged_out_visitor_sees_get_started_and_sign_in(page):
    page.goto("/")

    expect(page.get_by_role("link", name="Get Started")).to_be_visible()
    expect(page.get_by_role("link", name="Sign In")).to_be_visible()
    expect(page.get_by_role("link", name="Go to Dashboard")).to_have_count(0)

def test_e2e_au_01_logged_in_user_sees_dashboard_link_and_username(page, db, login_as):
    user = create_user(db, "alice")
    login_as(page.context, user)

    page.goto("/")

    expect(page.get_by_role("link", name="Go to Dashboard").first).to_be_visible()
    expect(page.locator(".user-info")).to_have_text("Welcome back, alice")
    expect(page.get_by_role("heading", name="Welcome Back, alice!")).to_be_visible()
    expect(page.get_by_role("link", name="Get Started")).to_have_count(0)

def test_e2e_au_01_valid_remember_cookie_logs_the_user_in(page, db, base_url):
    token = secrets.token_urlsafe(32)
    create_user(db, "alice", remember_token=token)
    add_cookie(page.context, base_url, "remember_token", token)

    page.goto("/")

    expect(page.get_by_role("link", name="Go to Dashboard").first).to_be_visible()
    expect(page.locator(".user-info")).to_have_text("Welcome back, alice")
    page.goto("/dashboard")
    expect_path(page, "/dashboard")

def test_e2e_au_01_remember_cookie_of_a_suspended_user_does_not_log_in(page, db, base_url):
    token = secrets.token_urlsafe(32)
    user = create_user(db, "alice", remember_token=token)
    suspend_user(db, user)
    add_cookie(page.context, base_url, "remember_token", token)

    page.goto("/")

    expect(page.get_by_role("link", name="Get Started")).to_be_visible()
    expect(page.get_by_role("link", name="Go to Dashboard")).to_have_count(0)
    page.goto("/dashboard")
    expect_path(page, "/login")

def test_e2e_au_01_unknown_remember_cookie_is_ignored(page, base_url):
    add_cookie(page.context, base_url, "remember_token", secrets.token_urlsafe(32))

    page.goto("/")

    expect(page.get_by_role("link", name="Get Started")).to_be_visible()


# AU-02
# GET, POST /login - valid, unverified, suspended, remember-me checked / unchecked
def test_e2e_au_02_valid_login_lands_on_dashboard(page, db):
    user = create_user(db, "alice")

    login_via_form(page, user.username, user.password)

    expect_path(page, "/dashboard")
    expect(page.locator(".user-info")).to_have_text("Welcome back, alice")

def test_e2e_au_02_unverified_account_gets_a_new_verification_email_and_no_session(page, db):
    user = create_user(db, "alice", verified=False)

    login_via_form(page, user.username, user.password)

    expect(page.locator(".error-message")).to_have_text("Email sent.")
    message = wait_for_email(user.email)
    assert message["Subject"] == "Verify Your Stockton University Email Account"
    link = first_link(message, "/verify/")
    stored = fetch_one(db, "SELECT verification_token FROM verified_users WHERE userid = %s", user.id)
    assert stored["verification_token"] and stored["verification_token"] in link

    page.goto("/dashboard")
    expect_path(page, "/login")

def test_e2e_au_02_suspended_account_sees_lockout_message_and_no_session(page, db):
    user = create_user(db, "alice")
    suspend_user(db, user, hours=50)

    login_via_form(page, user.username, user.password)

    error = page.locator(".error-message")
    expect(error).to_contain_text("Your account has been Locked out")
    expect(error).to_contain_text("Time remaining")
    page.goto("/dashboard")
    expect_path(page, "/login")

def test_e2e_au_02_remember_me_checked_sets_a_30_day_cookie(page, db):
    user = create_user(db, "alice")

    login_via_form(page, user.username, user.password, remember=True)

    expect_path(page, "/dashboard")
    cookie = get_cookie(page.context, "remember_token")
    assert cookie and cookie["value"], "remember_token cookie was not set"
    assert cookie["httpOnly"] is True
    assert abs(cookie["expires"] - (time.time() + 30 * 24 * 3600)) < 300     # ~30 days
    stored = fetch_one(db, "SELECT remember_token FROM users WHERE id = %s", user.id)
    assert stored["remember_token"] == cookie["value"]

def test_e2e_au_02_remember_me_unchecked_clears_an_existing_token(page, db, base_url):
    user = create_user(db, "alice", remember_token="stale-token")
    add_cookie(page.context, base_url, "remember_token", "stale-token")

    login_via_form(page, user.username, user.password, remember=False)

    expect_path(page, "/dashboard")
    assert get_cookie(page.context, "remember_token") is None
    stored = fetch_one(db, "SELECT remember_token FROM users WHERE id = %s", user.id)
    assert stored["remember_token"] is None


# AU-03
# POST /logout - nav button returns to /login; Back cannot reopen a protected page
def test_e2e_au_03_logout_returns_to_login_and_back_does_not_reopen_dashboard(page, db, login_as):
    user = create_user(db, "alice")
    login_as(page.context, user)
    page.goto("/dashboard")
    expect_path(page, "/dashboard")

    page.locator("nav.navbar").get_by_role("button", name="Logout").click()

    expect_path(page, "/login")
    expect_toast(page, "Successfully logged out.")

    page.go_back()

    expect_path(page, "/login")
    expect(page.locator("nav.navbar").get_by_role("button", name="Logout")).to_have_count(0)


# AU-04
# GET, POST /register - success message + email; one validation failure renders an error
def test_e2e_au_04_valid_stockton_registration_shows_success_and_sends_verification_email(page, db):
    _register(page, username="newplayer", email="newplayer@go.stockton.edu")

    expect(page.locator(".message.success")).to_contain_text("successfully created an account")
    message = wait_for_email("newplayer@go.stockton.edu")
    assert message["Subject"] == "Verify Your Stockton University Email Account"
    first_link(message, "/verify/") # raises if the link is missing
    row = fetch_one(
        db,
        "SELECT vu.is_verified FROM verified_users vu JOIN users u ON u.id = vu.userid "
        "WHERE u.username = %s", "newplayer",
    )
    assert row["is_verified"] == 0 # created, but not usable until verified

def test_e2e_au_04_non_stockton_email_renders_an_error_and_creates_nothing(page, db):
    _register(page, username="outsider", email="outsider@gmail.com")

    expect(page.locator(".message.error")).to_contain_text("Stockton email address")
    assert count_rows(db, "users") == 0


# AU-05
# GET /verify/<token> - register -> email link -> /login success flash -> log in
def test_e2e_au_05_verification_link_verifies_the_account_and_login_then_works(page, db):
    username, email, password = "newplayer", "newplayer@go.stockton.edu", "Passw0rd!test"
    _register(page, username=username, email=email, password=password)
    expect(page.locator(".message.success")).to_be_visible()
    link = first_link(wait_for_email(email), "/verify/")

    page.goto(link)

    expect_path(page, "/login")
    expect_toast(page, "Email is successfully verified")
    login_via_form(page, username, password)
    expect_path(page, "/dashboard")


# AU-06
# POST /forgot-password - modal on the login page; reset email arrives in Mailpit
def test_e2e_au_06_forgot_password_modal_sends_a_reset_email(page, db):
    user = create_user(db, "alice")

    link = _request_reset_link(page, user)

    expect(page.locator("#forgot-modal")).to_be_hidden()
    message = wait_for_email(user.email)
    assert message["Subject"] == "Reset Your Esports Vantage Password"
    stored = fetch_one(db, "SELECT reset_token FROM user_password_reset WHERE userid = %s", user.id)
    assert stored["reset_token"] in link


# AU-07
# GET, POST /reset-password/<token> - follow link, set password, old fails, new works
def test_e2e_au_07_reset_link_sets_a_new_password_old_one_stops_working(page, db):
    user = create_user(db, "alice", password="OldPassw0rd!")
    new_password = "BrandNewPassw0rd!"
    link = _request_reset_link(page, user)

    page.goto(link)
    expect(page.locator(".username-badge")).to_contain_text("alice")
    page.locator("#password").fill(new_password)
    page.locator("#confirm_password").fill(new_password)
    page.get_by_role("button", name="Set New Password").click()

    expect_path(page, "/login")
    expect_toast(page, "Your password has been reset")

    login_via_form(page, user.username, "OldPassw0rd!")
    expect(page.locator(".error-message")).to_have_text("Incorrect username/password!")

    login_via_form(page, user.username, new_password)
    expect_path(page, "/dashboard")


# AU-08
# (No endpoints) - two browsers: admin suspends a logged-in user; kicked on next click
def test_e2e_au_08_admin_suspends_a_logged_in_user_who_is_kicked_on_the_next_click(
        page, new_page, db, login_as):
    admin = create_user(db, "admin1", roles=("admin",))
    victim = create_user(db, "victim1")

    # Person 1 (user): login, then kicked
    login_via_form(page, victim.username, victim.password)
    expect_path(page, "/dashboard")
    page.wait_for_load_state("networkidle")
    time.sleep(1.1)

    # Person 2 (admin): kicks user
    admin_page = new_page()
    login_as(admin_page.context, admin)
    open_dashboard_tab(admin_page, "admin")
    admin_page.locator("#userSearch").fill(victim.username)
    admin_page.locator(f".user-item[data-username='{victim.username}']").click()
    admin_page.locator("#userDetailsPanel").get_by_role("button", name="Lock out User").click()
    expect(admin_page.locator("#suspendUserModal")).to_be_visible()
    admin_page.locator("#suspendUserForm button[type='submit']").click()
    expect_toast(admin_page, "has been locked out")

    # Person 1: any server request is the next click
    page.locator("a.navbar-brand").click()

    expect_path(page, "/login")
    expect_toast(page, "You have been locked out")
