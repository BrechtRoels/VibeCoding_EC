"""Vercel serverless entrypoint — exposes the FastAPI ASGI app as `app`.

The backend lives in ../backend/app; add it to the path and import the app.
Vercel's @vercel/python runtime detects the ASGI `app` and serves it.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.main import app  # noqa: E402,F401
