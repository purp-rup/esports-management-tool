"""
Small, shared browser helpers for E2E tests (plain functions, not fixtures).
"""

import re

from playwright.sync_api import BrowserContext, Page, expect


def add_cookie(context: BrowserContext, base_url: str, name: str, value: str) -> None:
    """Put a cookie into a browser context for the app under test."""
    context.add_cookies([{"name": name, "value": value, "url": base_url}])

def get_cookie(context: BrowserContext, name: str) -> dict | None:
    """Return the named cookie from the browser's jar, or None if it is not there."""
    return next((c for c in context.cookies() if c["name"] == name), None)

def login_via_form(page: Page, username: str, password: str, *, remember: bool = False) -> None:
    """Drive the real /login form. Use only in tests that are about logging in."""
    page.goto("/login")
    page.locator("#username").fill(username)
    page.locator("#password").fill(password)
    if remember:
        page.locator("#remember").check()
    page.get_by_role("button", name="Sign In").click()

def expect_path(page: Page, path: str) -> None:
    """Assert the browser is on `path`, ignoring any query string."""
    expect(page).to_have_url(re.compile(rf"{re.escape(path)}/?(\?.*)?$"))

def expect_toast(page: Page, text: str) -> None:
    """
    Assert a toast notification containing `text` is shown.
    """
    expect(page.get_by_text(text).first).to_be_visible()

def open_dashboard_tab(page: Page, tab: str) -> None:
    """
    Go to /dashboard and switch to `tab` ('calendar', 'profile', 'rosters', 'events',
    'teams' or 'admin'), then confirm it is really showing.

    Use this helper for every dashboard tab switch instead of clicking tabs directly.
    """
    page.goto("/dashboard")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(250)  # > the 100 ms startup timer above
    page.locator(f"#mainTabNavigation .tab-button[data-tab='{tab}']").click()
    expect(page.locator(f"#{tab}.tab-content")).to_have_class(re.compile(r"\bactive\b"))