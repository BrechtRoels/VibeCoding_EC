"""Persistent shared gallery — participants submit apps; the host projects the wall.

Stored as a JSON file on disk so submissions survive restarts and every client
(all 50 participants + the host's wall) sees the same shared state.
"""
import asyncio
import json
import os
import time
import uuid

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
PATH = os.path.join(DATA_DIR, "gallery.json")
MAX_ENTRIES = 400

_lock = asyncio.Lock()
_entries: list[dict] | None = None


def _ensure() -> list[dict]:
    global _entries
    if _entries is None:
        os.makedirs(DATA_DIR, exist_ok=True)
        try:
            with open(PATH, encoding="utf-8") as f:
                _entries = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            _entries = []
    return _entries


def _save(entries: list[dict]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(entries, f)
    os.replace(tmp, PATH)


def list_all() -> list[dict]:
    return _ensure()


async def add(mode: str, title: str, html: str, author: str | None) -> dict:
    async with _lock:
        entries = _ensure()
        entry = {
            "id": uuid.uuid4().hex[:12],
            "mode": mode,
            "title": (title or "Untitled").strip()[:120],
            "author": (author or "Anonymous").strip()[:40] or "Anonymous",
            "html": html,
            "ts": time.time(),
        }
        entries.insert(0, entry)  # newest first
        del entries[MAX_ENTRIES:]
        _save(entries)
        return entry


async def clear() -> None:
    global _entries
    async with _lock:
        _entries = []
        _save([])
