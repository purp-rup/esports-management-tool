"""
E2E-LP | Landing Page

Scope rule for this file: a test here exists because it needs a rendered page, JavaScript,
several pages in a row, or an email.

Server-side edge cases (bad query params, API errors, etc.) live in FN tests.
"""

import importlib
from datetime import date, datetime
from types import SimpleNamespace

import pytest
from playwright.sync_api import expect

from e2e.ui import stub_twitch_sdk
from factories import (EASTERN, create_event, create_game, create_photo, create_schedule,
                       create_stream, create_user, est_now)


# --- helpers ---
def _first_of_month(offset: int = 0) -> date:
    """First day of the current Eastern month, moved by `offset` months (-1 = last month)."""
    today = est_now().date()
    index = today.year * 12 + (today.month - 1) + offset
    return date(index // 12, index % 12 + 1, 1)

def _freeze_browser_clock(page, day: date) -> None:
    """
    Pin the browser's 'today' to noon Eastern on `day`. calendar.js moves months with
    setMonth(), which misbehaves on the 29th-31st, so navigation tests must not depend on
    the real date they happen to run on.
    """
    page.clock.set_fixed_time(datetime(day.year, day.month, day.day, 12, tzinfo=EASTERN))

def _day_titles(page, day: date):
    """Locator for the titles of the event pills in one calendar day cell."""
    return page.locator(f"#events-{day.isoformat()} .event-title")

def _seed_visibility_events(db):
    """
    Three events today, in time order: a standalone one (public), a scheduled one that is
    'all_members' (public) and a scheduled one that is 'team' (restricted to the schedule's
    creator here, since nobody is on a team). Returns the schedule creator.
    """
    today = est_now().date()
    owner = create_user(db, "organizer")
    game_id = create_game(db)
    create_event(db, owner, "Open Scrim", on=today, start="09:00:00", end="10:00:00")
    open_schedule = create_schedule(db, owner, game_id, "Weekly Open", on=today)
    create_event(db, owner, "Weekly Open", on=today, start="10:00:00", end="11:00:00",
                 schedule_id=open_schedule)
    team_schedule = create_schedule(db, owner, game_id, "Team Practice", on=today,
                                    visibility="team")
    create_event(db, owner, "Team Practice", on=today, start="11:00:00", end="12:00:00",
                 schedule_id=team_schedule)
    return owner

@pytest.fixture
def fake_twitch(monkeypatch):
    """
    Replaces the HTTP client used by /api/twitch-status, so no real Twitch call is made.
    Tests set: .live (bool), .archive_id (latest broadcast id or None), .fail (API down).
    The route caches its answer for 2 minutes in module globals, so those are reset too or
    one test's answer would leak into the next.
    """

    index = importlib.import_module("EsportsManagementTool.index")

    twitch = SimpleNamespace(live=False, archive_id=None, fail=False)

    class _Response:
        def __init__(self, body):
            self._body = body
        def json(self):
            return self._body
        def raise_for_status(self):
            pass

    def fake_post(url, **kwargs):       # oauth token request
        if twitch.fail:
            raise RuntimeError("twitch is down")
        return _Response({"access_token": "test-token", "expires_in": 3600})

    def fake_get(url, **kwargs):        # helix streams / users / videos
        if twitch.fail:
            raise RuntimeError("twitch is down")
        if url.endswith("/streams"):
            return _Response({"data": [{"id": "1"}] if twitch.live else []})
        if url.endswith("/users"):
            return _Response({"data": [{"id": "42"}]})
        if url.endswith("/videos"):
            return _Response({"data": [{"id": twitch.archive_id}] if twitch.archive_id else []})
        raise AssertionError(f"unexpected Twitch URL: {url}")

    monkeypatch.setattr(index, "http_req", SimpleNamespace(post=fake_post, get=fake_get))
    monkeypatch.setitem(index._status_cache, "data", None)
    monkeypatch.setitem(index._status_cache, "expires_at", 0)
    monkeypatch.setitem(index._token_cache, "value", None)
    monkeypatch.setitem(index._token_cache, "expires_at", 0)
    monkeypatch.setitem(index._user_id_cache, "value", None)
    return twitch


# LP-01
# GET /api/calendar/events - events render; prev / next month; anonymous vs logged-in visibility
def test_e2e_lp_01_events_render_on_the_calendar_and_in_todays_list(page, db):
    today = est_now().date()
    organizer = create_user(db, "organizer")
    create_event(db, organizer, "Scrim Night", on=today, event_type="Match")

    page.goto("/")

    expect(page.locator("#currentMonthYear")).to_have_text(today.strftime("%B %Y"))
    pill = page.locator(f"#events-{today.isoformat()} .event")
    expect(pill).to_have_count(1)
    expect(pill.locator(".event-title")).to_have_text("Scrim Night")
    expect(pill).to_have_attribute("data-event-type", "match")
    expect(page.locator("#todayEventsList .today-event-title")).to_have_text("Scrim Night")

def test_e2e_lp_01_prev_and_next_month_load_that_months_events(page, db):
    this_month, next_month, last_month = _first_of_month(0), _first_of_month(1), _first_of_month(-1)
    this_day, next_day, last_day = (this_month.replace(day=15), next_month.replace(day=10),
                                    last_month.replace(day=10))
    organizer = create_user(db, "organizer")
    create_event(db, organizer, "This Month Event", on=this_day)
    create_event(db, organizer, "Next Month Event", on=next_day)
    create_event(db, organizer, "Last Month Event", on=last_day)
    _freeze_browser_clock(page, this_day)
    header = page.locator("#currentMonthYear")

    page.goto("/")
    expect(header).to_have_text(this_month.strftime("%B %Y"))
    expect(_day_titles(page, this_day)).to_have_text("This Month Event")

    page.locator("#nextMonth").click()
    expect(header).to_have_text(next_month.strftime("%B %Y"))
    expect(_day_titles(page, next_day)).to_have_text("Next Month Event")
    expect(page.locator(f"#events-{this_day.isoformat()}")).to_have_count(0)

    page.locator("#prevMonth").click()
    page.locator("#prevMonth").click()
    expect(header).to_have_text(last_month.strftime("%B %Y"))
    expect(_day_titles(page, last_day)).to_have_text("Last Month Event")

# Known bug: calendar.js uses setMonth(getMonth() + 1) on a Date that is still on the 31st,
# so Jan 31 -> "Feb 31" -> Mar 3 and February is skipped. strict=True turns this red the day it
# is fixed, which is the cue to delete the marker.
@pytest.mark.xfail(strict=True, reason="calendar.js setMonth() overflows on the 29th-31st")
def test_e2e_lp_01_next_month_from_the_31st_does_not_skip_a_month(page):
    page.clock.set_fixed_time(datetime(2027, 1, 31, 12, tzinfo=EASTERN))

    page.goto("/")
    page.locator("#nextMonth").click()

    expect(page.locator("#currentMonthYear")).to_have_text("February 2027")

def test_e2e_lp_01_anonymous_visitor_sees_only_public_events(page, db):
    _seed_visibility_events(db)

    page.goto("/")

    expect(_day_titles(page, est_now().date())).to_have_text(["Open Scrim", "Weekly Open"])

def test_e2e_lp_01_logged_in_non_member_does_not_see_team_only_events(page, db, login_as):
    _seed_visibility_events(db)
    outsider = create_user(db, "outsider")
    login_as(page.context, outsider)

    page.goto("/")

    expect(_day_titles(page, est_now().date())).to_have_text(["Open Scrim", "Weekly Open"])

def test_e2e_lp_01_schedule_creator_also_sees_their_team_only_events(page, db, login_as):
    owner = _seed_visibility_events(db)
    login_as(page.context, owner)

    page.goto("/")

    expect(_day_titles(page, est_now().date())).to_have_text(
        ["Open Scrim", "Weekly Open", "Team Practice"])


# LP-02
# GET /api/events/<event_id> - clicking a calendar event opens its details popup
def test_e2e_lp_02_clicking_an_event_opens_its_details(page, db):
    today = est_now().date()
    organizer = create_user(db, "organizer")
    create_event(db, organizer, "Scrim Night", on=today, start="18:00:00", end="20:00:00",
                 event_type="Match", location="Esports Lab", description="Bring your own mouse")
    page.goto("/")

    page.locator(f"#events-{today.isoformat()} .event", has_text="Scrim Night").click()

    popup = page.locator("#landingEventPopup")
    expect(popup.locator(".popup-title")).to_have_text("Scrim Night")
    expect(popup).to_have_attribute("data-event-type", "match")
    expect(popup).to_contain_text(f"{today:%A}, {today:%B} {today.day}, {today.year}")
    expect(popup).to_contain_text("6:00 PM - 8:00 PM")
    expect(popup).to_contain_text("Esports Lab")
    expect(popup).to_contain_text("Bring your own mouse")

def test_e2e_lp_02_anonymous_popup_offers_login_to_subscribe(page, db):
    today = est_now().date()
    create_event(db, create_user(db, "organizer"), "Scrim Night", on=today)
    page.goto("/")

    page.locator(f"#events-{today.isoformat()} .event").click()

    popup = page.locator("#landingEventPopup")
    expect(popup.get_by_role("link", name="Login to Subscribe")).to_be_visible()
    expect(popup.locator("#notificationBtn")).to_have_count(0)

def test_e2e_lp_02_logged_in_popup_offers_the_subscribe_button(page, db, login_as):
    today = est_now().date()
    create_event(db, create_user(db, "organizer"), "Scrim Night", on=today)
    login_as(page.context, create_user(db, "alice"))
    page.goto("/")

    page.locator(f"#events-{today.isoformat()} .event").click()

    expect(page.locator("#landingEventPopup #notificationBtn")).to_be_visible()

def test_e2e_lp_02_clicking_outside_closes_the_popup(page, db):
    today = est_now().date()
    create_event(db, create_user(db, "organizer"), "Scrim Night", on=today)
    page.goto("/")
    page.locator(f"#events-{today.isoformat()} .event").click()
    expect(page.locator("#landingEventPopup .popup-title")).to_be_visible()  # loaded = handler armed

    page.locator("#currentMonthYear").click()

    expect(page.locator("#landingEventPopup")).to_have_count(0)


# LP-03
# GET /api/streams/upcoming - sidebar lists upcoming streams; empty state
def test_e2e_lp_03_sidebar_lists_upcoming_streams_in_chronological_order(page, db):
    today = est_now().date()
    create_stream(db, "Later Stream", on=today, at="21:00:00",
                  platform="youtube")
    create_stream(db, "Earlier Stream", on=today, at="18:00:00", platform="twitch")
    page.goto("/")

    expect(page.locator("#streamScheduleSidebar")).to_be_visible()
    rows = page.locator("#streamList .stream-row")
    expect(rows.locator(".stream-name")).to_have_text(["Earlier Stream", "Later Stream"])
    expect(rows.nth(0).locator(".fa-twitch")).to_be_visible()
    expect(rows.nth(1).locator(".fa-youtube")).to_be_visible()

def test_e2e_lp_03_past_and_removed_streams_are_not_listed(page, db):
    today = est_now().date()
    yesterday = date.fromordinal(today.toordinal() - 1)
    create_stream(db, "Upcoming Stream", on=today)
    create_stream(db, "Old Stream", on=yesterday)
    create_stream(db, "Removed Stream", on=today, hidden=True)
    page.goto("/")

    expect(page.locator("#streamList .stream-name")).to_have_text("Upcoming Stream")

def test_e2e_lp_03_sidebar_is_hidden_when_there_are_no_streams(page):
    page.goto("/")
    page.wait_for_load_state("networkidle")

    expect(page.locator("#streamScheduleSidebar")).to_be_hidden()


# LP-04
# GET /api/twitch-status - live embed; latest broadcast; channel page; API down
def test_e2e_lp_04_live_channel_shows_the_live_embed(page, fake_twitch):
    fake_twitch.live = True
    stub_twitch_sdk(page)

    page.goto("/")

    expect(page.locator("#twitchContainer")).to_be_visible()
    expect(page.locator("#twitchEmbed")).to_have_attribute("data-channel", "stocktonesports")
    expect(page.locator("#twitchEmbed")).to_have_attribute("data-video", "")
    expect(page.locator("#twitchLiveIndicator")).to_have_text("")

def test_e2e_lp_04_offline_channel_shows_the_latest_broadcast(page, fake_twitch):
    fake_twitch.archive_id = "9001"
    stub_twitch_sdk(page)

    page.goto("/")

    expect(page.locator("#twitchContainer")).to_be_visible()
    expect(page.locator("#twitchEmbed")).to_have_attribute("data-video", "9001")
    expect(page.locator("#twitchEmbed")).to_have_attribute("data-channel", "")

def test_e2e_lp_04_offline_channel_without_an_archive_shows_the_channel_page(page, fake_twitch):
    stub_twitch_sdk(page)

    page.goto("/")

    expect(page.locator("#twitchContainer")).to_be_visible()
    expect(page.locator("#twitchEmbed")).to_have_attribute("data-channel", "stocktonesports")
    expect(page.locator("#twitchLiveIndicator")).to_have_text("Stockton Esports on Twitch")

def test_e2e_lp_04_embed_stays_hidden_when_twitch_is_unavailable(page, fake_twitch):
    fake_twitch.fail = True
    stub_twitch_sdk(page)

    page.goto("/")
    page.wait_for_load_state("networkidle")

    expect(page.locator("#twitchContainer")).to_be_hidden()


# LP-05
# GET /api/landing/photos - gallery strip renders; empty state
def test_e2e_lp_05_gallery_strip_renders_every_visible_photo(page, db):
    urls = [f"https://example.test/gallery/{n}.png" for n in range(3)]
    for url in urls:
        create_photo(db, url)
    create_photo(db, "https://example.test/gallery/hidden.png", hidden=True)

    page.goto("/")

    expect(page.locator("#landingGalleryStrip")).to_be_visible()
    slides = page.locator("#landingGalleryTrack img")
    expect(slides).to_have_count(len(urls) * 2)         # sequence is doubled for a seamless loop
    shown = slides.evaluate_all("els => els.map(e => e.getAttribute('src'))")
    assert sorted(shown[:len(urls)]) == sorted(urls)     # hidden photo is not in it
    assert shown[len(urls):] == shown[:len(urls)]        # second half repeats the first

def test_e2e_lp_05_gallery_strip_is_hidden_when_there_are_no_photos(page):
    page.goto("/")
    page.wait_for_load_state("networkidle")

    expect(page.locator("#landingGalleryStrip")).to_be_hidden()