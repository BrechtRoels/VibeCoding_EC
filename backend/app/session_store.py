"""Shared 'session epoch' — a counter the host bumps to start a fresh session.

Studio clients poll the epoch; when it changes they log out and reset. Backed by
Postgres when DATABASE_URL is set (so every Vercel instance shares it); otherwise
persisted to a local JSON file next to the gallery for dev.
"""
import asyncio
import json
import os

from . import db, gallery_store

_PATH = os.path.join(gallery_store.DATA_DIR, "state.json")
_lock = asyncio.Lock()
_epoch: int | None = None


def _load() -> int:
    try:
        with open(_PATH, encoding="utf-8") as f:
            return int(json.load(f).get("epoch", 0))
    except (FileNotFoundError, json.JSONDecodeError, OSError, ValueError, TypeError):
        return 0


def _save(epoch: int) -> None:
    try:
        os.makedirs(gallery_store.DATA_DIR, exist_ok=True)
        tmp = _PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"epoch": epoch}, f)
        os.replace(tmp, _PATH)
    except OSError:
        pass


async def get_epoch() -> int:
    global _epoch
    if db.enabled():
        val = await db.fetchval("SELECT value->>'epoch' FROM kv WHERE key = 'epoch'")
        return int(val) if val is not None else 0
    if _epoch is None:
        _epoch = _load()
    return _epoch


async def bump() -> int:
    global _epoch
    if db.enabled():
        # Atomic increment in the shared store (default to 1 when absent).
        val = await db.fetchval(
            """
            INSERT INTO kv (key, value) VALUES ('epoch', '{"epoch": 1}'::jsonb)
            ON CONFLICT (key) DO UPDATE
              SET value = jsonb_build_object('epoch', ((kv.value->>'epoch')::int + 1))
            RETURNING value->>'epoch'
            """
        )
        return int(val)
    async with _lock:
        _epoch = (await get_epoch()) + 1
        _save(_epoch)
        return _epoch
