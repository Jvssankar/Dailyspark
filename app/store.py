"""In-memory quote pool: curated seed quotes + quotes fetched from online APIs."""
from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Callable

from .classifier import classify, is_wholesome, quote_id
from .config import Settings
from .sources import RawQuote, fetch_all

log = logging.getLogger("dailyspark.store")

Quote = dict  # {"id","text","author","categories","source"}

Fetcher = Callable[[float], "dict[str, list[RawQuote]]"]


class QuoteStore:
    def __init__(self, settings: Settings, fetcher: Fetcher = fetch_all) -> None:
        self.settings = settings
        self._fetcher = fetcher
        self._lock = threading.RLock()
        self._quotes: dict[str, Quote] = {}
        self._sorted: list[Quote] = []
        self.last_refresh: float | None = None
        self.last_report: dict[str, int] = {}
        self.last_attempt: float | None = None
        self._refreshing = False

    # ---------- loading ----------
    def load(self) -> None:
        with self._lock:
            self._load_seed()
            self._load_cache()
            self._rebuild()

    def _load_seed(self) -> None:
        try:
            rows = json.loads(Path(self.settings.seed_file).read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            log.error("Could not read seed quotes: %s", exc)
            rows = []
        for row in rows:
            text = str(row.get("text", "")).strip()
            if not text:
                continue
            qid = quote_id(text)
            self._quotes[qid] = {
                "id": qid,
                "text": text,
                "author": str(row.get("author", "Unknown")).strip() or "Unknown",
                "categories": list(row.get("categories") or classify(text)),
                "source": "Curated",
            }

    def _load_cache(self) -> None:
        path = Path(self.settings.cache_file)
        try:
            blob = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        self.last_refresh = blob.get("fetched_at")
        for row in blob.get("quotes", []):
            if isinstance(row, dict) and row.get("id") and row.get("text"):
                self._quotes.setdefault(row["id"], row)

    def _save_cache(self) -> None:
        path = Path(self.settings.cache_file)
        online = [q for q in self._quotes.values() if q.get("source") != "Curated"]
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(
                json.dumps({"fetched_at": self.last_refresh, "quotes": online}, ensure_ascii=False),
                encoding="utf-8",
            )
            tmp.replace(path)
        except OSError as exc:
            log.warning("Could not write cache: %s", exc)

    def _rebuild(self) -> None:
        self._sorted = sorted(self._quotes.values(), key=lambda q: q["id"])

    # ---------- reading ----------
    def all(self) -> list[Quote]:
        with self._lock:
            return list(self._sorted)

    def stats(self) -> dict:
        with self._lock:
            by_source: dict[str, int] = {}
            for q in self._sorted:
                by_source[q.get("source", "Unknown")] = by_source.get(q.get("source", "Unknown"), 0) + 1
            return {
                "total": len(self._sorted),
                "by_source": by_source,
                "last_refresh": self.last_refresh,
                "refreshing": self._refreshing,
                "online_enabled": self.settings.online_enabled,
            }

    # ---------- refreshing ----------
    def needs_refresh(self) -> bool:
        if not self.settings.online_enabled:
            return False
        now = time.time()
        # Do not hammer the APIs: at most one attempt every 15 minutes.
        if self.last_attempt is not None and now - self.last_attempt < 900:
            return False
        if self.last_refresh is None:
            return True
        return (now - self.last_refresh) > self.settings.refresh_hours * 3600

    def refresh(self) -> dict[str, int]:
        """Fetch online quotes and merge new ones. Returns {source: added_count}."""
        with self._lock:
            if self._refreshing:
                return dict(self.last_report)
            self._refreshing = True
            self.last_attempt = time.time()
        report: dict[str, int] = {}
        try:
            fetched = self._fetcher(self.settings.request_timeout)
            with self._lock:
                for source_name, rows in fetched.items():
                    added = 0
                    for row in rows:
                        text = row["text"]
                        if not (self.settings.min_quote_len <= len(text) <= self.settings.max_quote_len):
                            continue
                        if not is_wholesome(text):
                            continue
                        qid = quote_id(text)
                        if qid in self._quotes:
                            continue
                        self._quotes[qid] = {
                            "id": qid,
                            "text": text,
                            "author": row["author"],
                            "categories": classify(text),
                            "source": source_name,
                        }
                        added += 1
                    report[source_name] = added
                if any(fetched.values()):
                    self.last_refresh = time.time()
                    self._rebuild()
                    self._save_cache()
                self.last_report = report
        except Exception as exc:  # keep serving with what we have
            log.error("Refresh failed: %s", exc)
        finally:
            with self._lock:
                self._refreshing = False
        return report

    def refresh_async(self) -> bool:
        """Start a background refresh. Returns False if one is already running."""
        with self._lock:
            if self._refreshing:
                return False
        threading.Thread(target=self.refresh, name="dailyspark-refresh", daemon=True).start()
        return True
