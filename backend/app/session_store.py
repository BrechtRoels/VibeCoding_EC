"""Shared 'session epoch' — a counter the host bumps to start a fresh session.

Studio clients poll the epoch; when it changes they log out and reset. Persisted
to disk (best-effort) next to the gallery so it survives restarts on a normal server.
"""
import asyncio
import json
import os

from . import gallery_store

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


def get_epoch() -> int:
    global _epoch
    if _epoch is None:
        _epoch = _load()
    return _epoch


async def bump() -> int:
    global _epoch
    async with _lock:
        _epoch = get_epoch() + 1
        _save(_epoch)
        return _epoch
