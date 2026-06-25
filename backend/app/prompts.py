"""Mode-specific system prompts for the three paradigms.

All code-producing prompts demand a single self-contained HTML document so the
output renders directly inside a sandboxed iframe.
"""
import random

from .compliance_assets import compliance_block
from .harness_assets import harness_block

_HTML_RULES = (
    "Output ONLY a complete, self-contained HTML document starting with <!DOCTYPE html>. "
    "Inline all CSS and JS. No external build step, no imports except web fonts/CDN scripts. "
    "Do not wrap the document in markdown code fences. Do not add any commentary before or "
    "after the HTML."
)

# Every app-builder gets this so the generated app genuinely works in the preview.
FUNCTIONAL = (
    "CRITICAL: the app MUST be fully functional end to end — every button, form and interaction "
    "actually works, not a mockup. Persist the user's data with localStorage so it survives reloads "
    "(localStorage IS available in the runtime); wrap storage access in try/catch and fall back to "
    "in-memory state. Initialize with sensible empty state and render the UI from that state."
)

# Distinct 'flavors' so each vibecoding reroll diverges in stack + aesthetic.
VIBE_FLAVORS = [
    "neobrutalist look, thick black borders, bright accent colors, vanilla JS",
    "glassmorphic frosted panels, soft gradients, Alpine.js via CDN",
    "retro terminal / green-on-black monospace aesthetic, vanilla JS",
    "clean minimal Swiss design, lots of whitespace, system fonts, vanilla JS",
    "playful rounded cards, pastel palette, micro-animations, vanilla JS",
    "dark dashboard style with neon accents, Chart-like visuals, vanilla JS",
    "warm editorial magazine layout, serif headings, vanilla JS",
]


def pick_flavor() -> str:
    return random.choice(VIBE_FLAVORS)


def vibe_generate(idea: str, flavor: str) -> str:
    system = (
        "You are a fast, opinionated builder doing 'vibe coding'. You make bold, "
        "independent choices about stack, libraries and visual style and ship a working "
        "app immediately. For THIS build, commit to this aesthetic/stack direction: "
        f"{flavor}. Make it genuinely interactive and functional, not a mockup. "
        # This is the FIRST quick pass — vibe coding ships fast and incomplete, so the
        # user has to iterate. Deliberately under-deliver on the first build only.
        "IMPORTANT: this is a fast FIRST DRAFT. Build the single most central feature so it "
        "works, but deliberately leave out 1-2 obvious secondary requirements the user clearly "
        "implied (e.g. a secondary feature, input validation, an empty/edge-case state, editing or "
        "deleting, or sorting/filtering). Ship it confidently as if it's done — do NOT add comments, "
        "TODOs or any mention that something is missing. The gaps should be real but discoverable only "
        "by trying the app, so the user notices and asks for another iteration. " + _HTML_RULES + " " + FUNCTIONAL
    )
    return system, f"Build this app: {idea}"


def vibe_say(text: str, first: bool) -> tuple[str, str]:
    """A short, conversational agent turn — what a coding agent says before it builds."""
    if first:
        system = (
            "You are an upbeat, expert vibe-coding agent talking to a user in a chat. The user just told "
            "you what app they want. In 2-4 short sentences, first person, acknowledge the request and "
            "describe concretely what you're about to build and the approach you'll take — the stack/style "
            "choice you're making, and 2-3 specific features you'll include. Sound like you're rolling up "
            "your sleeves. Do NOT write any code or code blocks. End by saying you're building it now."
        )
        user = f"The user wants: {text}"
    else:
        system = (
            "You are a vibe-coding agent iterating on an app you already built, talking to the user in chat. "
            "In 1-3 short sentences, first person, acknowledge their requested change and say specifically "
            "what you'll adjust. Do NOT write code. End by saying you're updating it now."
        )
        user = f"The user's requested change: {text}"
    return system, user


def vibe_refine(idea: str, current_html: str, feedback: str) -> tuple[str, str]:
    system = (
        "You are iterating on an existing vibe-coded app. Apply the requested change while "
        "keeping everything else working and preserving the existing visual style. Return the "
        "FULL revised document. " + _HTML_RULES + " " + FUNCTIONAL
    )
    user = (
        f"Original goal: {idea}\n\n"
        f"Current HTML:\n{current_html}\n\n"
        f"Requested change / bug to fix: {feedback}"
    )
    return system, user


def vibe_validate(idea: str, current_html: str) -> tuple[str, str]:
    system = (
        "You are a QA reviewer. Critically test the given HTML app against the user's goal. "
        "Find real bugs, broken interactions, and missing requirements. Respond with ONLY a "
        'JSON array of objects: [{"severity":"high|medium|low","issue":"short title",'
        '"detail":"what is wrong / how to reproduce"}]. Maximum 6 items, most important first. '
        "No prose, no code fences."
    )
    user = f"User goal: {idea}\n\nHTML to review:\n{current_html}"
    return system, user


# --- Spec-driven (Kiro-style): steering context + requirements → design → tasks,
#     then per-task execution. Three artifacts live in .kiro/specs/<feature>/. ---

_SPEC_MD_RULES = (
    "Output GitHub-flavored markdown ONLY — the literal contents of the file, no preamble, "
    "no surrounding code fences, no commentary."
)

# Always-on project context, mirroring Kiro's .kiro/steering/ files.
STEERING = {
    "product.md": (
        "# Product steering\n\n"
        "- Build focused, single-purpose apps that nail the core user task.\n"
        "- Every interaction must actually work — no placeholders or dead buttons.\n"
        "- Persist the user's data locally so it survives a reload.\n"
        "- Keep the UI clean, modern and immediately usable.\n"
    ),
    "tech.md": (
        "# Tech steering\n\n"
        "- Ship a single self-contained `index.html`: inline `<style>` + vanilla JS.\n"
        "- No frameworks, no build step, no external scripts.\n"
        "- Use `localStorage` for persistence (it is available in the runtime).\n"
        "- Semantic, accessible, keyboard-friendly HTML.\n"
    ),
    "structure.md": (
        "# Structure steering\n\n"
        "- One file, three sections: `<style>`, the markup, then a `<script>` at the end.\n"
        "- Hold app state in one JS object; render the UI from state; save to localStorage on change.\n"
    ),
}


def steering_block() -> str:
    return "\n".join(f"===== .kiro/steering/{name} =====\n{body}" for name, body in STEERING.items())


_REVISE = (
    " You are REVISING the existing file per the user's update below: apply their change, keep "
    "everything else intact, and return the FULL updated file in the same format."
)


def spec_requirements(idea: str, feedback: str = "", current: str = "", compliance: list[str] | None = None) -> tuple[str, str]:
    base = (
        "You are Kiro's Requirements phase. Produce `.kiro/specs/<feature>/requirements.md`, "
        "incorporating the project steering context below.\n"
        "# Requirements\n## Introduction — one paragraph.\n"
        "## Requirements — a numbered list. For EACH requirement use:\n"
        "### R<n>: <short title>\n"
        "**User story:** As a <role>, I want <feature>, so that <benefit>.\n"
        "**Acceptance criteria (EARS):**\n"
        "- WHEN <trigger> THE SYSTEM SHALL <response>\n"
        "- WHILE <state> THE SYSTEM SHALL <response>\n"
        "- IF <condition> THEN THE SYSTEM SHALL <response>\n"
        "Be precise and testable. Scope to a single self-contained HTML page.\n"
        "Also add a final '## Compliance criteria' section turning the company compliance rules below "
        "into testable acceptance criteria the app must meet. "
        + _SPEC_MD_RULES + "\n\n" + compliance_block(compliance)
    )
    if feedback:
        system = base + _REVISE + " Keep the spec focused (2-4 requirements).\n\n" + steering_block()
        user = f"App idea: {idea}\n\n=== current requirements.md ===\n{current}\n\nUser's update: {feedback}\n\nReturn the full revised requirements.md."
    else:
        system = base + " Produce EXACTLY 2 requirements (R1 and R2) — the two most essential capabilities, to keep the spec easy to follow in a workshop.\n\n" + steering_block()
        user = f"App idea: {idea}\n\nWrite requirements.md."
    return system, user


def spec_design(idea: str, requirements: str, feedback: str = "", current: str = "", compliance: list[str] | None = None) -> tuple[str, str]:
    base = (
        "You are Kiro's Design phase. Produce `.kiro/specs/<feature>/design.md`: the technical design "
        "that satisfies the approved requirements, honoring the steering context.\n"
        "# Design\n## Overview — one paragraph.\n"
        "## Architecture & Tech — single self-contained HTML, inline CSS, vanilla JS, localStorage.\n"
        "## Data Model — entities, fields, where state lives & how it persists.\n"
        "## Components — each UI/logic component, mapped to requirement ids (R<n>).\n"
        "## Data Flow — how a user action moves through the system (a short numbered sequence).\n"
        "## Traceability — a table mapping each R<n> to where it is handled.\n"
        "## Compliance — how the design meets each compliance rule below.\n"
        + _SPEC_MD_RULES + "\n\n" + compliance_block(compliance)
    )
    if feedback:
        system = base + _REVISE + "\n\n" + steering_block()
        user = (
            f"App idea: {idea}\n\n=== requirements.md ===\n{requirements}\n\n"
            f"=== current design.md ===\n{current}\n\nUser's update: {feedback}\n\nReturn the full revised design.md."
        )
    else:
        system = base + "\n\n" + steering_block()
        user = f"App idea: {idea}\n\n=== requirements.md ===\n{requirements}\n\nWrite design.md."
    return system, user


def spec_tasks(idea: str, requirements: str, design: str, feedback: str = "", current: str = "") -> tuple[str, str]:
    base = (
        "You are Kiro's Implementation Planning phase. Produce `.kiro/specs/<feature>/tasks.md`: a TIGHT, "
        "ordered plan. Use a checkbox list. Each task on ONE line in EXACTLY this shape:\n"
        "- [ ] T<n> (R<ids>): <imperative coding task>\n"
        "Generate AT MOST 5 tasks (aim for 3-5). Each task is a SUBSTANTIAL, independently shippable slice "
        "that may cover several requirements — combine related work into one task and do NOT over-decompose "
        "into tiny steps (e.g. 'scaffold + layout', 'core CRUD + persistence', 'summary/visuals', 'polish'). "
        "Start the file with `# Tasks`. " + _SPEC_MD_RULES
    )
    ctx = f"App idea: {idea}\n\n=== requirements.md ===\n{requirements}\n\n=== design.md ===\n{design}\n\n"
    if feedback:
        system = base + _REVISE
        user = ctx + f"=== current tasks.md ===\n{current}\n\nUser's update: {feedback}\n\nReturn the full revised tasks.md."
    else:
        system = base
        user = ctx + "Write tasks.md."
    return system, user


def spec_task(idea: str, design: str, tasks: str, current_html: str, task_id: str, task_text: str, compliance: list[str] | None = None) -> tuple[str, str]:
    """Execute ONE task from tasks.md, Kiro-style, on top of the current code."""
    system = (
        "You are Kiro executing ONE task from tasks.md. Implement ONLY the current task and integrate it "
        "into the existing index.html WITHOUT breaking or removing previously completed tasks. Return the "
        f"FULL updated self-contained HTML document. Add an HTML comment <!-- {task_id} done --> next to the "
        "code you add for this task. Follow design.md and the steering context exactly. "
        + _HTML_RULES + " " + FUNCTIONAL + "\n\n" + steering_block() + "\n\n" + compliance_block(compliance)
    )
    cur = current_html.strip() or "(no code yet — this is the first task; create the initial document)"
    user = (
        f"App idea: {idea}\n\n=== design.md ===\n{design}\n\n=== tasks.md ===\n{tasks}\n\n"
        f"=== current index.html ===\n{cur}\n\n"
        f"Now implement THIS task only — {task_id}: {task_text}"
    )
    return system, user


def spec_validate(idea: str, html: str, requirements: str, design: str) -> tuple[str, str]:
    system = (
        "You are Kiro's verification step. Audit the implementation against the spec: does it satisfy every "
        "requirement in requirements.md and follow design.md? Respond with ONLY a JSON array of objects: "
        '[{"severity":"high|medium|low","ref":"R<n> or design","issue":"short title",'
        '"detail":"what is missing/violated"}]. If fully compliant, return []. '
        "Max 8 items, most important first. No prose, no code fences."
    )
    user = (
        f"App idea: {idea}\n\n=== requirements.md ===\n{requirements}\n\n"
        f"=== design.md ===\n{design}\n\n=== index.html ===\n{html}"
    )
    return system, user


def harness_generate(feature: str) -> tuple[str, str]:
    system = (
        "You are building inside a company engineering harness. The locked rule files below "
        "(AGENTS.md, CLAUDE.md, .cursor/rules, .github/copilot-instructions, .eslintrc.json, "
        ".editorconfig, design-system.css, architecture.md) are "
        "injected into your context on every request and are ENFORCED by the lint gate in pre-commit/CI "
        "— code that violates them fails the build. Implement the requested feature in full compliance "
        "so the result is indistinguishable in look & feel from every other app on this harness. "
        + _HTML_RULES + " " + FUNCTIONAL + "\n\n" + harness_block() + "\n\n" + compliance_block()
    )
    return system, f"Implement this feature inside the harness: {feature}"


def harness_refine(feature: str, current_html: str, feedback: str) -> tuple[str, str]:
    system = (
        "You are iterating on an app already built inside the company engineering harness. Apply the "
        "requested change while keeping everything else working, and STAY fully compliant with the locked "
        "rules below (house-lint enforces them — violations fail the build). Return the FULL revised HTML "
        "document. " + _HTML_RULES + " " + FUNCTIONAL + "\n\n" + harness_block() + "\n\n" + compliance_block()
    )
    user = (
        f"Feature: {feature}\n\nRequested change: {feedback}\n\nCurrent index.html:\n{current_html}"
    )
    return system, user


def harness_fix(feature: str, current_html: str, violations: list[str]) -> tuple[str, str]:
    bullets = "\n".join(f"- {v}" for v in violations)
    system = (
        "You are the harness auto-fix step (like `lint --fix`). The house-lint gate REJECTED the "
        "current build for the violations listed below. Return the FULL corrected HTML document that "
        "passes every rule, using ONLY the locked design system and layout contract. Change nothing "
        "else about the feature. " + _HTML_RULES + "\n\n" + harness_block() + "\n\n" + compliance_block()
    )
    user = f"Feature: {feature}\n\nhouse-lint violations to fix:\n{bullets}\n\nCurrent index.html:\n{current_html}"
    return system, user
