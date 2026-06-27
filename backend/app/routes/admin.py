"""Admin (facilitator) routes — steer the live training.

The admin screen reads the current stage from GET /api/session (public poll) and
writes the per-lab state here. Admin-only; participants poll the result and react
live (a newly unlocked lab becomes playable without a reload).
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import auth, stage_store

router = APIRouter(prefix="/api/admin", tags=["admin"])


class StageBody(BaseModel):
    # Per-lab state: each of vibe/spec/harness is "hidden" | "locked" | "unlocked".
    # Unknown keys/values are coerced to the locked default server-side.
    vibe: str | None = None
    spec: str | None = None
    harness: str | None = None


@router.get("/stage", dependencies=[Depends(auth.require_admin)])
async def get_stage():
    return {"stage": await stage_store.get_stage()}


@router.post("/stage", dependencies=[Depends(auth.require_admin)])
async def set_stage(body: StageBody):
    await stage_store.set_stage(body.model_dump(exclude_none=True))
    return {"ok": True, "stage": await stage_store.get_stage()}
