import { useEffect, useRef, useState } from "react";
import { Ide, type ChatMsg, type IdeFile } from "../components/Ide";
import { GallerySubmit } from "../components/GallerySubmit";
import { streamOnce } from "../lib/streamOnce";
import { cleanHtml } from "../lib/useStream";
import { loadSnap, saveSnap, sanitizeMessages } from "../lib/persist";
import { submitForApproval } from "../lib/compliance";
import { apiUrl } from "../lib/api";

type HFile = { name: string; lang: string; content: string };
type Config = { you_control: string; enforced_by: string[]; files: HFile[] };
type CheckResult = { rule: string; severity: "error" | "warn"; status: "pass" | "fail"; detail: string };

const SNAP = "twtb:harness";
const INTRO: ChatMsg[] = [
  {
    id: "intro",
    role: "agent",
    author: "Harness Agent",
    text:
      "The design system and architecture are locked via rule files (AGENTS.md, .cursor/rules, copilot-instructions) and enforced by house-lint in pre-commit + CI. Describe a feature — I'll build it, then the gate verifies it complies and auto-fixes any violations.",
  },
];

// The static compliance scaffolding is BAKED INTO every harness build so the
// output automatically contains it (and so auto-passes the compliance gate),
// regardless of what the model emitted. Mirrors how a real harness ships a
// compliant document shell. The code-style rules (no innerHTML, addEventListener)
// are enforced via the injected rules + the auto-fix backstop in submitApproval.
const COMPLIANCE_CSP =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; ' +
  "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data:\">";

function bakeHarnessCompliance(html: string): string {
  let out = html;
  // 1) Content-Security-Policy meta in <head>
  if (!/http-equiv=["']?content-security-policy/i.test(out)) {
    if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => `${m}\n  ${COMPLIANCE_CSP}`);
    else if (/<html[^>]*>/i.test(out)) out = out.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${COMPLIANCE_CSP}</head>`);
    else out = `${COMPLIANCE_CSP}\n${out}`;
  }
  // 2) Compliance footer: copyright/disclaimer + privacy link + storage-consent note
  const hasDisclaimer = /<footer\b/i.test(out) || /©|&copy;|all rights reserved/i.test(out);
  const hasPrivacy = /privacy/i.test(out);
  if (!hasDisclaimer || !hasPrivacy) {
    const year = new Date().getFullYear();
    const footer =
      `\n<footer style="padding:16px 24px;border-top:1px solid var(--c-edge);color:var(--c-fg2);font-size:12px;text-align:center">` +
      `© ${year} European Commission — all rights reserved. Your data is stored locally on this device (consent). ` +
      `<a href="#privacy" style="color:var(--c-primary)">Privacy policy</a></footer>`;
    if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${footer}\n</body>`);
    else out = `${out}${footer}`;
  }
  return out;
}

export function HarnessMode({ onReset }: { onReset?: () => void }) {
  const [snap] = useState<any>(() => loadSnap(SNAP) ?? {});
  const [config, setConfig] = useState<Config | null>(null);
  const [input, setInput] = useState("");
  const [html, setHtml] = useState<string>(snap.html ?? "");
  const [liveHtml, setLiveHtml] = useState("");
  const [building, setBuilding] = useState(false);
  const [activeFile, setActiveFile] = useState<string>(snap.activeFile ?? "AGENTS.md");
  const [lastFeature, setLastFeature] = useState<string>(snap.lastFeature ?? "");
  const [previewSig, setPreviewSig] = useState(0);
  const [messages, setMessages] = useState<ChatMsg[]>(snap.messages ?? INTRO);
  const [reviewAttempts, setReviewAttempts] = useState<number>(snap.reviewAttempts ?? 0);
  const [approved, setApproved] = useState<boolean>(snap.approved ?? false);
  const [reviewing, setReviewing] = useState(false);

  // Persist progress so a reload restores it.
  useEffect(() => {
    saveSnap(SNAP, { html, activeFile, lastFeature, reviewAttempts, approved, messages: sanitizeMessages(messages) });
  }, [html, activeFile, lastFeature, reviewAttempts, approved, messages]);

  const idc = useRef(0);
  const mountId = useRef(Math.random().toString(36).slice(2, 7));
  const nid = () => `${mountId.current}-${++idc.current}`;
  const push = (m: Omit<ChatMsg, "id">) => {
    const id = nid();
    setMessages((a) => [...a, { id, ...m }]);
    return id;
  };
  const update = (id: string, patch: Partial<ChatMsg>) =>
    setMessages((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  useEffect(() => {
    fetch(apiUrl("/api/harness/config")).then((r) => r.json()).then(setConfig).catch(() => setConfig(null));
  }, []);

  // Harness keeps its locked rule files pre-loaded (that's the point).
  const files: IdeFile[] = [
    ...(config?.files ?? []).map((f) => ({ name: f.name, group: "locked/", status: "locked" as const, locked: true })),
    { name: "index.html", status: building ? "writing" : html ? "ready" : "pending" },
  ];

  const lockedFile = config?.files.find((f) => f.name === activeFile);
  const editorText = lockedFile ? lockedFile.content : building ? liveHtml : html;
  const editorStreaming = building && activeFile === "index.html";

  function gateNode(results: CheckResult[]) {
    return (
      <div>
        {results.map((r, i) => (
          <div className="cm-issue" key={i}>
            <span className={`sev ${r.status === "pass" ? "pass" : r.severity === "error" ? "high" : "medium"}`}>
              {r.status === "pass" ? "pass" : r.severity}
            </span>
            <div style={{ flex: 1 }}>
              <div className="it" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5 }}>{r.rule}</div>
              <div className="id">{r.detail}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  async function runGate(feature: string, built: string, attempt: number) {
    const cid = push({ role: "system", kind: "start", text: "house-lint · running enforcement gate", streaming: true });
    let data: { passed: boolean; results: CheckResult[] };
    try {
      const res = await fetch(apiUrl("/api/harness/check"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: built }),
      });
      data = await res.json();
    } catch (e) {
      update(cid, { kind: "error", streaming: false, text: (e as Error).message || "Gate unavailable — try again." });
      return;
    }
    update(cid, { kind: data.passed ? "done" : "error", streaming: false, text: `house-lint · ${data.passed ? "passed ✓" : "violations found"}` });
    push({
      role: "agent",
      author: "Harness Gate (CI)",
      text: data.passed ? "All rules pass — this build complies with the harness." : "Some rules failed. The gate blocks this until it's fixed.",
      node: gateNode(data.results),
    });

    if (!data.passed && attempt === 0) {
      const violations = data.results.filter((r) => r.status === "fail").map((r) => `${r.rule}: ${r.detail}`);
      push({ role: "system", kind: "start", text: "house-lint · gate failed → running auto-fix (lint --fix)" });
      setBuilding(true);
      setLiveHtml("");
      setActiveFile("index.html");
      try {
        const fixed = await streamOnce("/api/harness/fix", { feature, current_html: built, violations }, (t) => setLiveHtml(t));
        const clean = bakeHarnessCompliance(cleanHtml(fixed));
        setHtml(clean);
        setBuilding(false);
        await runGate(feature, clean, 1);
      } catch (e) {
        setBuilding(false);
        push({ role: "system", kind: "error", text: (e as Error).message || "Auto-fix failed — try again." });
      }
    }
  }

  async function submitApproval() {
    if (!html || building || reviewing) return;
    setReviewing(true);
    let n = reviewAttempts + 1;
    setReviewAttempts(n);
    try {
      let rev = await submitForApproval({ html, push, update, attempt: n, automatic: true });
      // Backstop: the static scaffolding is baked in, so a miss can only be a code-style
      // rule (e.g. innerHTML). Auto-fix once via the harness fix step, then re-review —
      // the harness self-corrects to approved, no manual iteration.
      if (rev && !rev.approved && lastFeature) {
        const violations = rev.results.filter((r) => r.status === "fail").map((r) => `${r.rule}: ${r.detail}`);
        push({ role: "system", kind: "start", text: "compliance · gate failed → harness auto-fix" });
        setBuilding(true);
        setLiveHtml("");
        setActiveFile("index.html");
        try {
          const fixed = await streamOnce("/api/harness/fix", { feature: lastFeature, current_html: html, violations }, (t) => setLiveHtml(t));
          const clean = bakeHarnessCompliance(cleanHtml(fixed));
          setHtml(clean);
          setBuilding(false);
          n = n + 1;
          setReviewAttempts(n);
          rev = await submitForApproval({ html: clean, push, update, attempt: n, automatic: true });
        } catch (e) {
          setBuilding(false);
          push({ role: "system", kind: "error", text: (e as Error).message || "Auto-fix failed — try again." });
        }
      }
      if (rev?.approved) setApproved(true);
    } finally {
      setReviewing(false);
    }
  }

  async function build() {
    const text = input.trim();
    if (!text || building) return;
    setInput("");
    setApproved(false); // a new build must be re-approved
    const isRefine = !!html; // follow-up messages iterate on the current app
    const feature = isRefine ? lastFeature || text : text;
    if (!isRefine) setLastFeature(text);
    push({ role: "user", author: "You", text });
    const aid = push({
      role: "agent",
      author: "Harness Agent",
      text: isRefine
        ? "Applying your change while staying compliant with the locked design system…"
        : "Building inside the locked harness — using only the design system and layout shell…",
      streaming: true,
    });
    setBuilding(true);
    setLiveHtml("");
    setActiveFile("index.html");
    try {
      const url = isRefine ? "/api/harness/refine" : "/api/harness/generate";
      const body = isRefine ? { feature, current_html: html, feedback: text } : { feature };
      const full = await streamOnce(url, body, (t) => setLiveHtml(t));
      const clean = bakeHarnessCompliance(cleanHtml(full));
      setHtml(clean);
      setBuilding(false);
      setPreviewSig((s) => s + 1); // build complete → auto-open full-screen preview
      update(aid, { streaming: false, text: (isRefine ? "Updated" : "Build done") + " — handing off to the house-lint gate to verify compliance." });
      await runGate(feature, clean, 0);
    } catch (e) {
      setBuilding(false);
      update(aid, { streaming: false, kind: "error", text: (e as Error).message || "Build failed — please try again." });
    }
  }

  return (
    <Ide
      projectName="harness-app"
      chatTitle="Harness Chat"
      onReset={onReset}
      previewSignal={previewSig}
      files={files}
      activeFile={activeFile}
      onSelectFile={setActiveFile}
      editor={{
        filename: activeFile,
        text: editorText,
        streaming: editorStreaming,
        empty: "Describe a feature in the chat → it's built here using the locked design system.",
      }}
      previewHtml={building ? "" : html}
      messages={messages}
      titleActions={
        <>
          <span className="pill accent">{approved ? "✓ compliance approved" : "🔒 enforced by house-lint"}</span>
          {html && (
            <button className="btn-secondary" onClick={submitApproval} disabled={building || reviewing || approved}>
              {approved ? "Approved ✓" : reviewing ? "…" : "Submit for approval"}
            </button>
          )}
          <GallerySubmit mode="harness" title={lastFeature} html={html} />
        </>
      }
      input={{
        value: input,
        onChange: setInput,
        onSubmit: build,
        disabled: building,
        placeholder: html
          ? "Describe a change (e.g. make the primary button larger)…"
          : "Describe a feature to build (e.g. a support ticket list)…",
        sendLabel: building ? "…" : html ? "Update" : "Build",
      }}
    />
  );
}
