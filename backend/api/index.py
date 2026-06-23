"""Vercel Python entrypoint for the backend service (root: backend/).

Exposes the FastAPI ASGI app as `app`. The backend service is mounted under the
`/_/backend` route prefix (see vercel.json); the app strips that prefix itself
(StripPrefixMiddleware) so its `/api/*` routes match regardless of stripping.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))  # backend/

from app.main import app  # noqa: E402,F401
