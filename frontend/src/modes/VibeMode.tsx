import { useEffect, useRef, useState } from "react";
import { Ide, type ChatMsg, type IdeFile } from "../components/Ide";
import { GallerySubmit } from "../components/GallerySubmit";
import { useStream, cleanHtml } from "../lib/useStream";
import { streamOnce } from "../lib/streamOnce";
import { loadSnap, saveSnap, sanitizeMessages } from "../lib/persist";
import { submitForApproval } from "../lib/compliance";

type Version = { html: string; label: string };

const SNAP = "twtb:vibe";
const INTRO: ChatMsg[] = [
  {
    id: "intro",
    role: "agent",
    author: "Builder Agent",
    text: "Describe the application you'd like and I'll build it. Once it's running, describe any change in the chat and I'll iterate on it.",
  },
];

export function VibeMode({ onReset }: { onReset?: () => void }) {
  const [snap] = useState<any>(() => loadSnap(SNAP) ?? {});
  const [idea, setIdea] = useState<string>(snap.idea ?? "");
  const [versions, setVersions] = useState<Version[]>(snap.versions ?? []);
  const [view, setView] = useState<number>(snap.view ?? 0);
  const [activeFile, setActiveFile] = useState<string>(snap.activeFile ?? "index.html");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewSig, setPreviewSig] = useState(0);
  const [messages, setMessages] = useState<ChatMsg[]>(snap.messages ?? INTRO);
  const [reviewAttempts, setReviewAttempts] = useState<number>(snap.reviewAttempts ?? 0);
  const [approved, setApproved] = useState<boolean>(snap.approved ?? false);
  const gen = useStream();
  const idc = useRef(0);
  const mountId = useRef(Math.random().toString(36).slice(2, 7));
  const nid = () => `${mountId.current}-${++idc.current}`;
  // Always hold the freshest build so repeated chat updates never target a stale version.
  const htmlRef = useRef<string>(snap.versions?.length ? snap.versions[snap.versions.length - 1].html : "");
  const countRef = useRef<number>(snap.versions?.length ?? 0);

  // Persist progress so a reload restores it.
  useEffect(() => {
    saveSnap(SNAP, { idea, versions, view, activeFile, reviewAttempts, approved, messages: sanitizeMessages(messages) });
  }, [idea, versions, view, activeFile, reviewAttempts, approved, messages]);
  const push = (m: Omit<ChatMsg, "id">) => {
    const id = nid();
    setMessages((arr) => [...arr, { id, ...m }]);
    return id;
  };
  const update = (id: string, patch: Partial<ChatMsg>) =>
    setMessages((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const latest = versions.length ? versions[versions.length - 1] : null;
  const viewed = versions[view] ?? null;
  const onIndex = activeFile === "index.html";
  const editorText = gen.streaming ? gen.text : onIndex ? latest?.html ?? "" : viewed?.html ?? "";
  const editorHtml = gen.streaming ? "" : onIndex ? latest?.html ?? "" : viewed?.html ?? "";

  const files: IdeFile[] = [
    { name: "index.html", status: gen.streaming ? "writing" : versions.length ? "ready" : "pending" },
    ...versions.map((_, i) => ({ name: `v${i + 1}.html`, group: "history/", status: "ready" as const })),
  ];

  function commit(label: string, full: string) {
    const cleaned = cleanHtml(full);
    htmlRef.current = cleaned;
    setVersions((vs) => {
      const next = [...vs, { html: cleaned, label }];
      countRef.current = next.length;
      setView(next.length - 1);
      return next;
    });
    setActiveFile("index.html");
    setApproved(false); // a new build invalidates any prior approval
  }

  async function turn(userText: string, first: boolean) {
    setBusy(true);
    // 1) conversational agent reply (GenAI) — makes it feel like a real agent
    const aid = push({ role: "agent", author: "Builder Agent", text: "", streaming: true });
    try {
      await streamOnce("/api/vibe/say", { text: userText, first }, (t) => update(aid, { text: t }));
    } catch {
      update(aid, { text: first ? "Understood. Starting the build now." : "Understood. Applying the update now." });
    }
    update(aid, { streaming: false });

    // 2) build / refine — streams code into the editor (uses refs → always freshest build)
    const label = `v${countRef.current + 1}`;
    const sid = push({ role: "system", kind: "start", text: "writing index.html", streaming: true });
    const url = first ? "/api/vibe/generate" : "/api/vibe/refine";
    const body = first ? { idea: userText } : { idea, current_html: htmlRef.current, feedback: userText };
    try {
      await gen.run(url, body, (full) => {
        commit(label, full);
        update(sid, { kind: "done", streaming: false, text: `index.html ready · ${label} (${full.length} chars)` });
        push({ role: "agent", author: "Builder Agent", text: `Build complete. Let me know if you'd like any changes.` });
      });
      setPreviewSig((s) => s + 1); // build complete → auto-open full-screen preview
    } catch (e) {
      update(sid, { kind: "error", streaming: false, text: "generation interrupted" });
      push({ role: "agent", author: "Builder Agent", text: (e as Error).message || "Something went wrong — please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function submitApproval() {
    const html = latest?.html;
    if (!html || busy) return;
    setBusy(true);
    const n = reviewAttempts + 1;
    setReviewAttempts(n);
    try {
      const rev = await submitForApproval({ html, push, update, attempt: n });
      if (rev?.approved) setApproved(true);
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    push({ role: "user", author: "You", text });
    if (!idea) {
      setIdea(text);
      turn(text, true);
    } else {
      turn(text, false);
    }
  }

  return (
    <Ide
      projectName="vibe-app"
      chatTitle="Vibe Chat"
      hideUnwritten
      onReset={onReset}
      previewSignal={previewSig}
      files={files}
      activeFile={activeFile}
      onSelectFile={(n) => {
        setActiveFile(n);
        if (n.startsWith("v")) setView(parseInt(n.slice(1)) - 1);
        else setView(versions.length - 1);
      }}
      editor={{
        filename: activeFile,
        text: editorText,
        streaming: gen.streaming,
        empty: "Describe an app in the chat → the Builder Agent writes index.html here.",
      }}
      previewHtml={editorHtml}
      messages={messages}
      titleActions={
        <>
          {approved ? (
            <span className="pill accent">✓ approved · attempt {reviewAttempts}</span>
          ) : reviewAttempts > 0 ? (
            <span className="pill">review attempt {reviewAttempts}</span>
          ) : versions.length > 0 ? (
            <span className="pill accent">iteration {versions.length}</span>
          ) : (
            <span className="pill">vibecoding</span>
          )}
          {latest && (
            <button className="btn-secondary" onClick={submitApproval} disabled={busy || approved}>
              {approved ? "Approved ✓" : "Submit for approval"}
            </button>
          )}
          <GallerySubmit mode="vibe" title={idea} html={latest?.html ?? ""} iterations={versions.length} />
        </>
      }
      input={{
        value: input,
        onChange: setInput,
        onSubmit: submit,
        disabled: busy,
        placeholder: idea ? "Describe a change, or what's broken…" : "Describe the app you want to build…",
        sendLabel: busy ? "…" : idea ? "Send" : "Build",
      }}
    />
  );
}
