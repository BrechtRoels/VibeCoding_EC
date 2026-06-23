#!/usr/bin/env bash
# Three Ways to Build -- one-command dev launcher.
# Sets up (first run) and starts the FastAPI backend + Vite frontend together.
#
# Usage:
#   ./run.sh           # start both servers
#   ./run.sh --mock    # start in mock mode (no GenAI key needed)
#   ./run.sh --setup   # only install deps, don't start
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="${ROOT}/backend"
FRONTEND="${ROOT}/frontend"
BACKEND_PORT=8011
FRONTEND_PORT=5180

MOCK=0
SETUP_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --mock) MOCK=1 ;;
    --setup) SETUP_ONLY=1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# ---- Backend setup ----
if [ ! -d "${BACKEND}/.venv" ]; then
  echo ">> Creating Python venv..."
  python3 -m venv "${BACKEND}/.venv"
fi
echo ">> Installing backend deps..."
"${BACKEND}/.venv/bin/pip" install -q -r "${BACKEND}/requirements.txt"

if [ ! -f "${BACKEND}/.env" ]; then
  echo ">> Creating backend/.env from .env.example (edit it to add your GenAI key)..."
  cp "${BACKEND}/.env.example" "${BACKEND}/.env"
fi

# ---- Frontend setup ----
if [ ! -d "${FRONTEND}/node_modules" ]; then
  echo ">> Installing frontend deps..."
  ( cd "${FRONTEND}" && npm install )
fi

if [ "${SETUP_ONLY}" = "1" ]; then
  echo ">> Setup complete. Run ./run.sh to start."
  exit 0
fi

# ---- Start both servers ----
PIDS=()
cleanup() {
  echo
  echo ">> Shutting down..."
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

if [ "${MOCK}" = "1" ]; then
  export USE_MOCK_AI=true
  echo ">> Mock mode ON (no GenAI calls)."
fi

echo ">> Starting backend on :${BACKEND_PORT} ..."
( cd "${BACKEND}" && "${BACKEND}/.venv/bin/uvicorn" app.main:app --port "${BACKEND_PORT}" --reload ) &
PIDS+=($!)

echo ">> Starting frontend on :${FRONTEND_PORT} ..."
( cd "${FRONTEND}" && npm run dev ) &
PIDS+=($!)

echo
echo "OK  Backend:  http://localhost:${BACKEND_PORT}/healthz"
echo "OK  Frontend: http://localhost:${FRONTEND_PORT}"
echo "    (Ctrl+C to stop both)"
echo

wait
