"""Vibecoding routes — generate, refine (iterate loop), validate (self-check)."""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import auth, config, prompts
from ..genai_client import GenAIRateLimited, build_input, llm_complete
from ..sse import stream_response

_BUSY_ISSUE = {"severity": "low", "issue": "Model busy", "detail": "The shared model is busy — try the QA test again in a few seconds."}

# Every route spends the shared GenAI key and requires the vibe lab to be unlocked.
router = APIRouter(prefix="/api/vibe", tags=["vibe"], dependencies=[Depends(auth.require_active_mode("vibe"))])


class GenerateBody(BaseModel):
    idea: str
    flavor: str | None = None


class SayBody(BaseModel):
    text: str
    first: bool = True


class RefineBody(BaseModel):
    idea: str
    current_html: str
    feedback: str


class ValidateBody(BaseModel):
    idea: str
    current_html: str


@router.post("/say")
async def say(body: SayBody):
    """Streamed conversational agent turn (no code) — cheap chat model, not Opus."""
    system, user = prompts.vibe_say(body.text, body.first)
    return stream_response(system, user, model=config.GENAI_CHAT_MODEL)


@router.post("/generate")
async def generate(body: GenerateBody):
    flavor = body.flavor or prompts.pick_flavor()
    system, user = prompts.vibe_generate(body.idea, flavor)
    return stream_response(system, user)


@router.post("/refine")
async def refine(body: RefineBody):
    system, user = prompts.vibe_refine(body.idea, body.current_html, body.feedback)
    return stream_response(system, user)


@router.post("/validate")
async def validate(body: ValidateBody):
    """Non-streaming self-check returning a parsed list of issues."""
    system, user = prompts.vibe_validate(body.idea, body.current_html)
    try:
        raw = await llm_complete(build_input(system, user), model=config.GENAI_CHAT_MODEL)
    except GenAIRateLimited:
        return {"issues": [_BUSY_ISSUE]}
    return {"issues": _parse_issues(raw)}


def _parse_issues(raw: str) -> list[dict]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1] if "```" in raw[3:] else raw.strip("`")
        raw = raw.lstrip("json").strip()
    start, end = raw.find("["), raw.rfind("]")
    if start != -1 and end != -1:
        try:
            data = json.loads(raw[start:end + 1])
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass
    return [{"severity": "low", "issue": "Could not parse validation output", "detail": raw[:300]}]
