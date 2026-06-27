"""Session routes — the host's 'fresh session' control.

Studio clients poll GET /api/session; when the epoch changes they log out + reset.
POST /api/session/reset bumps the epoch AND clears the gallery (host only).
"""
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import auth, gallery_store, session_store, stage_store

router = APIRouter(prefix="/api/session", tags=["session"])


class LoginBody(BaseModel):
    password: str


@router.get("")
async def get_session():
    """Public poll: session epoch + live training stage, lab open-times, and the
    server clock (so the wall's race timer is synced regardless of client clocks)."""
    return {
        "epoch": await session_store.get_epoch(),
        "stage": await stage_store.get_stage(),
        "opened_at": await stage_store.get_opened(),
        "now": time.time(),
    }


@router.post("/login")
async def login(body: LoginBody):
    """Verify a password server-side and return its role + current epoch.

    The client stores the password as its `X-Studio-Token` on success; the
    actual authorization happens per-request via the auth dependencies.
    """
    role = auth.role_for(body.password)
    if not role:
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"ok": True, "role": role, "epoch": await session_store.get_epoch()}


@router.post("/reset", dependencies=[Depends(auth.require_host)])
async def reset():
    """Fresh session: wipe the wall, bump the epoch (logs everyone out), and
    reset every lab to locked so the next training starts clean."""
    await gallery_store.clear()
    await stage_store.reset()
    epoch = await session_store.bump()
    return {"ok": True, "epoch": epoch, "stage": await stage_store.get_stage()}
