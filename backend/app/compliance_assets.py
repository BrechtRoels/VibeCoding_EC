"""The 'compliance track' — a shared, deterministic compliance gate.

A second enforcement layer that sits ALONGSIDE the harness house-lint. Where the
harness checks design-system/architecture conformance, this checks the kind of
rules a real compliance/legal/security review cares about before an app can ship:

  * security   — no hardcoded secrets, no external/CDN scripts, no eval
  * privacy    — a disclaimer/footer, no tracking pixels, a privacy link
  * data       — no sensitive data stored in plaintext, consent before storage
  * branding   — colors come from the approved palette

It is intentionally deterministic (regex/heuristics on the HTML) so a live
workshop gets reproducible results: the same build always yields the same
verdict. `run_compliance_check` mirrors `run_harness_check` in harness_assets.py.

The three paradigms differ only in how compliance is BAKED IN up front:
  * vibe    — nothing injected → first submit fails several rules → many tries
  * spec    — captured in the spec docs + injected into the build → passes early
  * harness — part of the locked rules (compliance_block injected) → auto-passes
"""
import re

# Approved brand palette (the harness primary + greys). Hex used in the HTML must
# come from this set, otherwise branding/approved-colors flags it.
APPROVED_HEX = {
    "#fd5108", "#e34503", "#ff8a3d",  # brand orange family
    "#ffffff", "#f6f6f8", "#eeeef1", "#e7e7ea", "#d6d6db",  # surfaces / edges
    "#17181c", "#5b606b", "#9094a0",  # foreground greys
    "#dc2626", "#16a34a", "#d97706",  # danger / success / warn
    "#000000",
}

# Rule metadata — surfaced via GET /api/compliance/rules and used for the spec
# voice-over / info panel. The checker below produces one result per rule id.
#
# Designed so a typical *vibe* build trips several of these (esp. the CSP header,
# the disclaimer, inline event handlers and innerHTML), while a spec/harness build
# — which gets compliance_block() injected — satisfies every ERROR rule and so is
# approved. Warnings never block approval; they just colour the card.
COMPLIANCE_RULES = [
    # --- security ---
    {"rule": "security/content-security-policy", "category": "security", "severity": "error",
     "description": "A Content-Security-Policy <meta> tag must be declared in <head>."},
    {"rule": "security/no-external-scripts", "category": "security", "severity": "error",
     "description": "Self-contained — no external/CDN <script src> (web fonts excepted)."},
    {"rule": "security/no-hardcoded-secrets", "category": "security", "severity": "error",
     "description": "No API keys, tokens, passwords or secrets embedded in the source."},
    {"rule": "security/no-inline-event-handlers", "category": "security", "severity": "warn",
     "description": "No inline on* handlers (onclick=…) — bind events with addEventListener."},
    {"rule": "security/no-unsafe-html", "category": "security", "severity": "warn",
     "description": "Avoid innerHTML / document.write — use textContent / createElement."},
    {"rule": "security/links-noopener", "category": "security", "severity": "warn",
     "description": "target=\"_blank\" links must set rel=\"noopener\" (reverse-tabnabbing)."},
    {"rule": "security/no-eval", "category": "security", "severity": "warn",
     "description": "No eval() or new Function() — avoids arbitrary code execution."},
    # --- privacy / legal ---
    {"rule": "privacy/disclaimer-present", "category": "privacy", "severity": "error",
     "description": "A footer or disclaimer (© / 'all rights reserved' / 'disclaimer')."},
    {"rule": "privacy/no-trackers", "category": "privacy", "severity": "error",
     "description": "No third-party analytics or tracking pixels."},
    {"rule": "privacy/privacy-link", "category": "privacy", "severity": "warn",
     "description": "A link to a privacy policy."},
    # --- data storage ---
    {"rule": "data/no-sensitive-plaintext", "category": "data", "severity": "error",
     "description": "No sensitive fields (password/ssn/card/cvv/token) stored in plaintext."},
    {"rule": "data/consent-on-storage", "category": "data", "severity": "warn",
     "description": "If data is stored locally, the user is told (consent / cookie notice)."},
    # --- branding ---
    {"rule": "branding/approved-colors", "category": "branding", "severity": "warn",
     "description": "Colors come from the approved brand palette — no stray hex values."},
    {"rule": "branding/approved-font", "category": "branding", "severity": "warn",
     "description": "Typography uses the approved 'Inter' typeface."},
]


def run_compliance_check(html: str) -> list[dict]:
    """Run the compliance rules against generated HTML. One result per rule.

    Each result: {rule, category, severity, status: pass|fail, detail}.
    """
    results: list[dict] = []
    low = html.lower()

    def add(rule: str, category: str, severity: str, ok: bool, detail: str):
        results.append({
            "rule": rule, "category": category, "severity": severity,
            "status": "pass" if ok else "fail", "detail": detail,
        })

    # --- security ---------------------------------------------------------
    has_csp = bool(re.search(r"<meta[^>]+http-equiv=[\"']?content-security-policy", low))
    add("security/content-security-policy", "security", "error", has_csp,
        "Content-Security-Policy meta tag present." if has_csp
        else "No Content-Security-Policy <meta> tag — declare one in <head>.")

    secret_patterns = [
        r"(?:api[_-]?key|secret|password|passwd|token|access[_-]?key)\s*[:=]\s*[\"'][^\"'\s]{6,}",
        r"\bsk-[A-Za-z0-9]{10,}",          # OpenAI-style keys
        r"\bAKIA[0-9A-Z]{12,}",            # AWS access key id
        r"\bgh[pousr]_[A-Za-z0-9]{20,}",   # GitHub tokens
    ]
    secrets = [m for p in secret_patterns for m in re.findall(p, html, re.I)]
    add("security/no-hardcoded-secrets", "security", "error", not secrets,
        "No hardcoded secrets found." if not secrets
        else f"{len(secrets)} hardcoded secret/credential-like value(s) — move to a secure store.")

    ext_js = re.findall(r"<script[^>]+\bsrc=[\"']?([^\"'>\s]+)", html, re.I)
    bad_js = [s for s in ext_js if not s.startswith("#")]
    add("security/no-external-scripts", "security", "error", not bad_js,
        "Self-contained — no external scripts." if not bad_js
        else f"{len(bad_js)} external/CDN <script src> — the app must be self-contained.")

    inline_handlers = re.findall(
        r"<[^>]*\son(?:click|change|input|submit|keydown|keyup|keypress|mouseover|mouseout|"
        r"mouseenter|mouseleave|focus|blur|load|dblclick|mousedown|mouseup)\s*=",
        html, re.I,
    )
    add("security/no-inline-event-handlers", "security", "warn", not inline_handlers,
        "Events bound via addEventListener — no inline handlers." if not inline_handlers
        else f"{len(inline_handlers)} inline on* handler(s) — bind events with addEventListener instead.")

    unsafe_html = re.findall(r"\.(?:inner|outer)html\s*\+?=|document\.write\s*\(|insertadjacenthtml\s*\(", low)
    add("security/no-unsafe-html", "security", "warn", not unsafe_html,
        "No innerHTML/document.write sinks." if not unsafe_html
        else f"{len(unsafe_html)} unsafe HTML sink(s) (innerHTML/document.write) — prefer textContent.")

    blank_links = re.findall(r"<a\b[^>]*\btarget\s*=\s*[\"']?_blank[\"']?[^>]*>", html, re.I)
    unsafe_links = [a for a in blank_links if "noopener" not in a.lower()]
    add("security/links-noopener", "security", "warn", not unsafe_links,
        "External links set rel=noopener." if not unsafe_links
        else f"{len(unsafe_links)} target=\"_blank\" link(s) missing rel=\"noopener\".")

    uses_eval = bool(re.search(r"\beval\s*\(", html) or re.search(r"\bnew\s+Function\s*\(", html))
    add("security/no-eval", "security", "warn", not uses_eval,
        "No eval/new Function." if not uses_eval
        else "Uses eval() or new Function() — avoid executing dynamic code.")

    # --- privacy ----------------------------------------------------------
    has_disclaimer = bool(re.search(r"<footer\b", low) or re.search(r"©|&copy;|all rights reserved|disclaimer", low))
    add("privacy/disclaimer-present", "privacy", "error", has_disclaimer,
        "Disclaimer/footer present." if has_disclaimer
        else "No footer or legal disclaimer (© / 'all rights reserved' / 'disclaimer').")

    trackers = re.findall(r"google-analytics|googletagmanager|gtag\s*\(|fbq\s*\(|hotjar|mixpanel|segment\.com", low)
    add("privacy/no-trackers", "privacy", "error", not trackers,
        "No third-party trackers." if not trackers
        else f"Tracking/analytics detected ({len(trackers)} reference(s)) — not permitted.")

    has_privacy_link = bool(re.search(r"<a\b[^>]*>[^<]*privacy[^<]*</a>", low) or re.search(r"<a\b[^>]*privacy[^>]*>", low))
    add("privacy/privacy-link", "privacy", "warn", has_privacy_link,
        "Privacy policy link present." if has_privacy_link
        else "No link to a privacy policy.")

    # --- data storage -----------------------------------------------------
    uses_storage = bool(re.search(r"localstorage|sessionstorage|document\.cookie", low))
    sensitive_keys = re.findall(
        r"(?:localstorage|sessionstorage)\.setitem\(\s*[\"'][^\"']*(?:password|passwd|ssn|creditcard|card|cvv|token)[^\"']*[\"']",
        low,
    )
    sensitive_keys += re.findall(r"document\.cookie\s*=\s*[\"'][^\"']*(?:password|ssn|card|cvv|token)", low)
    add("data/no-sensitive-plaintext", "data", "error", not sensitive_keys,
        "No sensitive data stored in plaintext." if not sensitive_keys
        else f"{len(sensitive_keys)} sensitive field(s) written to storage in plaintext.")

    mentions_consent = bool(re.search(r"consent|cookie notice|we store|stored locally|your data is", low))
    add("data/consent-on-storage", "data", "warn", (not uses_storage) or mentions_consent,
        "No local storage, or user is informed." if (not uses_storage) or mentions_consent
        else "Data is stored locally but the user is never told (no consent/notice).")

    # --- branding ---------------------------------------------------------
    body_wo_root = re.sub(r":root\s*\{.*?\}", "", html, flags=re.S)

    def norm_hex(h: str) -> str:
        h = h.lower()
        return "#" + "".join(c * 2 for c in h[1:]) if len(h) == 4 else h  # expand #abc -> #aabbcc

    found_hex = {norm_hex(h) for h in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", body_wo_root)}
    stray = sorted(found_hex - APPROVED_HEX)
    add("branding/approved-colors", "branding", "warn", not stray,
        "All colors from the approved palette." if not stray
        else f"Off-brand hex outside the approved palette: {', '.join(stray[:6])}.")

    on_brand_font = "inter" in low
    add("branding/approved-font", "branding", "warn", on_brand_font,
        "Uses the approved 'Inter' typeface." if on_brand_font
        else "Off-brand typography — use the approved 'Inter' typeface.")

    return results


def compliance_block() -> str:
    """Human-readable summary of the compliance rules, for prompt injection.

    Injected into the spec + harness builders so their output satisfies the
    gate by construction. (Vibe deliberately does NOT get this.)
    """
    csp = (
        "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src https://fonts.gstatic.com; img-src 'self' data:\">"
    )
    lines = [
        "The output MUST pass the company COMPLIANCE review. Build it to satisfy every rule below:",
        "",
        "SECURITY",
        "- In <head>, include this exact Content-Security-Policy meta tag (keep it as-is so inline CSS/JS still work):",
        f"    {csp}",
        "- Self-contained only: no external/CDN <script src> (web fonts are fine). Vanilla JS.",
        "- Never embed API keys, tokens, passwords or secrets in the source.",
        "- Bind ALL events with addEventListener in a <script> at the end — NEVER use inline on* attributes "
        "(no onclick=, onchange=, onsubmit=, … in the markup).",
        "- Build the DOM with textContent / createElement / appendChild. Do NOT assign to innerHTML/outerHTML "
        "or use document.write.",
        "- Any target=\"_blank\" link must also set rel=\"noopener\".",
        "- Do not use eval() or new Function().",
        "",
        "PRIVACY / LEGAL",
        "- Include a <footer> with a copyright/disclaimer line (e.g. © <year> — all rights reserved).",
        "- Include a 'Privacy policy' link. No analytics, tracking pixels or third-party scripts.",
        "",
        "DATA STORAGE",
        "- Never store sensitive fields (password, ssn, card, cvv, token) in localStorage/cookies in plaintext.",
        "- If you persist any data locally, tell the user (a short consent/cookie notice).",
        "",
        "BRANDING",
        "- Use ONLY the approved brand palette (orange #FD5108 family + the neutral greys); no stray hex colors.",
        "- Use the approved 'Inter' typeface for all text.",
    ]
    return "\n".join(lines)
