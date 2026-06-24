"""Compliance routes — the deterministic 'submit for approval' review gate.

Shared across all three modes. Pure deterministic check (no LLM, no streaming)
so a live workshop gets reproducible verdicts.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from ..compliance_assets import COMPLIANCE_RULES, run_compliance_check

router = APIRouter(prefix="/api/compliance", tags=["compliance"])


class ReviewBody(BaseModel):
    html: str


@router.get("/rules")
async def rules():
    """The compliance rule set — for the spec voice-over / info panel."""
    return {"rules": COMPLIANCE_RULES}


@router.post("/review")
async def review(body: ReviewBody):
    """Run the compliance gate. Approved when every error-severity rule passes."""
    results = run_compliance_check(body.html)
    approved = all(r["status"] == "pass" for r in results if r["severity"] == "error")
    return {"approved": approved, "results": results}
