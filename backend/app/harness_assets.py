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
  --c-page: #ffffff; --c-surface: #ffffff; --c-raised: #f6f6f8; --c-overlay: #eeeef1;
  --c-edge: #e7e7ea; --c-edge-strong: #d6d6db; --c-fg: #17181c; --c-fg2: #5b606b;
  --c-fg3: #9094a0; --c-primary: #004494; --c-primary-hover: #00336e; --c-primary-fg: #ffffff;
  --c-accent2: #FFD617; --c-danger: #dc2626; --c-success: #16a34a; --c-warn: #d97706;
  --c-primary-10: rgba(0,68,148,0.08); --c-shadow: rgba(20,20,30,0.10);
  color-scheme: light;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
       background: var(--c-page); color: var(--c-fg); line-height: 1.5; -webkit-font-smoothing: antialiased; }
.app-header { height: 56px; display: flex; align-items: center; gap: 12px; padding: 0 24px;
              background: var(--c-surface); border-bottom: 1px solid var(--c-edge); }
.app-header .brand { width: 26px; height: 26px; border-radius: 8px;
              background: linear-gradient(135deg, var(--c-primary), var(--c-accent2)); }
.app-header h1 { font-size: 16px; font-weight: 600; margin: 0; }
.app-body { display: flex; min-height: calc(100vh - 56px); }
.app-sidebar { width: 220px; background: var(--c-surface); border-right: 1px solid var(--c-edge); padding: 16px; }
.app-main { flex: 1; padding: 32px; max-width: 1000px; }
.card { background: var(--c-surface); border: 1px solid var(--c-edge); border-radius: 12px; padding: 16px; }
.btn-primary { padding: 10px 16px; border-radius: 8px; border: none; background: var(--c-primary);
               color: var(--c-primary-fg); font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-primary:hover { background: var(--c-primary-hover); }
.btn-secondary { padding: 9px 14px; border-radius: 8px; border: 1px solid var(--c-edge-strong); background: var(--c-raised);
                 color: var(--c-fg); font-size: 14px; font-weight: 500; cursor: pointer; }
input, textarea, select { background: var(--c-raised); border: 1px solid var(--c-edge-strong); border-radius: 8px;
        color: var(--c-fg); padding: 10px 12px; font-size: 14px; font-family: inherit; }
input:focus, textarea:focus { outline: none; border-color: var(--c-primary); }
""".strip()

HARNESS_CONTRACT = """
# Architecture (locked)

## Stack
- A single self-contained HTML document. Inline CSS + vanilla JS only.
- No build step, no frameworks, no external scripts or stylesheets (web fonts excepted).

## Layout shell (mandatory)
    <header class="app-header"><span class="brand"></span><h1>App name</h1></header>
    <div class="app-body">
      <aside class="app-sidebar"> ...nav... </aside>
      <main class="app-main"> ...the feature... </main>
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
