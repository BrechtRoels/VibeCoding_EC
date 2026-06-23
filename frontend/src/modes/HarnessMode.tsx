import { useEffect, useRef, useState } from "react";
import { Ide, type ChatMsg, type IdeFile } from "../components/Ide";
import { GallerySubmit } from "../components/GallerySubmit";
import { streamOnce } from "../lib/streamOnce";
import { cleanHtml } from "../lib/useStream";
import { loadSnap, saveSnap, sanitizeMessages } from "../lib/persist";
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

export function HarnessMode({ onReset }: { onReset?: () => void }) {
  const [snap] = useState<any>(() => loadSnap(SNAP) ?? {});
  const [config, setConfig] = useState<Config | null>(null);
  const [input, setInput] = useState("");
  const [html, setHtml] = useState<string>(snap.html ?? "");
  const [liveHtml, setLiveHtml] = useState("");
  const [building, setBuilding] = useState(false);
  const [activeFile, setActiveFile] = useState<string>(snap.activeFile ?? "AGENTS.md");
  const [lastFeature, setLastFeature] = useState<string>(snap.lastFeature ?? "");
  const [messages, setMessages] = useState<ChatMsg[]>(snap.messages ?? INTRO);

  // Persist progress so a reload restores it.
  useEffect(() => {
    saveSnap(SNAP, { html, activeFile, lastFeature, messages: sanitizeMessages(messages) });
  }, [html, activeFile, lastFeature, messages]);

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
        const clean = cleanHtml(fixed);
        setHtml(clean);
        setBuilding(false);
        await runGate(feature, clean, 1);
      } catch (e) {
        setBuilding(false);
        push({ role: "system", kind: "error", text: (e as Error).message || "Auto-fix failed — try again." });
      }
    }
  }

  async function build() {
    const text = input.trim();
    if (!text || building) return;
    setInput("");
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
      const clean = cleanHtml(full);
      setHtml(clean);
      setBuilding(false);
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
          <span className="pill accent">🔒 enforced by house-lint</span>
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
