import dataclasses

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture()
def client(tmp_path):
    settings = dataclasses.replace(get_settings(), cache_file=tmp_path / "cache.json")
    with TestClient(create_app(settings)) as c:
        yield c


def daily(client, uid="user-abc-123", **params):
    params = {"uid": uid, "date": "2026-10-11", **params}
    return client.get("/api/daily", params=params)


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["quotes"] >= 50


def test_moods(client):
    body = client.get("/api/moods").json()
    assert len(body["moods"]) == 6
    assert any(c["id"] == "calm" for c in body["categories"])


def test_daily_shape(client):
    r = daily(client, mood="anxious")
    assert r.status_code == 200
    body = r.json()
    assert body["quote"]["text"] and body["quote"]["author"]
    assert body["tip"]
    assert body["mood"] == "anxious"


def test_daily_is_stable_for_same_person_and_day(client):
    a = daily(client, mood="tired").json()["quote"]["id"]
    b = daily(client, mood="tired").json()["quote"]["id"]
    assert a == b


def test_different_people_get_different_quotes(client):
    ids = {daily(client, uid=f"person-{i:03d}", mood="energized").json()["quote"]["id"] for i in range(40)}
    assert len(ids) > 10


def test_different_days_give_different_quotes(client):
    from app.picker import pick_quote

    quotes = client.app.state.store.all()
    picked = {pick_quote(quotes, "same-user-1", f"2026-10-{d:02d}", "energized")[0]["id"] for d in range(1, 21)}
    assert len(picked) > 8


def test_mood_matches_categories(client):
    from app.moods import MOODS
    for mood, info in MOODS.items():
        q = daily(client, mood=mood).json()["quote"]
        assert set(q["categories"]) & set(info["categories"])


def test_interests_are_respected(client):
    q = daily(client, mood="energized", interests="success").json()["quote"]
    assert "success" in q["categories"]


def test_unknown_mood_falls_back(client):
    assert daily(client, mood="nonsense").json()["mood"] == "energized"


def test_bad_uid_rejected(client):
    assert client.get("/api/daily", params={"uid": "x"}).status_code == 422
    assert client.get("/api/daily", params={"uid": "bad uid!!"}).status_code == 422


def test_bad_date_rejected(client):
    assert client.get("/api/daily", params={"uid": "user-abc-123", "date": "2026-13-45"}).status_code == 400


def test_exclude_recent(client):
    first = daily(client, mood="calm").json()["quote"]["id"]
    again = daily(client, mood="calm", exclude=first).json()["quote"]["id"]
    assert first != again


def test_random_endpoint(client):
    r = client.get("/api/random", params={"uid": "user-abc-123", "mood": "stuck", "nonce": "1"})
    assert r.status_code == 200
    assert r.json()["quote"]["text"]


def test_index_and_static(client):
    assert client.get("/").status_code == 200
    assert client.get("/static/js/cards.js").status_code == 200
    assert client.get("/static/js/app.js").status_code == 200
    assert client.get("/static/css/style.css").status_code == 200


def test_api_not_cached(client):
    assert client.get("/api/health").headers["cache-control"] == "no-store"
