"""Runtime settings, read from environment variables with safe defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _number(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return float(default)


@dataclass(frozen=True)
class Settings:
    seed_file: Path = DATA_DIR / "quotes.json"
    cache_file: Path = DATA_DIR / "cache" / "online_quotes.json"
    static_dir: Path = STATIC_DIR
    online_enabled: bool = True
    refresh_hours: float = 12.0
    request_timeout: float = 6.0
    min_quote_len: int = 20
    max_quote_len: int = 220


def get_settings() -> Settings:
    """Build settings from the environment each time (handy for tests)."""
    return Settings(
        online_enabled=_flag("DAILYSPARK_ONLINE", True),
        refresh_hours=_number("DAILYSPARK_REFRESH_HOURS", 12),
        request_timeout=_number("DAILYSPARK_TIMEOUT", 6),
    )
