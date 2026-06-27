"""Compliance routes — the deterministic 'submit for approval' review gate.

Shared across all three modes. Pure deterministic check (no LLM, no streaming)
so a live workshop gets reproducible verdicts.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import auth
from ..compliance_assets import CATEGORIES, COMPLIANCE_RULES, run_compliance_check

router = APIRouter(prefix="/api/compliance", tags=["compliance"])


class ReviewBody(BaseModel):
    html: str
    categories: list[str] | None = None  # spec mode passes the participant's chosen bar


@router.get("/rules")
async def rules():
    """The compliance rule set + categories — for the picker / spec voice-over."""
    return {"rules": COMPLIANCE_RULES, "categories": CATEGORIES}


@router.post("/review", dependencies=[Depends(auth.require_auth)])
async def review(body: ReviewBody):
    """Run the compliance gate. Approved when every error-severity rule passes.

    If `categories` is given, only those compliance categories are enforced
    (the participant's self-defined compliance bar in spec mode).
    """
    results = run_compliance_check(body.html)
    if body.categories is not None:
        keep = set(body.categories)
        results = [r for r in results if r["category"] in keep]
    approved = all(r["status"] == "pass" for r in results if r["severity"] == "error")
    return {"approved": approved, "results": results}
