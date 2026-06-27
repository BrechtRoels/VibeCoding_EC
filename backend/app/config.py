"""Environment configuration for the PwC GenAI Shared Service.

Mirrors the standard config pattern from the pwc-genai skill.
"""
import os

from dotenv import load_dotenv

load_dotenv()

GENAI_BASE_URL = os.getenv("GENAI_BASE_URL", "https://genai-sharedservice-emea.pwc.com")
GENAI_API_KEY = os.getenv("GENAI_API_KEY", "")
GENAI_API_VERSION = os.getenv("GENAI_API_VERSION", "")
# HTML/code generation uses the strong model (Opus).
GENAI_LLM_MODEL = os.getenv("GENAI_LLM_MODEL", "bedrock.anthropic.claude-opus-4")

# The conversational "agent chat" (and lightweight QA verdicts) use a cheap, fast
# streaming model — keeps cost/latency low for the chat while HTML stays on Opus.
GENAI_CHAT_MODEL = os.getenv("GENAI_CHAT_MODEL", "bedrock.anthropic.claude-haiku-4-5")

USE_MOCK_AI = os.getenv("USE_MOCK_AI", "false").lower() == "true"

# Shared access tokens. The studio token unlocks the participant app (LLM calls,
# gallery submit); the wall token is the facilitator's host secret (clear/reset).
# Sent by the client as the `X-Studio-Token` header and enforced server-side — the
# old client-only password check was cosmetic. Set both to "" to disable auth.
STUDIO_PASSWORD = os.getenv("STUDIO_PASSWORD", "PwCVibeCoding2026")
WALL_PASSWORD = os.getenv("WALL_PASSWORD", "PwCVibeWall2026")
# Facilitator admin secret — unlocks the /admin control screen that steers which
# labs are in the training and locks/unlocks them live. Highest privilege
# (admin >= host/wall >= studio/participant).
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "PwCVibeAdmin2026")

# Max in-flight GenAI calls across all users on this process. Smooths bursts when
# many people (e.g. a 50-person workshop) share one API key. Excess calls queue.
GENAI_MAX_CONCURRENCY = int(os.getenv("GENAI_MAX_CONCURRENCY", "8"))

# Upper bound on tokens the model may emit per call. A full single-file app can be
# large; the platform default truncates it (apps come out half-written and don't
# work), so we request generous headroom.
GENAI_MAX_OUTPUT_TOKENS = int(os.getenv("GENAI_MAX_OUTPUT_TOKENS", "16000"))
