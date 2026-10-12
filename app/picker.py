"""Personalised, deterministic quote selection.

The same person gets the same quote all day (same user id + date + mood),
but different people - and different days - get different quotes.
"""
from __future__ import annotations

import hashlib
from typing import Iterable, Sequence

from .moods import DEFAULT_MOOD, MOODS

Quote = dict


def _seed(*parts: str) -> int:
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return int(digest, 16)


def candidates_for(
    quotes: Sequence[Quote],
    mood: str,
    interests: Iterable[str] = (),
    exclude: Iterable[str] = (),
) -> list[Quote]:
    """Narrow the pool by mood, then by interests, then drop recently seen quotes."""
    mood_cats = set(MOODS.get(mood, MOODS[DEFAULT_MOOD])["categories"])
    interest_set = set(interests)
    skip = set(exclude)

    pool = [q for q in quotes if mood_cats.intersection(q["categories"])]
    if not pool:
        pool = list(quotes)

    if interest_set:
        both = [q for q in pool if interest_set.intersection(q["categories"])]
        if len(both) >= 5:
            pool = both

    fresh = [q for q in pool if q["id"] not in skip]
    return fresh or pool


def pick_quote(
    quotes: Sequence[Quote],
    uid: str,
    day: str,
    mood: str,
    interests: Iterable[str] = (),
    exclude: Iterable[str] = (),
    nonce: str = "",
) -> tuple[Quote, int]:
    """Return (quote, seed). `quotes` must be non-empty and sorted by id."""
    if not quotes:
        raise ValueError("quote pool is empty")
    interests = sorted(set(interests))
    pool = candidates_for(quotes, mood, interests, exclude)
    seed = _seed(uid, day, mood, ",".join(interests), nonce)
    return pool[seed % len(pool)], seed


def pick_tip(mood: str, seed: int) -> str:
    tips = MOODS.get(mood, MOODS[DEFAULT_MOOD])["tips"]
    return tips[(seed // 7) % len(tips)]
