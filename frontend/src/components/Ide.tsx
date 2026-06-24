import { useEffect, useRef, useState, type ReactNode } from "react";
import { Preview } from "./Preview";
import { FullscreenPreview } from "./FullscreenPreview";

export type FileStatus = "pending" | "writing" | "ready" | "locked";

export type IdeFile = {
  name: string;
  group?: string;
  status: FileStatus;
  locked?: boolean;
};

export type ChatMsg = {
  id: string;
  role: "user" | "agent" | "system";
  author?: string;
  text?: string;
  kind?: "info" | "start" | "done" | "error" | "check";
  streaming?: boolean;
  node?: ReactNode;
};

export type EditorState = {
  filename: string;
  text: string;
  streaming?: boolean;
  editable?: boolean;
  onChange?: (v: string) => void;
  toolbar?: ReactNode;
  empty?: string;
};

type Props = {
  projectName: string;
  files: IdeFile[];
  activeFile: string;
  onSelectFile: (name: string) => void;
  editor: EditorState;
  previewHtml?: string;
  messages: ChatMsg[];
  chatTitle?: string;
  /** When true, files with status "pending" are hidden until they're created. */
  hideUnwritten?: boolean;
  input: {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    placeholder?: string;
    disabled?: boolean;
    sendLabel?: string;
    actions?: ReactNode;
  };
  titleActions?: ReactNode;
  /** Optional "start from blank" handler — renders a Reset button in the titlebar. */
  onReset?: () => void;
  /** Bump this when a build completes to auto-open the preview full screen. */
  previewSignal?: number;
  /** Optional hover explanation per explorer folder (keyed by group name). */
  folderInfo?: Record<string, string>;
};

const GLYPH: Record<NonNullable<ChatMsg["kind"]>, string> = {
  info: "·", start: "▸", done: "✓", error: "✕", check: "→",
};

const THINKING_PHRASES = [
  "Thinking…",
  "Planning the structure…",
  "Designing the layout…",
  "Writing the markup…",
  "Styling the components…",
  "Wiring up the logic…",
  "Finishing touches…",
];
const SK_WIDTHS = ["62%", "88%", "74%", "45%", "82%", "58%", "90%", "50%", "78%", "66%", "84%", "40%"];

/** Shown in the editor while we wait for the first streamed token. */
function EditorLoading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % THINKING_PHRASES.length), 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="ide-loading">
      <div className="ide-loading-inner">
        <div className="ide-thinking">
          <span className="spinner" />
          <span className="ph">{THINKING_PHRASES[i]}</span>
        </div>
        <div className="skeleton">
          {SK_WIDTHS.map((w, k) => (
            <div className="sk-line" style={{ width: w }} key={k} />
          ))}
        </div>
      </div>
    </div>
  );
}

const TypingDots = () => (
  <span className="typing">
    <span />
    <span />
    <span />
  </span>
);

function CodeView({ editor }: { editor: EditorState }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // While streaming, keep the latest code in view — but only if the user
  // hasn't scrolled up to read something (then we leave their position alone).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && editor.streaming && stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  });

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  if (!editor.filename) return <div className="ide-empty">{editor.empty ?? "No file open"}</div>;
  if (editor.editable && !editor.streaming) {
    return (
      <textarea
        className="ide-code-edit"
        value={editor.text}
        onChange={(e) => editor.onChange?.(e.target.value)}
        spellCheck={false}
        placeholder={editor.empty}
      />
    );
  }
  const text = editor.text || "";
  if (!text && !editor.streaming) return <div className="ide-empty">{editor.empty ?? "Empty file"}</div>;
  // Waiting for the first token → show a thinking / loading screen, not blank white.
  if (!text && editor.streaming) return <EditorLoading />;
  const lines = text.split("\n");
  return (
    <div className="ide-code" ref={scrollRef} onScroll={onScroll}>
      <div className="ide-gutter">
        {lines.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <pre className="ide-codetext">
        {text}
        {editor.streaming && <span className="cursor" />}
      </pre>
    </div>
  );
}

export function Ide(props: Props) {
  const { editor, previewHtml } = props;
  const [view, setView] = useState<"code" | "preview">("code");
  const [autoFs, setAutoFs] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editor.streaming) setView("code");
  }, [editor.streaming]);

  // When a build completes (parent bumps previewSignal), auto-open the finished
  // app full screen so the room sees the result immediately.
  useEffect(() => {
    if (props.previewSignal && previewHtml) setAutoFs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.previewSignal]);

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight, behavior: "smooth" });
  }, [props.messages.length, props.messages[props.messages.length - 1]?.text]);

  // group files for the explorer (optionally hide not-yet-created files)
  const visibleFiles = props.hideUnwritten
    ? props.files.filter((f) => f.status !== "pending")
    : props.files;
  const groups = new Map<string, IdeFile[]>();
  for (const f of visibleFiles) {
    const g = f.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(f);
  }
  const explorerEmpty = visibleFiles.length === 0;

  return (
    <div className="ide">
      <div className="ide-titlebar">
        <div className="lights">
          <span className="light red" />
          <span className="light yellow" />
          <span className="light green" />
        </div>
        <div className="ide-title">
          <strong>{props.projectName}</strong> — {editor.filename || "no file"}
        </div>
        <div className="ide-actions">
          {props.onReset && (
            <button className="btn-secondary ide-reset-btn" onClick={props.onReset} title="Start from blank">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
              Reset
            </button>
          )}
          {props.titleActions}
        </div>
      </div>

      <div className="ide-body">
        {/* Explorer */}
        <div className="ide-explorer">
          {explorerEmpty && <div className="exp-empty">No files yet — they'll appear as they're created.</div>}
          {[...groups.entries()].map(([g, fs]) => (
            <div key={g || "root"}>
              {g ? (
                <div className="exp-folder">
                  <span>📂 {g}</span>
                  {props.folderInfo?.[g] && (
                    <>
                      <span className="exp-info" tabIndex={0} aria-label="About this folder">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <line x1="12" y1="11" x2="12" y2="16.5" />
                          <circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
                        </svg>
                      </span>
                      <span className="exp-tip">{props.folderInfo[g]}</span>
                    </>
                  )}
                </div>
              ) : (
                <div className="exp-section">Explorer</div>
              )}
              {fs.map((f) => (
                <button
                  key={f.name}
                  className={`exp-file ${props.activeFile === f.name ? "active" : ""}`}
                  onClick={() => onSelectGuard(f) && props.onSelectFile(f.name)}
                  disabled={f.status === "pending"}
                >
                  <span>{f.name.endsWith(".html") ? "🌐" : f.name.endsWith(".css") ? "🎨" : "📄"}</span>
                  <span className="ext">{f.name}</span>
                  {f.locked && <span className="lock">🔒</span>}
                  {f.status === "writing" && <span className="spinner sm" />}
                  {f.status === "ready" && <span className="fdot" />}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Editor */}
        <div className="ide-editor">
          <div className="ide-tabs2">
            <button className={`etab ${view === "code" ? "active" : ""}`} onClick={() => setView("code")}>
              {editor.streaming && <span className="dotw" />}
              {editor.filename || "editor"}
            </button>
            {previewHtml !== undefined && (
              <button
                className={`etab ${view === "preview" ? "active" : ""}`}
                onClick={() => setView("preview")}
                disabled={!previewHtml}
              >
                ◳ Preview
              </button>
            )}
            <div className="ide-editor-toolbar">{editor.toolbar}</div>
          </div>
          <div className="ide-editor-body">
            {view === "preview" ? (
              <Preview html={previewHtml ?? ""} title={props.projectName} placeholder="Run a build to see the live app" />
            ) : (
              <CodeView editor={editor} />
            )}
          </div>
        </div>

        {/* Chat / agents */}
        <div className="ide-chat">
          <div className="ide-chat-head">{props.chatTitle ?? "Agent Chat"}</div>
          <div className="ide-chat-msgs" ref={msgsRef}>
            {props.messages.map((m) => (
              <div key={m.id} className={`cm ${m.role} ${m.kind ? "k-" + m.kind : ""}`}>
                {m.role !== "system" && m.author && (
                  <span className="cm-author">
                    {m.streaming && <span className="cm-spin spinner sm" />}
                    {m.author}
                  </span>
                )}
                <div className="cm-bubble">
                  {m.role === "system" && <span className="cm-glyph">{GLYPH[m.kind ?? "info"]}</span>}
                  {m.streaming && !m.text ? (
                    <TypingDots />
                  ) : (
                    <span>
                      {m.text}
                      {m.streaming && m.role === "system" && "…"}
                    </span>
                  )}
                </div>
                {m.node}
              </div>
            ))}
          </div>
          <div className="ide-chat-input">
            {props.input.actions && <div className="ci-actions">{props.input.actions}</div>}
            <div className="ci-row">
              <textarea
                value={props.input.value}
                placeholder={props.input.placeholder ?? "Message the agent…"}
                onChange={(e) => props.input.onChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!props.input.disabled) props.input.onSubmit();
                  }
                }}
              />
              <button
                className="btn-primary ci-send"
                onClick={props.input.onSubmit}
                disabled={props.input.disabled}
              >
                {props.input.sendLabel ?? "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <FullscreenPreview
        html={previewHtml ?? ""}
        open={autoFs}
        onClose={() => setAutoFs(false)}
        title={props.projectName}
      />
    </div>
  );
}

function onSelectGuard(f: IdeFile): boolean {
  return f.status !== "pending";
}
