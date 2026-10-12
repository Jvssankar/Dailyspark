import dataclasses
import json

from app import sources
from app.classifier import classify, is_wholesome, quote_id
from app.config import get_settings
from app.store import QuoteStore


def test_classify_picks_expected_categories():
    assert "calm" in classify("Find peace and quiet in a deep breath.")
    assert "courage" in classify("Be brave and face your fear.")
    assert classify("Lorem ipsum dolor sit amet") == ["wisdom"]


def test_wholesome_filter():
    assert is_wholesome("Keep going, you are doing great.")
    assert not is_wholesome("Revenge is a dish best served cold.")
    assert not is_wholesome("Wars never end.")
    assert is_wholesome("Stay warm and keep walking.")  # 'warm' must not match 'war'


def test_quote_id_ignores_punctuation_and_case():
    assert quote_id("Keep going!") == quote_id("keep   going")


def test_parsers_handle_real_shapes_and_junk():
    assert sources.parse_zenquotes([{"q": "Hello world", "a": "Me"}]) == [{"text": "Hello world", "author": "Me"}]
    assert sources.parse_zenquotes([{"q": "Too many requests", "a": "zenquotes.io"}]) == []
    assert sources.parse_quotable([{"content": "Hi there", "author": "You"}])[0]["author"] == "You"
    assert sources.parse_dummyjson({"quotes": [{"quote": "Q", "author": "A"}]})[0]["text"] == "Q"
    assert sources.parse_typefit([{"text": "T", "author": "Bob, type.fit"}])[0]["author"] == "Bob"
    for parser in (sources.parse_zenquotes, sources.parse_quotable, sources.parse_dummyjson, sources.parse_typefit):
        assert parser(None) == [] and parser("oops") == [] and parser(123) == []


def make_store(tmp_path, fetcher):
    settings = dataclasses.replace(get_settings(), cache_file=tmp_path / "cache" / "q.json", online_enabled=True)
    store = QuoteStore(settings, fetcher=fetcher)
    store.load()
    return store, settings


def test_refresh_merges_filters_and_caches(tmp_path):
    fake = {
        "ZenQuotes": [
            {"text": "Every sunrise is a brand new chance to try again.", "author": "Someone"},
            {"text": "Short", "author": "Too short"},
            {"text": "Revenge makes you stronger than you were before.", "author": "Nope"},
            {"text": "Every sunrise is a brand new chance to try again!", "author": "Duplicate"},
        ],
        "Broken": [],
    }
    store, settings = make_store(tmp_path, lambda timeout: fake)
    before = len(store.all())
    report = store.refresh()
    assert report["ZenQuotes"] == 1
    assert len(store.all()) == before + 1
    cache = json.loads(settings.cache_file.read_text(encoding="utf-8"))
    assert len(cache["quotes"]) == 1

    # a new store reloads the cached online quote
    again = QuoteStore(settings, fetcher=lambda t: {})
    again.load()
    assert len(again.all()) == before + 1


def test_refresh_survives_failing_fetcher(tmp_path):
    def boom(timeout):
        raise RuntimeError("network down")

    store, _ = make_store(tmp_path, boom)
    before = len(store.all())
    assert store.refresh() == {}
    assert len(store.all()) == before
    assert store.stats()["refreshing"] is False


def test_fetch_source_against_local_http_server():
    """Exercise the real `requests` code path without touching the internet."""
    import http.server
    import threading

    body = json.dumps([{"q": "Small steps every day build big things.", "a": "Test Author"}]).encode()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        src = sources.Source("Local", f"http://127.0.0.1:{server.server_port}/", sources.parse_zenquotes)
        rows = sources.fetch_source(src, timeout=3)
        assert rows == [{"text": "Small steps every day build big things.", "author": "Test Author"}]
    finally:
        server.shutdown()


def test_fetch_source_returns_empty_on_failure():
    dead = sources.Source("Dead", "http://127.0.0.1:9/", sources.parse_zenquotes)
    assert sources.fetch_source(dead, timeout=1) == []


def test_needs_refresh_is_throttled(tmp_path):
    store, _ = make_store(tmp_path, lambda timeout: {})
    assert store.needs_refresh() is True      # never refreshed
    store.refresh()                            # attempt (nothing fetched)
    assert store.needs_refresh() is False      # throttled for 15 minutes
