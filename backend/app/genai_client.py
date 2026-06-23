"""PwC GenAI Shared Service client — streaming LLM helpers.

Grounds on the pwc-genai skill (references/endpoints.md). Auth via the `api-key`
header (NOT `Authorization: Bearer`); streaming over `/v1/responses` with
`"stream": true`, SSE lines prefixed `data: ` and terminated by `data: [DONE]`.
"""
import asyncio
import json
import logging
from typing import AsyncIterator

import httpx

from . import config

logger = logging.getLogger(__name__)

MAX_RETRIES = 4
RETRY_BACKOFF = [1, 3, 8, 15]


class GenAIRateLimited(Exception):
    """Raised when the shared GenAI key is rate-limited (HTTP 429) after retries."""


# Caps concurrent GenAI calls across all users sharing this process/key. Created
# lazily so it binds to the running event loop.
_sem: "asyncio.Semaphore | None" = None


def _semaphore() -> "asyncio.Semaphore":
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(config.GENAI_MAX_CONCURRENCY)
    return _sem


def _params() -> dict:
    return {"api-version": config.GENAI_API_VERSION} if config.GENAI_API_VERSION else {}


def _headers() -> dict:
    return {
        "api-key": config.GENAI_API_KEY,
        "Content-Type": "application/json",
    }


def _extract_text(data: dict) -> str:
    """Extract text from any of the three documented response formats."""
    if "output" in data:
        for item in data["output"]:
            if item.get("type") == "message":
                for c in item.get("content", []):
                    if c.get("type") == "output_text":
                        return c["text"]
    if "choices" in data:
        return data["choices"][0]["message"]["content"]
    if "response" in data:
        return data["response"]
    return str(data)


def build_input(system: str, user: str) -> str:
    """Combine a system instruction and user content into one `input` string.

    The documented `/v1/responses` contract only guarantees the `input` field,
    so we fold the system prompt in rather than relying on `instructions`.
    """
    return f"{system.strip()}\n\n---\n\n{user.strip()}"


async def llm_stream(prompt: str, model: str | None = None) -> AsyncIterator[str]:
    """Stream text deltas from the LLM. Yields incremental string chunks."""
    model = model or config.GENAI_LLM_MODEL

    if config.USE_MOCK_AI:
        async for delta in _mock_stream(prompt):
            yield delta
        return

    body = {
        "model": model,
        "input": prompt,
        "stream": True,
        "max_output_tokens": config.GENAI_MAX_OUTPUT_TOKENS,
    }
    async with _semaphore():
        # Retry only the connection/first-response: 429 (shared-key rate limit) and 5xx.
        # Once bytes are streaming we can't safely retry, so mid-stream errors propagate.
        for attempt in range(MAX_RETRIES):
            # Generous read timeout: a full single-file app can stream for a while.
            async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=15.0)) as client:
                async with client.stream(
                    "POST",
                    f"{config.GENAI_BASE_URL}/v1/responses",
                    params=_params(),
                    headers=_headers(),
                    json=body,
                ) as resp:
                    if resp.status_code == 429 or resp.status_code >= 500:
                        await resp.aread()
                        if attempt < MAX_RETRIES - 1:
                            await asyncio.sleep(RETRY_BACKOFF[attempt])
                            continue
                        if resp.status_code == 429:
                            raise GenAIRateLimited("shared model busy")
                        resp.raise_for_status()
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        payload = line[6:]
                        if payload == "[DONE]":
                            return
                        try:
                            chunk = json.loads(payload)
                        except json.JSONDecodeError:
                            continue

                        delta = ""
                        ctype = chunk.get("type", "")
                        if ctype and ctype != "response.output_text.delta":
                            continue  # Responses-API lifecycle event, no user text
                        if "delta" in chunk and isinstance(chunk["delta"], str):
                            delta = chunk["delta"]
                        elif "choices" in chunk:
                            delta = chunk["choices"][0].get("delta", {}).get("content") or ""
                        elif "output" in chunk:
                            for item in chunk.get("output", []):
                                for c in item.get("content", []):
                                    if c.get("type") == "output_text":
                                        delta = c.get("text", "")
                        if delta:
                            yield delta
                    return


async def llm_complete(prompt: str, model: str | None = None) -> str:
    """Non-streaming completion with retry/backoff. Used for the spec self-check."""
    model = model or config.GENAI_LLM_MODEL

    if config.USE_MOCK_AI:
        buf = ""
        async for delta in _mock_stream(prompt):
            buf += delta
        return buf

    last_error: Exception | None = None
    async with _semaphore():
        for attempt in range(MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=120) as client:
                    resp = await client.post(
                        f"{config.GENAI_BASE_URL}/v1/responses",
                        params=_params(),
                        headers=_headers(),
                        json={
                            "model": model,
                            "input": prompt,
                            "max_output_tokens": config.GENAI_MAX_OUTPUT_TOKENS,
                        },
                    )
                    resp.raise_for_status()
                    return _extract_text(resp.json())
            except (httpx.TimeoutException, httpx.ReadError, httpx.WriteError,
                    httpx.ConnectError, OSError) as e:
                last_error = e
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(RETRY_BACKOFF[attempt])
            except httpx.HTTPStatusError as e:
                sc = e.response.status_code
                if (sc == 429 or sc >= 500) and attempt < MAX_RETRIES - 1:
                    last_error = e
                    await asyncio.sleep(RETRY_BACKOFF[attempt])
                elif sc == 429:
                    raise GenAIRateLimited("shared model busy")
                else:
                    raise
    assert last_error is not None
    raise last_error


# ---------------------------------------------------------------------------
# Mock mode — canned streamed output so the UI is demoable without a key.
# ---------------------------------------------------------------------------

_MOCK_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Mock App</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; display: grid; place-items: center;
         min-height: 100vh; background: #1a1a1a; color: #f2f2f2; }
  .card { background: #232323; border: 1px solid #3d3d3d; border-radius: 12px; padding: 32px;
          text-align: center; }
  h1 { color: #d04a02; margin: 0 0 8px; }
  button { margin-top: 16px; padding: 10px 18px; border: none; border-radius: 8px;
           background: #d04a02; color: #fff; font-size: 15px; cursor: pointer; }
  #n { font-size: 48px; font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    <h1>Mock Counter</h1>
    <p>USE_MOCK_AI is on — this is canned output.</p>
    <div id="n">0</div>
    <button onclick="document.getElementById('n').textContent=++c">Increment</button>
  </div>
  <script>let c = 0;</script>
</body>
</html>
"""

_MOCK_SPEC = """# Spec: Mock App

## Architecture
- Single-page static HTML, no backend. State held in memory.

## Data Model
- `count: integer` — current counter value, starts at 0.

## Requirements (EARS)
- **R1** WHEN the page loads, the system SHALL display the count as 0.
- **R2** WHEN the user clicks "Increment", the system SHALL increase the count by 1.
- **R3** WHILE the app is running, the system SHALL render the current count prominently.
"""

_MOCK_VALIDATE = """[
  {"severity": "high", "issue": "No reset control", "detail": "User cannot return the counter to zero."},
  {"severity": "medium", "issue": "No keyboard support", "detail": "Increment is mouse-only."},
  {"severity": "low", "issue": "No persistence", "detail": "Count is lost on refresh."}
]"""


_MOCK_DOCS = {
    "requirements.md": "# Requirements\n\n## Introduction\nMock counter app.\n\n"
        "### R1: Display count\n**User story:** As a user, I want to see the count.\n"
        "**Acceptance criteria (EARS):**\n- WHEN the page loads the system SHALL display 0.\n\n"
        "### R2: Increment\n**User story:** As a user, I want to increment.\n"
        "**Acceptance criteria (EARS):**\n- WHEN I click Increment the system SHALL add 1.\n",
    "architecture.md": "# Architecture\n## Tech Stack\nSingle self-contained HTML, vanilla JS.\n"
        "## Components\n- CounterView\n- IncrementButton\n## State & Data Model\n`count: int = 0`\n"
        "## Constraints & Conventions\n- No external network calls.\n",
    "design.md": "# Design\n## Screens & Layout\nCentered card.\n## Components\n- Count display (R1)\n"
        "- Increment button (R2)\n## Traceability\n| Req | Where |\n|--|--|\n| R1 | #n |\n| R2 | button |\n",
    "tasks.md": "# Tasks\n- [ ] T1 (R1): Render the count display\n- [ ] T2 (R2): Wire the increment button\n"
        "- [ ] T3 (R1): Initialize count to 0\n",
}


async def _mock_stream(prompt: str) -> AsyncIterator[str]:
    """Pick canned content based on cues in the prompt, stream it in chunks."""
    low = prompt.lower()
    if "the user wants:" in low or "the user's requested change:" in low:
        body = (
            "Love it — I'll build you a clean, single-page app with a friendly layout, "
            "live interactivity, and a tidy state model. Going with a minimal modern look and "
            "vanilla JS so it just runs. Building it now…"
        )
    elif "write requirements.md" in low:
        body = _MOCK_DOCS["requirements.md"]
    elif "write architecture.md" in low:
        body = _MOCK_DOCS["architecture.md"]
    elif "write design.md" in low:
        body = _MOCK_DOCS["design.md"]
    elif "write tasks.md" in low:
        body = _MOCK_DOCS["tasks.md"]
    elif "ears" in low or "spec only" in low or "requirements in" in low:
        body = _MOCK_SPEC
    elif "json" in low and ("bug" in low or "review" in low or "validate" in low or "audit" in low):
        body = _MOCK_VALIDATE
    else:
        body = _MOCK_HTML

    # Stream ~40-char chunks with a small delay to simulate token streaming.
    step = 40
    for i in range(0, len(body), step):
        yield body[i:i + step]
        await asyncio.sleep(0.02)
