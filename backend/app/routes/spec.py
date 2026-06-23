"""Spec-driven (Kiro-style) routes — steering, the three artifacts, per-task exec, verify."""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from .. import config, prompts
from ..genai_client import GenAIRateLimited, build_input, llm_complete
from ..routes.vibe import _parse_issues
from ..sse import stream_response

router = APIRouter(prefix="/api/spec", tags=["spec"])

DocKind = Literal["requirements", "design", "tasks"]


class DocBody(BaseModel):
    kind: DocKind
    idea: str
    requirements: str = ""
    design: str = ""


class TaskBody(BaseModel):
    idea: str
    design: str
    tasks: str
    current_html: str = ""
    task_id: str
    task_text: str


class ValidateBody(BaseModel):
    idea: str
    html: str
    requirements: str
    design: str


@router.get("/steering")
async def steering():
    """The always-on project context (.kiro/steering/) shown in the explorer."""
    return {"files": [{"name": name, "lang": "markdown", "content": body} for name, body in prompts.STEERING.items()]}


@router.post("/doc")
async def doc(body: DocBody):
    if body.kind == "requirements":
        system, user = prompts.spec_requirements(body.idea)
    elif body.kind == "design":
        system, user = prompts.spec_design(body.idea, body.requirements)
    else:  # tasks
        system, user = prompts.spec_tasks(body.idea, body.requirements, body.design)
    return stream_response(system, user)


@router.post("/task")
async def task(body: TaskBody):
    """Execute one task from tasks.md on top of the current code (Kiro-style)."""
    system, user = prompts.spec_task(
        body.idea, body.design, body.tasks, body.current_html, body.task_id, body.task_text
    )
    return stream_response(system, user)


@router.post("/validate")
async def validate(body: ValidateBody):
    system, user = prompts.spec_validate(body.idea, body.html, body.requirements, body.design)
    try:
        raw = await llm_complete(build_input(system, user), model=config.GENAI_CHAT_MODEL)
    except GenAIRateLimited:
        return {"issues": [{"severity": "low", "ref": "verify", "issue": "Model busy", "detail": "The shared model is busy — verification will work again shortly."}]}
    return {"issues": _parse_issues(raw)}
