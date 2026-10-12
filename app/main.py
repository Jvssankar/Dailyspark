"""DailySpark API + static frontend."""
from __future__ import annotations

import re
from contextlib import asynccontextmanager
from datetime import date as date_cls
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import Settings, get_settings
from .moods import CATEGORIES, CATEGORY_IDS, DEFAULT_MOOD, MOODS, public_moods
from .picker import pick_quote, pick_tip
from .store import QuoteStore

UID_PATTERN = r"^[A-Za-z0-9_-]{6,64}$"
ID_PATTERN = re.compile(r"^[a-z0-9]{6,32}$")


def _split(value: str | None, limit: int) -> list[str]:
    if not value:
        return []
    return [p.strip() for p in value.split(",") if p.strip()][:limit]


def _resolve_day(value: str | None) -> str:
    """Use the client's local date, but only if it is within a day of UTC today."""
    today = datetime.now(timezone.utc).date()
    if not value:
        return today.isoformat()
    try:
        parsed = date_cls.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    if abs(parsed - today) > timedelta(days=2):
        return today.isoformat()
    return parsed.isoformat()


def create_app(settings: Settings | None = None, store: QuoteStore | None = None) -> FastAPI:
    settings = settings or get_settings()
    store = store or QuoteStore(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        store.load()
        if store.needs_refresh():
            store.refresh_async()
        yield

    app = FastAPI(
        title="DailySpark",
        description="A personalised daily motivational quote generator.",
        version=__version__,
        lifespan=lifespan,
    )
    app.state.store = store

    @app.middleware("http")
    async def no_store_for_api(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def _answer(quote: dict, mood: str, seed: int, day: str, pool_size: int) -> dict:
        return {
            "quote": quote,
            "mood": mood,
            "tip": pick_tip(mood, seed),
            "date": day,
            "pool_size": pool_size,
        }

    def _common(mood: str, interests: str | None):
        mood_id = mood if mood in MOODS else DEFAULT_MOOD
        interest_list = [i for i in _split(interests, 8) if i in CATEGORY_IDS]
        return mood_id, interest_list

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": __version__, "quotes": store.stats()["total"]}

    @app.get("/api/moods")
    def moods():
        return {"moods": public_moods(), "categories": CATEGORIES, "default_mood": DEFAULT_MOOD}

    @app.get("/api/stats")
    def stats():
        return store.stats()

    @app.get("/api/daily")
    def daily(
        uid: str = Query(..., pattern=UID_PATTERN, description="Anonymous id created by the browser"),
        mood: str = Query(DEFAULT_MOOD, max_length=24),
        interests: str | None = Query(None, max_length=200),
        date: str | None = Query(None, description="Client's local date, YYYY-MM-DD"),
        exclude: str | None = Query(None, max_length=1200, description="Comma separated recent quote ids"),
    ):
        if store.needs_refresh():
            store.refresh_async()
        quotes = store.all()
        if not quotes:
            raise HTTPException(status_code=503, detail="No quotes available yet")
        mood_id, interest_list = _common(mood, interests)
        day = _resolve_day(date)
        recent = [e for e in _split(exclude, 40) if ID_PATTERN.match(e)]
        quote, seed = pick_quote(quotes, uid, day, mood_id, interest_list, recent)
        return _answer(quote, mood_id, seed, day, len(quotes))

    @app.get("/api/random")
    def random_quote(
        uid: str = Query(..., pattern=UID_PATTERN),
        mood: str = Query(DEFAULT_MOOD, max_length=24),
        interests: str | None = Query(None, max_length=200),
        nonce: str = Query("", max_length=40, pattern=r"^[A-Za-z0-9_.-]*$"),
    ):
        if store.needs_refresh():
            store.refresh_async()
        quotes = store.all()
        if not quotes:
            raise HTTPException(status_code=503, detail="No quotes available yet")
        mood_id, interest_list = _common(mood, interests)
        day = datetime.now(timezone.utc).date().isoformat()
        quote, seed = pick_quote(quotes, uid, day, mood_id, interest_list, (), nonce or "random")
        return _answer(quote, mood_id, seed, day, len(quotes))

    @app.post("/api/refresh")
    def refresh():
        if not settings.online_enabled:
            return JSONResponse({"started": False, "reason": "online sources are disabled"}, status_code=200)
        started = store.refresh_async()
        return {"started": started}

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(settings.static_dir / "index.html")

    app.mount("/static", StaticFiles(directory=str(settings.static_dir)), name="static")
    return app


app = create_app()
