"""
Helpers for reading test emails from Mailpit (REST API on 127.0.0.1:8025).

The app sends mail to Mailpit when MAILING_MODE=testing (set in conftest.py).
Import from any test with:  from mail_helpers import wait_for_email, first_link
"""

import re
import time

import requests

# 127.0.0.1 (not "localhost") to match docker-compose.test.yml
MAILPIT_API = "http://127.0.0.1:8025/api/v1"
REQUEST_TIMEOUT = 5


def clear_inbox():
    requests.delete(f"{MAILPIT_API}/messages", timeout=REQUEST_TIMEOUT).raise_for_status()

def wait_for_email(to, timeout=10):
    """Return the newest message sent to `to`, polling until `timeout` seconds pass."""
    end = time.time() + timeout
    while time.time() < end:
        resp = requests.get(f"{MAILPIT_API}/search", params={"query": f'to:"{to}"'}, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        hits = resp.json()["messages"]
        if hits:
            msg = requests.get(f"{MAILPIT_API}/message/{hits[0]['ID']}", timeout=REQUEST_TIMEOUT)
            msg.raise_for_status()
            return msg.json()
        time.sleep(0.5)
    raise AssertionError(f"No email arrived for {to} within {timeout}s")

def first_link(message, contains):
    """Return the first URL in the email whose text contains `contains` (e.g. '/verify/')."""
    body = message.get("HTML") or message.get("Text") or ""
    match = re.search(rf'https?://[^\s"<>]*{re.escape(contains)}[^\s"<>]*', body)
    if not match:
        raise AssertionError(f"No link containing {contains!r} found in email {message.get('Subject')!r}")
    return match.group(0)
