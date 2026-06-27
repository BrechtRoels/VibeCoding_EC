"""Persistent shared gallery — participants submit apps; the host projects the wall.

Stored as a JSON file on disk so submissions survive restarts and every client
(all 50 participants + the host's wall) sees the same shared state.
"""
import asyncio
import json
import os
import tempfile
import time
import uuid

from . import db


def _data_dir() -> str:
    # Explicit override wins; on serverless (Vercel) only /tmp is writable and is
    # ephemeral/per-instance — for a durable shared wall, point GALLERY_DIR at a
    # persistent volume or wire an external store (Vercel KV/Postgres).
    if os.getenv("GALLERY_DIR"):
        return os.environ["GALLERY_DIR"]
    if os.getenv("VERCEL"):
        return os.path.join(tempfile.gettempdir(), "twtb")
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


DATA_DIR = _data_dir()
PATH = os.path.join(DATA_DIR, "gallery.json")
MAX_ENTRIES = 400

_lock = asyncio.Lock()
_entries: list[dict] | None = None


def _ensure() -> list[dict]:
    global _entries
    if _entries is None:
        try:
            with open(PATH, encoding="utf-8") as f:
                _entries = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            _entries = []
    return _entries


def _save(entries: list[dict]) -> None:
    # Best-effort: on a read-only serverless filesystem this fails silently and the
    # gallery still works in-memory for the instance's lifetime.
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(entries, f)
        os.replace(tmp, PATH)
    except OSError:
        pass


def _row_to_entry(row) -> dict:
    entry = {
        "id": row["id"], "mode": row["mode"], "title": row["title"],
        "author": row["author"], "html": row["html"], "ts": row["ts"],
    }
    if row["requirements"]:
        entry["requirements"] = row["requirements"]
    if row["criteria"]:
        entry["criteria"] = row["criteria"]
    if row["iterations"] is not None:
        entry["iterations"] = row["iterations"]
    if row["elapsed_sec"] is not None:
        entry["elapsed_sec"] = row["elapsed_sec"]
    if row["score"] is not None:
        entry["score"] = row["score"]
    return entry


async def list_all() -> list[dict]:
    if db.enabled():
        rows = await db.fetch(
            "SELECT * FROM gallery ORDER BY ts DESC LIMIT $1", MAX_ENTRIES
        )
        return [_row_to_entry(r) for r in rows]
    return _ensure()


async def add(
    mode: str,
    title: str,
    html: str,
    author: str | None,
    requirements: str | None = None,
    criteria: list[str] | None = None,
    iterations: int | None = None,
    elapsed_sec: float | None = None,
    score: float | None = None,
) -> dict:
    entry = {
        "id": uuid.uuid4().hex[:12],
        "mode": mode,
        "title": (title or "Untitled").strip()[:120],
        "author": (author or "Anonymous").strip()[:40] or "Anonymous",
        "html": html,
        "ts": time.time(),
    }
    if requirements:
        entry["requirements"] = requirements[:8000]
    if criteria:
        entry["criteria"] = criteria
    # Competition metrics (present only when the race clock was running).
    if iterations is not None:
        entry["iterations"] = iterations
    if elapsed_sec is not None:
        entry["elapsed_sec"] = round(elapsed_sec, 1)
    if score is not None:
        entry["score"] = round(score, 1)

    if db.enabled():
        await db.execute(
            """
            INSERT INTO gallery
              (id, mode, title, author, html, ts, requirements, criteria, iterations, elapsed_sec, score)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            """,
            entry["id"], entry["mode"], entry["title"], entry["author"], entry["html"], entry["ts"],
            entry.get("requirements"), entry.get("criteria"),
            entry.get("iterations"), entry.get("elapsed_sec"), entry.get("score"),
        )
        # Cap stored rows so the wall query stays bounded.
        await db.execute(
            "DELETE FROM gallery WHERE id IN "
            "(SELECT id FROM gallery ORDER BY ts DESC OFFSET $1)",
            MAX_ENTRIES,
        )
        return entry

    async with _lock:
        entries = _ensure()
        entries.insert(0, entry)  # newest first
        del entries[MAX_ENTRIES:]
        _save(entries)
        return entry


async def clear() -> None:
    global _entries
    if db.enabled():
        await db.execute("DELETE FROM gallery")
        return
    async with _lock:
        _entries = []
        _save([])
