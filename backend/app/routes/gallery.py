"""Shared gallery routes — submit an app, list the wall, clear (host)."""
from fastapi import APIRouter
from pydantic import BaseModel

from .. import gallery_store

router = APIRouter(prefix="/api/gallery", tags=["gallery"])


class SubmitBody(BaseModel):
    mode: str
    title: str
    html: str
    author: str | None = None
    requirements: str | None = None  # spec mode: the requirements.md to show on the wall
    criteria: list[str] | None = None  # spec mode: the chosen compliance categories


@router.get("")
async def list_gallery():
    return {"entries": gallery_store.list_all()}


@router.post("")
async def submit(body: SubmitBody):
    entry = await gallery_store.add(
        body.mode, body.title, body.html, body.author, body.requirements, body.criteria
    )
    return {"id": entry["id"]}


@router.post("/clear")
async def clear():
    await gallery_store.clear()
    return {"ok": True}
