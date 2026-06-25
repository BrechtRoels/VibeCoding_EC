"""The 'company harness' — locked rule files + design system + an enforcement gate.

Mirrors how AI coding harnesses are actually enforced in real IDEs:
  * Rule files injected into the agent's context on every request
      - AGENTS.md                         (cross-tool open standard)
      - .cursor/rules/house-style.mdc     (Cursor rules, alwaysApply)
      - .github/copilot-instructions.md   (GitHub Copilot / VS Code)
  * A deterministic gate (linter + pre-commit/CI) that BLOCKS non-compliant
    output — `house-lint.json` describes the rules, `run_harness_check` runs them.

Suggestion (context) + enforcement (the gate) together = the harness.
"""
import re

# ---------------------------------------------------------------------------
# Locked design system (the house tokens + base components).
# ---------------------------------------------------------------------------
HARNESS_CSS = """
:root {
  --c-page: #f3f5f9; --c-surface: #ffffff; --c-raised: #f6f8fc; --c-overlay: #eef1f7;
  --c-edge: #dbe1ea; --c-edge-strong: #c4cdda; --c-fg: #1a1a2e; --c-fg2: #4a5568;
  --c-fg3: #7b8494; --c-primary: #004494; --c-primary-hover: #00336e; --c-primary-fg: #ffffff;
  --c-accent2: #FFD617; --c-danger: #d4351c; --c-success: #00703c; --c-warn: #b58105;
  --c-primary-10: rgba(0,68,148,0.08); --c-shadow: rgba(0,68,148,0.10);
  color-scheme: light;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Inter", Arial, ui-sans-serif, system-ui, -apple-system, sans-serif;
       background: var(--c-page); color: var(--c-fg); line-height: 1.55; -webkit-font-smoothing: antialiased; }

/* European Commission header — EC-blue bar, EU-yellow accent line, EU emblem mark */
.app-header { height: 60px; display: flex; align-items: center; gap: 14px; padding: 0 26px;
              background: var(--c-primary); color: #fff; border-bottom: 3px solid var(--c-accent2); }
.app-header .brand { position: relative; width: 30px; height: 30px; border-radius: 50%;
              background: var(--c-primary); border: 1px solid rgba(255,255,255,0.35); flex-shrink: 0; }
.app-header .brand::before { content: ""; position: absolute; top: 50%; left: 50%; width: 2.4px; height: 2.4px;
              border-radius: 50%; background: var(--c-accent2); transform: translate(-50%, -50%);
              box-shadow: 0 -9px 0 var(--c-accent2), 4.5px -7.8px 0 var(--c-accent2), 7.8px -4.5px 0 var(--c-accent2),
                9px 0 0 var(--c-accent2), 7.8px 4.5px 0 var(--c-accent2), 4.5px 7.8px 0 var(--c-accent2),
                0 9px 0 var(--c-accent2), -4.5px 7.8px 0 var(--c-accent2), -7.8px 4.5px 0 var(--c-accent2),
                -9px 0 0 var(--c-accent2), -7.8px -4.5px 0 var(--c-accent2), -4.5px -7.8px 0 var(--c-accent2); }
.app-header h1 { font-size: 16px; font-weight: 600; margin: 0; color: #fff; letter-spacing: 0.2px; }

.app-body { display: flex; min-height: calc(100vh - 60px); }
.app-sidebar { width: 232px; background: var(--c-surface); border-right: 1px solid var(--c-edge); padding: 18px 14px; }
.app-sidebar a, .app-sidebar .nav-item { display: block; padding: 9px 12px; margin-bottom: 2px; border-radius: 6px;
              color: var(--c-fg2); text-decoration: none; font-size: 14px; font-weight: 500; cursor: pointer; }
.app-sidebar a:hover, .app-sidebar .nav-item:hover { background: var(--c-primary-10); color: var(--c-primary); }
.app-sidebar a.active, .app-sidebar .nav-item.active { background: var(--c-primary); color: #fff; }
.app-main { flex: 1; padding: 32px 38px; max-width: 1040px; }
.app-main h2 { font-size: 22px; font-weight: 700; margin: 0 0 16px; color: var(--c-fg); }

.card { background: var(--c-surface); border: 1px solid var(--c-edge); border-radius: 10px; padding: 20px;
        box-shadow: 0 1px 2px var(--c-shadow); }
.card + .card { margin-top: 16px; }
a { color: var(--c-primary); }
.btn-primary { padding: 10px 18px; border-radius: 6px; border: none; background: var(--c-primary);
               color: var(--c-primary-fg); font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-primary:hover { background: var(--c-primary-hover); }
.btn-secondary { padding: 9px 16px; border-radius: 6px; border: 1px solid var(--c-primary); background: var(--c-surface);
                 color: var(--c-primary); font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-secondary:hover { background: var(--c-primary-10); }
input, textarea, select { background: var(--c-surface); border: 1px solid var(--c-edge-strong); border-radius: 6px;
        color: var(--c-fg); padding: 10px 12px; font-size: 14px; font-family: inherit; }
input:focus, textarea:focus, select:focus { outline: 2px solid var(--c-accent2); outline-offset: 0; border-color: var(--c-primary); }
""".strip()

HARNESS_CONTRACT = """
# Architecture (locked)

## Brand & look (European Commission)
This is an official **European Commission** application. Every build MUST read as EC:
- The `.app-header` is the EC-blue (#004494) top bar with a yellow (#FFD617) accent line and the
  EU emblem `.brand` mark — keep it on every screen, with the app name in white.
- EC blue is the primary colour (headers, nav active state, primary buttons, links); EU yellow is
  the accent (focus rings, the header line). Clean, official, accessible — plenty of whitespace.
- Reproduce `design-system.css` verbatim in an inline <style> in <head> so the EC styling is present.

## Stack
- A single self-contained HTML document. Inline CSS + vanilla JS only.
- No build step, no frameworks, no external scripts or stylesheets (web fonts excepted).

## Layout shell (mandatory)
    <header class="app-header"><span class="brand"></span><h1>App name</h1></header>
    <div class="app-body">
      <aside class="app-sidebar"> ...nav (use .nav-item / <a>, mark current .active)... </aside>
      <main class="app-main"> <h2>Page title</h2> ...the feature in .card blocks... </main>
    </div>

## Conventions
- Group content in <div class="card"> blocks.
- Primary actions use .btn-primary; secondary actions use .btn-secondary.
- All interactive state lives in vanilla JS at the bottom of <body>.

## Compliance (locked — shipped automatically)
Every harness document ships compliant by construction. The shell ALREADY includes:
- A Content-Security-Policy <meta> in <head>.
- A page <footer> with the © European Commission disclaimer, a Privacy policy link,
  and a local-storage consent note.
Build only with the EU palette tokens (var(--c-*) → EU blue #004494 / yellow #FFD617)
and the Inter font; wire events with addEventListener (never inline onclick) and build
the DOM with textContent/createElement (never innerHTML). The compliance gate therefore
passes automatically — you only write the feature.
""".strip()

AGENTS_MD = """
# AGENTS.md

This repository ships behind a locked **engineering harness**. Every agent (Copilot,
Cursor, Claude, Gemini) MUST follow these rules — they are enforced by `house-lint`
in pre-commit and CI, so non-compliant code cannot be merged.

## Non-negotiables
1. One self-contained `index.html`: inline CSS + vanilla JS. No frameworks, no build,
   no external `<script src>` or `<link rel=stylesheet>` (web fonts are allowed).
2. Use ONLY the tokens and classes from `design-system.css`. Never hardcode colors —
   always reference `var(--c-*)`.
3. Use the locked layout shell from `architecture.md` (`app-header` / `app-sidebar` /
   `app-main`). Compose UI from `.card`, `.btn-primary`, `.btn-secondary`.

## Why
Consistency across every app built on the harness. The look, structure and stack are
decided once, centrally — you only build the feature.
""".strip()

CURSOR_RULES_MDC = """
---
description: House engineering harness — locked design system & architecture
globs: ["**/*.html"]
alwaysApply: true
---

# House style (always applied)

- Use only `design-system.css` tokens via `var(--c-*)`. Do NOT introduce new colors,
  gradients, fonts or raw hex values anywhere outside the `:root` token block.
- Compose UI exclusively from locked classes: `.app-header`, `.app-sidebar`, `.app-main`,
  `.card`, `.btn-primary`, `.btn-secondary`, and the locked input styles.
- Primary actions → `.btn-primary`. Secondary → `.btn-secondary`.
- Ship a single self-contained HTML document. Vanilla JS only. No CDNs, no frameworks.
""".strip()

COPILOT_INSTRUCTIONS_MD = """
# Copilot instructions

When generating code in this repo, follow the locked harness:

- **Self-contained**: a single HTML file, inline `<style>` + vanilla JS. Never add an
  external stylesheet or framework/CDN script.
- **Design tokens**: every color/space/radius comes from `design-system.css`
  (`var(--c-primary)`, `var(--c-edge)`, …). Avoid example like `style="color:#3366ff"` —
  prefer `class="..."` using locked component classes.
- **Layout**: always render inside the `app-header` + `app-body`(`app-sidebar` + `app-main`)
  shell. Buttons use `.btn-primary` / `.btn-secondary`.

These are validated by `house-lint`; violations fail the build.
""".strip()

CLAUDE_MD = """
# CLAUDE.md

Project memory for Claude Code. This repository ships behind a locked engineering
harness — follow it on every change. It is enforced by the lint gate (`house`
ruleset) in pre-commit and CI, so non-compliant code cannot merge.

## Rules
- One self-contained `index.html`: inline CSS + vanilla JS. No frameworks, no build
  step, no external `<script src>` or `<link rel=stylesheet>` (web fonts excepted).
- Use ONLY the tokens and classes from `design-system.css` (`var(--c-*)`); never
  hardcode colors.
- Use the locked layout shell from `architecture.md` (`app-header` / `app-sidebar` /
  `app-main`); compose UI from `.card`, `.btn-primary`, `.btn-secondary`.
""".strip()

ESLINTRC_JSON = """
{
  "root": true,
  "extends": ["house/recommended"],
  "plugins": ["house"],
  "rules": {
    "house/design-tokens-only": "error",
    "house/layout-shell": "error",
    "house/no-external-stylesheets": "error",
    "house/no-cdn-scripts": "error",
    "house/locked-button-classes": "warn",
    "house/no-hardcoded-colors": "warn"
  }
}
""".strip()

EDITORCONFIG = """
# .editorconfig — house formatting (enforced)
root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
""".strip()

# Files surfaced to the UI (the locked/ folder) and injected into the prompt.
# Standard agent-config + lint/format filenames used across the major AI coding tools.
HARNESS_FILES = [
    {"name": "AGENTS.md", "lang": "markdown", "content": AGENTS_MD},
    {"name": "CLAUDE.md", "lang": "markdown", "content": CLAUDE_MD},
    {"name": ".cursor/rules/house-style.mdc", "lang": "markdown", "content": CURSOR_RULES_MDC},
    {"name": ".github/copilot-instructions.md", "lang": "markdown", "content": COPILOT_INSTRUCTIONS_MD},
    {"name": ".eslintrc.json", "lang": "json", "content": ESLINTRC_JSON},
    {"name": ".editorconfig", "lang": "ini", "content": EDITORCONFIG},
    {"name": "design-system.css", "lang": "css", "content": HARNESS_CSS},
    {"name": "architecture.md", "lang": "markdown", "content": HARNESS_CONTRACT},
]


def harness_block() -> str:
    """All locked rule files, concatenated for injection into the agent prompt."""
    parts = ["The following harness files are LOCKED and apply to every build:\n"]
    for f in HARNESS_FILES:
        parts.append(f"===== {f['name']} =====\n{f['content']}\n")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# The enforcement gate — deterministic house-lint (mimics pre-commit / CI).
# ---------------------------------------------------------------------------
def run_harness_check(html: str) -> list[dict]:
    """Run the locked rules against generated HTML. Returns one result per rule."""
    results: list[dict] = []

    def add(rule: str, severity: str, ok: bool, detail: str):
        results.append({"rule": rule, "severity": severity, "status": "pass" if ok else "fail", "detail": detail})

    # design-system/tokens-present (error)
    has_tokens = "--c-primary" in html and "004494" in html.lower()
    add("design-system/tokens-present", "error", has_tokens,
        "design-system.css tokens present." if has_tokens
        else "Locked design tokens missing (:root --c-* incl. --c-primary:#004494).")

    # architecture/layout-shell (error)
    shell = all(c in html for c in ["app-header", "app-body", "app-main"])
    add("architecture/layout-shell", "error", shell,
        "Locked layout shell present." if shell
        else "Missing locked shell classes app-header / app-body / app-main.")

    # self-contained/no-external-stylesheets (error) — web fonts allowed
    links = re.findall(r"<link[^>]+rel=[\"']stylesheet[\"'][^>]*>", html, re.I)
    bad_links = [l for l in links if "fonts.googleapis" not in l and "fonts.gstatic" not in l]
    add("self-contained/no-external-stylesheets", "error", not bad_links,
        "No disallowed external stylesheets." if not bad_links
        else f"{len(bad_links)} external stylesheet(s) — must be self-contained.")

    # self-contained/no-cdn-scripts (error)
    ext_js = re.findall(r"<script[^>]+\bsrc=", html, re.I)
    add("self-contained/no-cdn-scripts", "error", not ext_js,
        "No external/CDN scripts." if not ext_js
        else f"{len(ext_js)} external <script src> found — vanilla JS only.")

    # design-system/locked-button-classes (warn)
    buttons = re.findall(r"<button\b[^>]*>", html, re.I)
    bad_btn = [b for b in buttons if "class=" in b.lower() and "btn-primary" not in b and "btn-secondary" not in b]
    add("design-system/locked-button-classes", "warn", not bad_btn,
        "Buttons use locked classes." if not bad_btn
        else f"{len(bad_btn)} button(s) not using .btn-primary/.btn-secondary.")

    # design-system/no-hardcoded-colors (warn) — outside the :root token block
    body_wo_root = re.sub(r":root\s*\{.*?\}", "", html, flags=re.S)
    stray = sorted(set(re.findall(r"#[0-9a-fA-F]{6}\b", body_wo_root)))
    add("design-system/no-hardcoded-colors", "warn", not stray,
        "All colors via design tokens." if not stray
        else f"Hardcoded hex outside tokens: {', '.join(stray[:6])}.")

    return results
