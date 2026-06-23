# Three Ways to Build

An interactive studio that makes three AI-assisted development paradigms tangible by
*actually building working apps* three different ways — live-streamed from the PwC
GenAI Shared Service (Opus) and rendered as HTML inside the app.

| Mode | Principle | What it demonstrates |
|------|-----------|----------------------|
| **1 · Vibecoding** | Prompt → app, iterate fast | Non-determinism (reroll / compare variants) **and** the generate → test → refine loop with version history + self-validation |
| **2 · Spec-Driven** | EARS spec first, then build | Architecture + data model + testable EARS requirements as the single source of truth; build implements the spec exactly and cites requirement ids |
| **3 · Harness Engineering** | Locked design & architecture | Design system + layout + architecture are fixed; you only describe the feature, so every output looks & is structured identically |

## Architecture

- **Backend** — FastAPI + httpx, streaming `/v1/responses` from PwC GenAI as SSE.
  Grounded on the `pwc-genai` skill (api-key header, `data:`/`[DONE]` framing, retries).
- **Frontend** — React + Vite + TypeScript, PwC dark theme. Streams tokens into a live
  code pane and renders generated HTML in a sandboxed `<iframe srcDoc>`.

## Workshop

Running this with participants? See **[DEMO.md](DEMO.md)** — a ready-to-run guide that has
everyone build the same **Expense Tracker** three ways (with copy-paste prompts) to feel the
contrast between the paradigms.

## Run it

### Backend
```bash
cd backend
python -m venv .venv && ./.venv/bin/pip install -r requirements.txt
cp .env.example .env          # set GENAI_API_KEY and GENAI_LLM_MODEL (your Opus id)
./.venv/bin/uvicorn app.main:app --port 8011 --reload
```

Set `USE_MOCK_AI=true` in `.env` to run without a key (canned streamed output).

### Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5180  (proxies /api → :8011)
```

## API

| Endpoint | Purpose |
|----------|---------|
| `POST /api/vibe/generate` | Stream an app (optional `flavor` for reroll) |
| `POST /api/vibe/refine` | Stream a revised app from feedback + current HTML |
| `POST /api/vibe/validate` | Self-check → JSON list of issues |
| `POST /api/spec/spec` | Stream the EARS spec |
| `POST /api/spec/build` | Stream the app built strictly from the spec |
| `GET  /api/harness/config` | What the harness locks vs you control |
| `POST /api/harness/generate` | Stream a feature built on the locked harness |

## Notes

- The Opus model id is `.env`-configurable (`GENAI_LLM_MODEL`); if the supplied id
  isn't enabled, the GenAI error surfaces in the UI.
- Generated HTML runs sandboxed (`allow-scripts`, no `allow-same-origin`).
- The code pane streams live; the preview renders on completion to avoid iframe thrash.
