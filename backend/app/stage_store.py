"""Training stage — which labs are in the training, whether they're playable, and
when each was opened (the race clock).

The admin (facilitator) steers a live training from the /admin screen: each lab
(vibe / spec / harness) is in one of three states:

  * hidden    — not part of this training; participants don't see it.
  * locked    — visible as an upcoming lab, but not yet playable (and the
                backend refuses its LLM calls — enforcement is server-side, not
                just a greyed-out button).
  * unlocked  — active; participants can use it.

Unlocking a lab stamps `opened_at` (server time). That's the start of the race:
a participant's elapsed time is computed server-side at submit as `now - opened_at`,
so it's synchronized across everyone and can't be faked from the client. Re-locking
then re-unlocking restarts the clock.

Backed by Postgres when DATABASE_URL is set (shared across all Vercel instances);
otherwise persisted to a local JSON file for dev.
"""
import asyncio
import json
import os
import time

from . import db, gallery_store

MODES = ("vibe", "spec", "harness")
STATES = ("hidden", "locked", "unlocked")
DEFAULT_STATE = "locked"

_PATH = os.path.join(gallery_store.DATA_DIR, "stage.json")
_lock = asyncio.Lock()
# In-memory cache (file-fallback only): {"states": {mode: state}, "opened": {mode: ts|None}}
_cache: dict | None = None


def _default() -> dict:
    return {"states": {m: DEFAULT_STATE for m in MODES}, "opened": {m: None for m in MODES}}


def _sanitize(raw: object) -> dict:
    """Coerce stored/loaded data into the canonical shape, tolerating the old flat format."""
    out = _default()
    if isinstance(raw, dict):
        states = raw.get("states") if isinstance(raw.get("states"), dict) else raw
        opened = raw.get("opened") if isinstance(raw.get("opened"), dict) else {}
        for m in MODES:
            v = states.get(m) if isinstance(states, dict) else None
            if isinstance(v, str) and v in STATES:
                out["states"][m] = v
            ts = opened.get(m)
            if isinstance(ts, (int, float)):
                out["opened"][m] = float(ts)
        for m in MODES:
            if out["states"][m] != "unlocked":
                out["opened"][m] = None
    return out


def _load() -> dict:
    try:
        with open(_PATH, encoding="utf-8") as f:
            return _sanitize(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return _default()


def _save(cache: dict) -> None:
    try:
        os.makedirs(gallery_store.DATA_DIR, exist_ok=True)
        tmp = _PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cache, f)
        os.replace(tmp, _PATH)
    except OSError:
        pass


async def _read() -> dict:
    """Current canonical stage dict from the active backend."""
    global _cache
    if db.enabled():
        row = await db.fetchval("SELECT value FROM kv WHERE key = 'stage'")
        return _sanitize(row) if row is not None else _default()
    if _cache is None:
        _cache = _load()
    return _cache


async def _write(cache: dict) -> None:
    global _cache
    if db.enabled():
        await db.execute(
            "INSERT INTO kv (key, value) VALUES ('stage', $1::jsonb) "
            "ON CONFLICT (key) DO UPDATE SET value = $1::jsonb",
            cache,
        )
    else:
        _cache = cache
        _save(cache)


async def get_stage() -> dict[str, str]:
    return dict((await _read())["states"])


async def get_opened() -> dict[str, float | None]:
    return dict((await _read())["opened"])


async def opened_at(mode: str) -> float | None:
    return (await _read())["opened"].get(mode)


async def is_unlocked(mode: str) -> bool:
    return (await _read())["states"].get(mode) == "unlocked"


async def set_stage(raw: object) -> dict:
    """Apply new per-lab states; stamp open times for labs that just unlocked."""
    async with _lock:
        cur = await _read()
        nxt = _sanitize(raw)  # validates states; opened blanked for non-unlocked
        now = time.time()
        for m in MODES:
            if nxt["states"][m] == "unlocked":
                # Keep an already-running clock; start a new one otherwise.
                prev = cur["opened"].get(m) if cur["states"].get(m) == "unlocked" else None
                nxt["opened"][m] = prev if prev is not None else now
        await _write(nxt)
        return {"states": dict(nxt["states"]), "opened": dict(nxt["opened"])}


async def reset() -> dict:
    """Back to the fresh-session default (every lab locked, clocks cleared)."""
    async with _lock:
        nxt = _default()
        await _write(nxt)
        return {"states": dict(nxt["states"]), "opened": dict(nxt["opened"])}
