"""Harness routes — locked rule files, build, the house-lint gate, and auto-fix."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import auth, prompts
from ..harness_assets import HARNESS_FILES, run_harness_check
from ..sse import stream_response

router = APIRouter(prefix="/api/harness", tags=["harness"])


class HarnessBody(BaseModel):
    feature: str


class RefineBody(BaseModel):
    feature: str
    current_html: str
    feedback: str


class FixBody(BaseModel):
    feature: str
    current_html: str
    violations: list[str]


class CheckBody(BaseModel):
    html: str


@router.get("/config")
async def config():
    """Expose the locked harness: the rule files (shown in the IDE) + what you control."""
    return {
        "you_control": "The feature inside the main content area",
        "enforced_by": ["context injection (every request)", "house-lint pre-commit", "house-lint CI gate"],
        "files": [{"name": f["name"], "lang": f["lang"], "content": f["content"]} for f in HARNESS_FILES],
    }


@router.post("/generate", dependencies=[Depends(auth.require_active_mode("harness"))])
async def generate(body: HarnessBody):
    system, user = prompts.harness_generate(body.feature)
    return stream_response(system, user)


@router.post("/refine", dependencies=[Depends(auth.require_active_mode("harness"))])
async def refine(body: RefineBody):
    """Iterate on the current harness app (change buttons, etc.) staying compliant."""
    system, user = prompts.harness_refine(body.feature, body.current_html, body.feedback)
    return stream_response(system, user)


@router.post("/check", dependencies=[Depends(auth.require_active_mode("harness"))])
async def check(body: CheckBody):
    """The deterministic enforcement gate — runs house-lint against the build."""
    results = run_harness_check(body.html)
    passed = all(r["status"] == "pass" for r in results if r["severity"] == "error")
    return {"passed": passed, "results": results}


@router.post("/fix", dependencies=[Depends(auth.require_active_mode("harness"))])
async def fix(body: FixBody):
    system, user = prompts.harness_fix(body.feature, body.current_html, body.violations)
    return stream_response(system, user)
