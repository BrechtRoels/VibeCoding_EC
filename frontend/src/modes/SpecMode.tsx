import { useEffect, useRef, useState } from "react";
import { Ide, type ChatMsg, type IdeFile, type FileStatus } from "../components/Ide";
import { GallerySubmit } from "../components/GallerySubmit";
import { parseTasks } from "../components/TaskChecklist";
import { streamOnce } from "../lib/streamOnce";
import { cleanHtml } from "../lib/useStream";
import { loadSnap, saveSnap, sanitizeMessages } from "../lib/persist";
import { submitForApproval } from "../lib/compliance";
import { ComplianceModal } from "../components/ComplianceRequirements";
import { apiUrl } from "../lib/api";

type DocKey = "requirements" | "design" | "tasks";
type SFile = { name: string; content: string };

const ORDER: DocKey[] = ["requirements", "design", "tasks"];
const FILE_OF: Record<DocKey, string> = {
  requirements: "requirements.md",
  design: "design.md",
  tasks: "tasks.md",
};
const NEXT_LABEL: Record<DocKey, string> = {
  requirements: "design",
  design: "tasks",
  tasks: "implementation",
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "feature";
}
function flipDone(md: string, id: string): string {
  return md.replace(new RegExp(`-\\s*\\[ \\]\\s*(${id})\\b`), "- [x] $1");
}

const SNAP = "twtb:spec";
const STEERING_INFO =
  "Always-on project context — product principles, the tech stack, and structure conventions. " +
  "It applies to every build, so each spec only has to describe the feature itself. That keeps specs " +
  "short and guarantees every app comes out consistent.";

const INTRO: ChatMsg[] = [
  {
    id: "intro",
    role: "agent",
    author: "Kiro",
    text:
      "Spec-driven development captures intent as reviewable artifacts before any code is written, so the result is traceable, consistent, and easy to change later.",
  },
  {
    id: "intro2",
    role: "agent",
    author: "Kiro",
    text:
      "Describe a feature and I'll work through four phases, pausing for your approval at each: requirements.md (testable EARS criteria) → design.md (architecture & data model) → tasks.md (an ordered plan) → implementation, executed task by task into index.html. The spec is the single source of truth — edit any file and the downstream regenerates. When the build is done, Submit for approval to run the compliance review.",
  },
];

export function SpecMode({ onReset }: { onReset?: () => void }) {
  const [snap] = useState<any>(() => loadSnap(SNAP) ?? {});
  const [idea, setIdea] = useState<string>(snap.idea ?? "");
  const [input, setInput] = useState("");
  const [slug, setSlug] = useState<string>(snap.slug ?? "feature");
  const [steering, setSteering] = useState<SFile[]>([]);
  const [docs, setDocs] = useState<Record<DocKey, string>>(snap.docs ?? { requirements: "", design: "", tasks: "" });
  const [html, setHtml] = useState<string>(snap.html ?? "");
  const [liveHtml, setLiveHtml] = useState("");
  const [fileStatus, setFileStatus] = useState<Record<string, FileStatus>>(snap.fileStatus ?? {});
  const [activeFile, setActiveFile] = useState<string>(snap.activeFile ?? "");
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const [previewSig, setPreviewSig] = useState(0);
  const [focusSig, setFocusSig] = useState(0);
  const [gate, setGate] = useState<DocKey | null>(snap.gate ?? null);
  const [phase, setPhase] = useState<"idle" | "requirements" | "design" | "tasks" | "execute" | "done">(snap.phase ?? "idle");
  const [messages, setMessages] = useState<ChatMsg[]>(snap.messages ?? INTRO);
  const [reviewAttempts, setReviewAttempts] = useState<number>(snap.reviewAttempts ?? 0);
  const [approved, setApproved] = useState<boolean>(snap.approved ?? false);
  const [reviewing, setReviewing] = useState(false);
  const [showReqs, setShowReqs] = useState(false);
  // When the user adds features to a completed app, we REVISE the spec on top of
  // itself instead of regenerating from scratch. iterBase = the spec snapshot at
  // the start of this iteration; iterFeedback = the requested feature.
  const [iterFeedback, setIterFeedback] = useState<string>(snap.iterFeedback ?? "");
  const [iterBase, setIterBase] = useState<Record<DocKey, string> | null>(snap.iterBase ?? null);
  const [builds, setBuilds] = useState<number>(snap.builds ?? 0); // competition: build rounds taken

  // Persist progress so a reload restores it (drop transient writing→ready).
  useEffect(() => {
    const cleanStatus: Record<string, FileStatus> = {};
    for (const [k, v] of Object.entries(fileStatus)) cleanStatus[k] = v === "writing" ? "ready" : v;
    saveSnap(SNAP, {
      idea, slug, docs, html, fileStatus: cleanStatus, activeFile,
      gate, phase: phase === "execute" ? "tasks" : phase, reviewAttempts, approved,
      iterFeedback, iterBase, builds,
      messages: sanitizeMessages(messages),
    });
  }, [idea, slug, docs, html, fileStatus, activeFile, gate, phase, reviewAttempts, approved, iterFeedback, iterBase, builds, messages]);

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
  const setFile = (n: string, s: FileStatus) => setFileStatus((m) => ({ ...m, [n]: s }));

  function fail(e: unknown) {
    setBuilding(false);
    setFileStatus((m) => {
      const n = { ...m };
      for (const k in n) if (n[k] === "writing") n[k] = "pending";
      return n;
    });
    push({ role: "system", kind: "error", text: (e as Error)?.message || String(e) });
  }

  useEffect(() => {
    fetch(apiUrl("/api/spec/steering")).then((r) => r.json()).then((d) => setSteering(d.files)).catch(() => {});
  }, []);

  const activeKey = (Object.keys(FILE_OF) as DocKey[]).find((k) => FILE_OF[k] === activeFile);
  const steeringFile = steering.find((s) => s.name === activeFile);
  const specDir = `.kiro/specs/${slug}/`;

  const files: IdeFile[] = [
    ...steering.map((s) => ({ name: s.name, group: ".kiro/steering/", status: "locked" as const, locked: true })),
    ...ORDER.map((k) => ({ name: FILE_OF[k], group: specDir, status: fileStatus[FILE_OF[k]] ?? "pending" })),
    { name: "index.html", status: building ? "writing" : html ? "ready" : "pending" },
  ];

  const editorText = steeringFile
    ? steeringFile.content
    : activeFile === "index.html"
    ? building
      ? liveHtml
      : html
    : activeKey
    ? docs[activeKey]
    : "";
  const editorStreaming = fileStatus[activeFile] === "writing";

  async function genDoc(
    kind: DocKey,
    ctx: Partial<Record<DocKey, string>>,
    theIdea: string,
    feedback = "",
    current = ""
  ): Promise<string> {
    setFile(FILE_OF[kind], "writing");
    setActiveFile(FILE_OF[kind]);
    const verb = feedback ? "updating" : "writing";
    const mid = push({ role: "system", kind: "start", text: `Kiro · ${verb} ${FILE_OF[kind]}`, streaming: true });
    const full = await streamOnce(
      "/api/spec/doc",
      { kind, idea: theIdea, requirements: ctx.requirements ?? "", design: ctx.design ?? "", feedback, current },
      (t) => setDocs((d) => ({ ...d, [kind]: t }))
    );
    const clean = full.trim();
    setDocs((d) => ({ ...d, [kind]: clean }));
    setFile(FILE_OF[kind], "ready");
    update(mid, { kind: "done", streaming: false, text: `Kiro · ${FILE_OF[kind]} ${feedback ? "updated" : "ready"}` });
    return clean;
  }

  // Apply a typed change to the doc currently awaiting approval, then re-present it.
  async function refineDoc(kind: DocKey, feedback: string) {
    if (busy) return;
    setBusy(true);
    setGate(null);
    push({ role: "user", author: "You", text: feedback });
    try {
      const ctx = { requirements: docs.requirements, design: docs.design };
      await genDoc(kind, ctx, idea, feedback, docs[kind]);
      gatePrompt(kind);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function gatePrompt(kind: DocKey) {
    push({
      role: "agent",
      author: "Kiro",
      text: `${FILE_OF[kind]} is ready for review. To change it, just type what you'd like here (e.g. "add a requirement for export") and send — I'll update it. When you're happy, click ✓ Approve to continue to ${NEXT_LABEL[kind]} (or ↻ Regenerate).`,
    });
    setGate(kind);
    setFocusSig((s) => s + 1);
  }

  const MAX_TASKS = 5; // each task is a full Opus rebuild — cap to keep runs fast

  async function submitApproval() {
    if (!html || busy || building || reviewing) return;
    setReviewing(true);
    const n = reviewAttempts + 1;
    setReviewAttempts(n);
    try {
      const rev = await submitForApproval({ html, push, update, attempt: n });
      if (rev?.approved) setApproved(true);
    } finally {
      setReviewing(false);
    }
  }

  async function executeTasks(theIdea: string, design: string, tasksMd: string, baseHtml = "", baseTasksMd = "") {
    setPhase("execute");
    setApproved(false); // a fresh build must be re-approved
    const all = parseTasks(tasksMd);
    // On an iteration (baseHtml set) only run the NEW tasks (ids not completed before), on top
    // of the existing app — robust even if the revised tasks.md re-emits checkboxes.
    let pending = all;
    if (baseHtml) {
      const prevDone = new Set(parseTasks(baseTasksMd).filter((t) => t.done).map((t) => t.id));
      pending = all.filter((t) => !prevDone.has(t.id));
      if (!pending.length) pending = all.filter((t) => !t.done);
    }
    const items = pending.slice(0, MAX_TASKS);
    if (items.length === 0) {
      // Nothing new to build (the revised tasks.md added no new task) — don't silently no-op.
      setPhase("done");
      push({ role: "agent", author: "Kiro", text: "tasks.md didn't add any new work for that change, so the app is unchanged. Try describing the feature in more detail, or edit tasks.md to add a task." });
      return;
    }
    if (pending.length > items.length) {
      push({ role: "system", kind: "info", text: `Kiro · ${pending.length} tasks to do — executing the first ${items.length} substantial ones to keep the run fast` });
    }
    push({ role: "system", kind: "info", text: `Kiro · executing ${items.length} ${baseHtml ? "new " : ""}task(s) from tasks.md` });
    setActiveFile("tasks.md");
    let cur = baseHtml;
    if (baseHtml) setHtml(baseHtml);
    for (const t of items) {
      const sid = push({ role: "system", kind: "start", text: `${t.id} — ${t.text}`, streaming: true });
      setBuilding(true);
      setFile("index.html", "writing");
      setLiveHtml(cur);
      const full = await streamOnce(
        "/api/spec/task",
        { idea: theIdea, design, tasks: tasksMd, current_html: cur, task_id: t.id, task_text: t.text },
        (x) => setLiveHtml(x)
      );
      cur = cleanHtml(full);
      setHtml(cur);
      setDocs((d) => ({ ...d, tasks: flipDone(d.tasks, t.id) }));
      update(sid, { kind: "done", streaming: false, text: `✓ ${t.id} complete` });
    }
    setBuilding(false);
    setFile("index.html", "ready");
    setBuilds((b) => b + 1); // count this build round for the leaderboard
    setPreviewSig((s) => s + 1); // all tasks done → auto-open full-screen preview
    setPhase("done");
    push({ role: "agent", author: "Kiro", text: "All tasks complete — open index.html › Preview to use the app, then Submit for approval when you're ready. Want to change anything? Describe it and I'll loop back through the spec." });
  }

  // ---- workflow controls ----
  async function startRequirements(theIdea: string) {
    setBusy(true);
    setPhase("requirements");
    try {
      await genDoc("requirements", {}, theIdea);
      gatePrompt("requirements");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  // Add features to a completed app: revise requirements ON TOP of the current spec.
  async function startIteration(feature: string) {
    setBusy(true);
    setApproved(false);
    setPhase("requirements");
    const base = { requirements: docs.requirements, design: docs.design, tasks: docs.tasks };
    setIterBase(base);
    setIterFeedback(feature);
    try {
      await genDoc("requirements", {}, idea, feature, base.requirements);
      gatePrompt("requirements");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!gate || busy) return;
    setBusy(true);
    const current = gate;
    setGate(null);
    const fb = iterFeedback; // "" on the first pass; the feature text while iterating
    try {
      if (current === "requirements") {
        setPhase("design");
        await genDoc("design", { requirements: docs.requirements }, idea, fb, iterBase ? iterBase.design : "");
        gatePrompt("design");
      } else if (current === "design") {
        setPhase("tasks");
        await genDoc("tasks", { requirements: docs.requirements, design: docs.design }, idea, fb, iterBase ? iterBase.tasks : "");
        gatePrompt("tasks");
      } else {
        await executeTasks(idea, docs.design, docs.tasks, iterBase ? html : "", iterBase ? iterBase.tasks : "");
        setIterBase(null);
        setIterFeedback("");
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!gate || busy) return;
    setBusy(true);
    const k = gate;
    setGate(null);
    try {
      const ctx =
        k === "requirements" ? {} : k === "design" ? { requirements: docs.requirements } : { requirements: docs.requirements, design: docs.design };
      // While iterating, re-apply the feature against the pre-iteration doc (don't regen from scratch).
      await genDoc(k, ctx, idea, iterFeedback, iterBase ? iterBase[k] : "");
      gatePrompt(k);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function resync(fromKey: DocKey) {
    if (busy) return;
    setBusy(true);
    push({ role: "system", kind: "info", text: `Kiro · re-syncing spec downstream of ${FILE_OF[fromKey]}` });
    try {
      let d = docs.design;
      if (fromKey === "requirements") d = await genDoc("design", { requirements: docs.requirements }, idea);
      await genDoc("tasks", { requirements: docs.requirements, design: d }, idea);
      gatePrompt("tasks");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (gate) {
      // typed change to the doc under review
      refineDoc(gate, text);
      return;
    }
    if (phase === "idle") {
      const s = slugify(text);
      setSlug(s);
      setIdea(text);
      push({ role: "user", author: "You", text });
      push({ role: "system", kind: "info", text: `Kiro · created .kiro/specs/${s}/` });
      startRequirements(text);
    } else {
      // iterate: revise the spec ON TOP of the existing one (don't wipe/regenerate)
      push({ role: "user", author: "You", text });
      push({ role: "system", kind: "info", text: "Kiro · extending the spec — updating requirements on top of the current spec" });
      startIteration(text);
    }
  }

  const ready = fileStatus[activeFile] === "ready";
  const canResync = !!activeKey && activeKey !== "tasks" && ready && !busy;

  const actions: React.ReactNode[] = [
    <button key="reqs" className="btn-secondary ci-icon-btn" onClick={() => setShowReqs(true)} title="View the compliance requirements to describe in your spec">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 4h6a1 1 0 0 1 1 1v0a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v0a1 1 0 0 1 1-1Z" />
        <path d="M8 5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2" />
        <path d="m9 13 2 2 4-4" />
      </svg>
      Compliance requirements
    </button>,
  ];
  if (gate && !busy) {
    actions.push(
      <button key="ap" className="btn-primary" onClick={approve}>
        ✓ Approve & continue
      </button>,
      <button key="rg" className="btn-secondary" onClick={regenerate}>
        ↻ Regenerate
      </button>
    );
  }

  return (
    <>
    <Ide
      projectName={`kiro · ${slug}`}
      chatTitle="Kiro Spec Workflow"
      hideUnwritten
      onReset={onReset}
      previewSignal={previewSig}
      focusSignal={focusSig}
      folderInfo={{ ".kiro/steering/": STEERING_INFO }}
      files={files}
      activeFile={activeFile}
      onSelectFile={setActiveFile}
      editor={{
        filename: activeFile,
        text: editorText,
        streaming: editorStreaming,
        editable: !!activeKey && ready && !busy,
        onChange: (v) => activeKey && setDocs((d) => ({ ...d, [activeKey]: v })),
        empty: "Describe a feature in the chat → Kiro writes the spec files here.",
        toolbar: canResync ? (
          <button className="btn-secondary" onClick={() => resync(activeKey!)}>
            Re-sync downstream ↓
          </button>
        ) : null,
      }}
      previewHtml={building ? "" : html}
      messages={messages}
      titleActions={
        <>
          <span className="pill accent">
            {busy
              ? "working…"
              : approved
              ? `✓ approved · attempt ${reviewAttempts}`
              : gate
              ? `awaiting approval · ${FILE_OF[gate]}`
              : phase === "done"
              ? "complete"
              : "spec-driven"}
          </span>
          {html && phase === "done" && (
            <button className="btn-secondary" onClick={submitApproval} disabled={busy || building || reviewing || approved}>
              {approved ? "Approved ✓" : reviewing ? "…" : "Submit for approval"}
            </button>
          )}
          <GallerySubmit mode="spec" title={idea} html={html} iterations={builds} extras={{ requirements: docs.requirements }} />
        </>
      }
      input={{
        value: input,
        onChange: setInput,
        onSubmit: submit,
        disabled: busy,
        placeholder:
          gate !== null
            ? `Type a change to ${FILE_OF[gate]} — or use Approve / Regenerate above…`
            : busy
            ? "Kiro is working…"
            : phase === "done"
            ? "Request a change — it loops back through the spec…"
            : "Describe the app to spec out…",
        sendLabel: busy ? "…" : gate !== null ? "Update" : phase === "idle" ? "Start spec" : phase === "done" ? "Update spec" : "…",
        actions: actions.length ? <>{actions}</> : undefined,
      }}
    />
    <ComplianceModal open={showReqs} onClose={() => setShowReqs(false)} />
    </>
  );
}
