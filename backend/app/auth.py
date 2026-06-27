"""Shared-token authentication for the studio backend.

Three roles, in a strict hierarchy (each inherits the ones below it), carried in
the `X-Studio-Token` request header:

  * admin   — facilitator. Steers the training (the /admin screen): which labs
              are in it and locking/unlocking them. Can do everything below.
  * host    — the projected wall. Destructive actions (clear gallery, reset
              session). Inherited by admin.
  * studio  — participants. LLM calls and gallery submit, but only for labs the
              admin has unlocked (see `require_active_mode`).

The old design compared a password client-side only, so anyone who knew the
deployed URL could spend the shared GenAI key or wipe the wall. These FastAPI
dependencies enforce the secrets on the server. `secrets.compare_digest` avoids
leaking token length/contents via timing.

If all passwords are configured empty, auth is disabled (handy for local
`USE_MOCK_AI` runs); the production defaults in config.py are non-empty.
"""
import secrets

from fastapi import Header, HTTPException

from . import config, stage_store


def _matches(token: str | None, expected: str) -> bool:
    return bool(expected) and secrets.compare_digest(token or "", expected)


def _auth_disabled() -> bool:
    return not (config.STUDIO_PASSWORD or config.WALL_PASSWORD or config.ADMIN_PASSWORD)


def role_for(password: str | None) -> str | None:
    """Resolve a password to its role (highest match wins), or None if invalid."""
    if _matches(password, config.ADMIN_PASSWORD):
        return "admin"
    if _matches(password, config.WALL_PASSWORD):
        return "host"
    if _matches(password, config.STUDIO_PASSWORD):
        return "studio"
    if _auth_disabled():
        return "admin"  # local dev: no secrets configured -> full access
    return None


async def require_auth(x_studio_token: str | None = Header(default=None)) -> str:
    """Any valid token. Returns the caller's role."""
    role = role_for(x_studio_token)
    if role is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return role


async def require_host(x_studio_token: str | None = Header(default=None)) -> str:
    """Host or admin. Gate for destructive actions (clear gallery, reset session)."""
    role = role_for(x_studio_token)
    if role in ("admin", "host"):
        return role
    raise HTTPException(status_code=401, detail="Unauthorized")


async def require_admin(x_studio_token: str | None = Header(default=None)) -> str:
    """Admin only. Gate for steering the training."""
    role = role_for(x_studio_token)
    if role == "admin":
        return role
    raise HTTPException(status_code=401, detail="Unauthorized")


def require_active_mode(mode: str):
    """Dependency factory: a valid token AND the lab being unlocked.

    Facilitators (admin/host) bypass the lock so they can prep/demo a lab before
    opening it; participants get 403 until the admin unlocks it. This is the
    server-side teeth behind the UI's lock — a participant cannot just call the
    API directly for a locked lab.
    """

    async def dep(x_studio_token: str | None = Header(default=None)) -> str:
        role = role_for(x_studio_token)
        if role is None:
            raise HTTPException(status_code=401, detail="Unauthorized")
        if role in ("admin", "host"):
            return role
        if not await stage_store.is_unlocked(mode):
            raise HTTPException(status_code=403, detail=f"The {mode} lab is locked")
        return role

    return dep
