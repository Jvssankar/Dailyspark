"""Online quote sources.

Every source has a small `parse_*` function (pure, easy to test) and the
network call is wrapped so one broken API never breaks the app.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

import requests

log = logging.getLogger("dailyspark.sources")

USER_AGENT = "DailySpark/1.0 (+https://github.com/your-username/dailyspark)"

RawQuote = dict  # {"text": str, "author": str}


def _clean(text: object, author: object) -> RawQuote | None:
    if not isinstance(text, str) or not text.strip():
        return None
    author_text = author.strip() if isinstance(author, str) else ""
    # type.fit appends ", type.fit" to author names.
    if author_text.lower().endswith(", type.fit"):
        author_text = author_text[: -len(", type.fit")].strip()
    return {"text": " ".join(text.split()), "author": author_text or "Unknown"}


def parse_zenquotes(payload: object) -> list[RawQuote]:
    out: list[RawQuote] = []
    if not isinstance(payload, list):
        return out
    for item in payload:
        if not isinstance(item, dict):
            continue
        # ZenQuotes answers rate-limit errors as a fake quote from "zenquotes.io".
        if str(item.get("a", "")).lower() == "zenquotes.io":
            continue
        row = _clean(item.get("q"), item.get("a"))
        if row:
            out.append(row)
    return out


def parse_quotable(payload: object) -> list[RawQuote]:
    out: list[RawQuote] = []
    if isinstance(payload, dict):
        payload = payload.get("results", [])
    if not isinstance(payload, list):
        return out
    for item in payload:
        if isinstance(item, dict):
            row = _clean(item.get("content"), item.get("author"))
            if row:
                out.append(row)
    return out


def parse_dummyjson(payload: object) -> list[RawQuote]:
    out: list[RawQuote] = []
    items = payload.get("quotes", []) if isinstance(payload, dict) else []
    for item in items:
        if isinstance(item, dict):
            row = _clean(item.get("quote"), item.get("author"))
            if row:
                out.append(row)
    return out


def parse_typefit(payload: object) -> list[RawQuote]:
    out: list[RawQuote] = []
    if not isinstance(payload, list):
        return out
    for item in payload:
        if isinstance(item, dict):
            row = _clean(item.get("text"), item.get("author"))
            if row:
                out.append(row)
    return out


@dataclass(frozen=True)
class Source:
    name: str
    url: str
    parser: Callable[[object], list[RawQuote]]


SOURCES: tuple[Source, ...] = (
    Source("ZenQuotes", "https://zenquotes.io/api/quotes", parse_zenquotes),
    Source("Quotable", "https://api.quotable.io/quotes/random?limit=50&maxLength=200", parse_quotable),
    Source("DummyJSON", "https://dummyjson.com/quotes?limit=0", parse_dummyjson),
    Source("Type.fit", "https://type.fit/api/quotes", parse_typefit),
)


def fetch_source(source: Source, timeout: float = 6.0) -> list[RawQuote]:
    """Download and parse one source. Returns [] on any failure."""
    try:
        resp = requests.get(source.url, timeout=timeout, headers={"User-Agent": USER_AGENT})
        resp.raise_for_status()
        return source.parser(resp.json())
    except Exception as exc:  # network, SSL, JSON, anything: never crash the app
        log.warning("Source %s failed: %s", source.name, exc)
        return []


def fetch_all(timeout: float = 6.0) -> dict[str, list[RawQuote]]:
    """Fetch every source and return {source name: [quotes]}."""
    return {src.name: fetch_source(src, timeout) for src in SOURCES}
