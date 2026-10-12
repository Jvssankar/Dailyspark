"""Tiny keyword classifier that tags online quotes with DailySpark categories,
plus a filter that keeps the pool positive and safe to show to everyone."""
from __future__ import annotations

import hashlib
import re

# Prefix stems: a token matches when it starts with one of these.
KEYWORDS: dict[str, tuple[str, ...]] = {
    "motivation": (
        "start", "begin", "action", "effort", "persist", "habit", "progress",
        "dream", "goal", "ambiti", "determin", "passion", "enthusias",
        "energ", "strive", "inspir", "today", "step",
    ),
    "focus": (
        "focus", "concentr", "attent", "disciplin", "priorit", "distract",
        "patien", "moment", "present", "deliberat", "routine", "clock",
    ),
    "calm": (
        "peace", "calm", "quiet", "still", "breath", "relax", "serene",
        "tranquil", "silence", "gentle", "stress", "worr", "anxi", "rest",
    ),
    "courage": (
        "courag", "brave", "fear", "dare", "bold", "risk", "afraid",
        "valor", "faith", "trust", "believ", "confiden",
    ),
    "success": (
        "succe", "achiev", "excell", "victor", "triumph", "master",
        "great", "accomplish", "leader", "winner", "prosper",
    ),
    "positivity": (
        "happ", "joy", "smile", "kind", "gratef", "thank", "love", "hope",
        "optimis", "bright", "sunshin", "light", "beaut", "laugh", "positiv",
    ),
    "resilience": (
        "fail", "fall", "rise", "persever", "overcome", "strong", "strength",
        "endur", "tough", "resilien", "struggl", "setback", "storm",
        "challeng", "difficult", "obstacle", "adversit",
    ),
    "wisdom": (
        "wise", "wisdom", "learn", "knowledge", "truth", "mind", "think",
        "understand", "experience", "character", "soul",
    ),
}

DEFAULT_CATEGORY = "wisdom"

_BLOCK_EXACT = {"war", "wars", "die", "dies", "died", "dead", "hell", "damn", "sex", "evil"}
_BLOCK_STEMS = (
    "kill", "suicid", "murder", "hate", "hatred", "stupid", "idiot", "fuck",
    "shit", "rape", "drunk", "hitler", "nazi", "revenge", "poison", "slave",
    "cancer", "terror", "bomb", "weapon",
)

_TOKEN = re.compile(r"[a-z']+")


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def classify(text: str, limit: int = 2) -> list[str]:
    """Return up to `limit` categories that best describe the quote."""
    tokens = _tokens(text)
    scores: dict[str, int] = {}
    for category, stems in KEYWORDS.items():
        hits = sum(1 for tok in tokens if tok.startswith(stems))
        if hits:
            scores[category] = hits
    if not scores:
        return [DEFAULT_CATEGORY]
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    return [cat for cat, _ in ranked[:limit]]


def is_wholesome(text: str) -> bool:
    """Reject quotes with violent, vulgar or very negative wording."""
    for tok in _tokens(text):
        if tok in _BLOCK_EXACT or tok.startswith(_BLOCK_STEMS):
            return False
    return True


def quote_id(text: str) -> str:
    """Stable short id built from the quote's letters and digits only."""
    normalised = re.sub(r"[^a-z0-9]", "", text.lower())
    return hashlib.sha1(normalised.encode("utf-8")).hexdigest()[:12]
