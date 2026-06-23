"""Session routes — the host's 'fresh session' control.

Studio clients poll GET /api/session; when the epoch changes they log out + reset.
POST /api/session/reset bumps the epoch AND clears the gallery (host only).
"""
from fastapi import APIRouter

from .. import gallery_store, session_store

router = APIRouter(prefix="/api/session", tags=["session"])


@router.get("")
async def get_session():
    return {"epoch": session_store.get_epoch()}


@router.post("/reset")
async def reset():
    await gallery_store.clear()
    epoch = await session_store.bump()
    return {"ok": True, "epoch": epoch}
