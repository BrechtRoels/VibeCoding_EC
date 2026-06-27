"""Shared Postgres store (Neon / Vercel Postgres).

Why this exists: on Vercel the backend runs as many stateless serverless
instances, each with its own RAM and its own ephemeral /tmp. The file/in-memory
stores were therefore NOT shared — consecutive wall polls hit different instances
with different views of the gallery, which made the wall flicker and dropped
submissions. A single shared database fixes that: every instance reads/writes the
same rows.

If no DATABASE_URL is configured (local `./run.sh` dev), `enabled()` is False and
the store modules fall back to their original file/in-memory behavior.

asyncpg notes: we connect to the pooled endpoint (pgbouncer), so prepared
statements are disabled (statement_cache_size=0). jsonb columns round-trip as
native Python objects via a per-connection codec.
"""
import json
import os
import re

_pool = None
_pool_lock = None
_dsn_cache: str | None = None


def _dsn() -> str | None:
    global _dsn_cache
    if _dsn_cache is not None:
        return _dsn_cache or None
    raw = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or ""
    if raw:
        # Strip libpq/pgbouncer query params asyncpg doesn't accept (sslmode,
        # channel_binding, pgbouncer, connect_timeout, …); we set ssl explicitly.
        raw = re.sub(r"\?.*$", "", raw)
        raw = raw.replace("postgresql+asyncpg://", "postgresql://")
    _dsn_cache = raw
    return raw or None


def enabled() -> bool:
    return _dsn() is not None


def _ssl_mode():
    """Neon/Vercel Postgres require TLS; a local/Docker Postgres doesn't.

    Honor DB_SSL if set ("require"/"disable"); otherwise disable for localhost and
    require everywhere else.
    """
    override = os.getenv("DB_SSL", "").lower()
    if override in ("require", "true", "1"):
        return "require"
    if override in ("disable", "false", "0"):
        return None
    dsn = _dsn() or ""
    if "@localhost" in dsn or "@127.0.0.1" in dsn:
        return None
    return "require"


async def _connection_init(conn):
    await conn.set_type_codec(
        "jsonb", schema="pg_catalog", encoder=json.dumps, decoder=json.loads
    )


async def _get_pool():
    global _pool, _pool_lock
    if _pool is not None:
        return _pool
    import asyncio

    import asyncpg

    if _pool_lock is None:
        _pool_lock = asyncio.Lock()
    async with _pool_lock:
        if _pool is None:
            pool = await asyncpg.create_pool(
                dsn=_dsn(),
                ssl=_ssl_mode(),
                min_size=1,
                max_size=5,
                statement_cache_size=0,
                init=_connection_init,
            )
            await _init_schema(pool)
            _pool = pool
    return _pool


async def _init_schema(pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS gallery (
                id          TEXT PRIMARY KEY,
                mode        TEXT NOT NULL,
                title       TEXT NOT NULL,
                author      TEXT NOT NULL,
                html        TEXT NOT NULL,
                ts          DOUBLE PRECISION NOT NULL,
                requirements TEXT,
                criteria    JSONB,
                iterations  INTEGER,
                elapsed_sec REAL,
                score       REAL
            );
            CREATE INDEX IF NOT EXISTS gallery_ts_idx ON gallery (ts DESC);
            CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value JSONB NOT NULL
            );
            """
        )


async def fetch(query: str, *args):
    pool = await _get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args):
    pool = await _get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(query: str, *args):
    pool = await _get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(query, *args)


async def execute(query: str, *args):
    pool = await _get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)
