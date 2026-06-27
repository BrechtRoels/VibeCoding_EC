"""Shared gallery routes — submit an app, list the wall, clear (host)."""
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import auth, gallery_store, stage_store

router = APIRouter(prefix="/api/gallery", tags=["gallery"])

# Leaderboard scoring: each extra iteration beyond the first adds this many seconds
# to your time. Rewards being both fast AND getting it right in few iterations.
ITERATION_PENALTY_SEC = 30.0


class SubmitBody(BaseModel):
    mode: str
    title: str
    html: str
    author: str | None = None
    requirements: str | None = None  # spec mode: the requirements.md to show on the wall
    criteria: list[str] | None = None  # spec mode: the chosen compliance categories
    iterations: int | None = None  # build rounds the participant took (client-reported)


async def _score(mode: str, iterations: int | None) -> tuple[float | None, float | None]:
    """Elapsed (server-clocked from lab open) + combined score. None if no race clock."""
    opened = await stage_store.opened_at(mode)
    if opened is None:
        return None, None
    elapsed = max(0.0, time.time() - opened)
    iters = iterations if (isinstance(iterations, int) and iterations >= 1) else 1
    score = elapsed + ITERATION_PENALTY_SEC * (iters - 1)
    return elapsed, score


@router.get("")
async def list_gallery():
    return {"entries": await gallery_store.list_all()}


@router.post("", dependencies=[Depends(auth.require_auth)])
async def submit(body: SubmitBody):
    elapsed, score = await _score(body.mode, body.iterations)
    iters = body.iterations if (isinstance(body.iterations, int) and body.iterations >= 1) else None
    entry = await gallery_store.add(
        body.mode, body.title, body.html, body.author, body.requirements, body.criteria,
        iterations=iters, elapsed_sec=elapsed, score=score,
    )
    return {"id": entry["id"], "elapsed_sec": entry.get("elapsed_sec"), "score": entry.get("score")}


@router.post("/clear", dependencies=[Depends(auth.require_host)])
async def clear():
    await gallery_store.clear()
    return {"ok": True}
