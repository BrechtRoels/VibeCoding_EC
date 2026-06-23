"""FastAPI entrypoint for the Three Ways to Build studio."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .routes import gallery, harness, spec, vibe

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Three Ways to Build")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev: Vite serves the frontend on another port
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vibe.router)
app.include_router(spec.router)
app.include_router(harness.router)
app.include_router(gallery.router)


@app.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "mock": config.USE_MOCK_AI,
        "model": config.GENAI_LLM_MODEL,
        "chat_model": config.GENAI_CHAT_MODEL,
        "max_concurrency": config.GENAI_MAX_CONCURRENCY,
        "has_key": bool(config.GENAI_API_KEY),
    }
