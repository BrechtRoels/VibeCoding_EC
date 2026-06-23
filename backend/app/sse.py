"""SSE helpers — wrap an LLM token stream into an event-stream response."""
import json
import logging
from typing import AsyncIterator

from fastapi.responses import StreamingResponse

from .genai_client import GenAIRateLimited, build_input, llm_stream

logger = logging.getLogger(__name__)

_BUSY_MSG = "The shared model is busy right now — please wait a few seconds and try again."


async def _frames(system: str, user: str, model: str | None = None) -> AsyncIterator[str]:
    """Yield SSE frames: many `data:` token frames, then a terminal `done` event."""
    prompt = build_input(system, user)
    try:
        async for delta in llm_stream(prompt, model=model):
            yield f"data: {json.dumps({'delta': delta})}\n\n"
    except GenAIRateLimited:
        yield f"event: error\ndata: {json.dumps({'message': _BUSY_MSG, 'rateLimited': True})}\n\n"
    except Exception as e:  # surface GenAI/network errors to the UI
        logger.exception("stream failed")
        msg = _BUSY_MSG if "429" in str(e) else str(e)
        yield f"event: error\ndata: {json.dumps({'message': msg})}\n\n"
    yield "event: done\ndata: {}\n\n"


def stream_response(system: str, user: str, model: str | None = None) -> StreamingResponse:
    return StreamingResponse(
        _frames(system, user, model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
