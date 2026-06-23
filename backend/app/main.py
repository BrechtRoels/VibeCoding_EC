"""FastAPI entrypoint for the Three Ways to Build studio."""
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .routes import gallery, harness, session, spec, vibe

logging.basicConfig(level=logging.INFO)

# When deployed as a Vercel service mounted under a route prefix (e.g. /_/backend),
# requests may arrive carrying that prefix. This streaming-safe ASGI middleware
# strips it so the app's /api/* routes match whether or not the platform stripped it.
ROUTE_PREFIX = os.getenv("ROUTE_PREFIX", "/_/backend").rstrip("/")


class StripPrefixMiddleware:
    def __init__(self, app, prefix: str):
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http" and self.prefix:
            path = scope.get("path", "")
            if path == self.prefix or path.startswith(self.prefix + "/"):
                new_path = path[len(self.prefix):] or "/"
                scope = dict(scope)
                scope["path"] = new_path
                scope["raw_path"] = new_path.encode("utf-8")
        await self.app(scope, receive, send)


app = FastAPI(title="Three Ways to Build")

if ROUTE_PREFIX:
    app.add_middleware(StripPrefixMiddleware, prefix=ROUTE_PREFIX)

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
app.include_router(session.router)


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
