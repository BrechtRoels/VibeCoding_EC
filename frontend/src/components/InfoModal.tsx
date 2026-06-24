import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CodeGlyph } from "./CodeGlyph";

const MODES = [
  {
    n: 1,
    title: "Vibecoding",
    text: "Describe an app in the chat — an agent builds it instantly. Keep chatting to tweak it. Fast and exploratory, but every run makes its own choices.",
  },
  {
    n: 2,
    title: "Spec-Driven (Kiro-style)",
    text: "The agent writes the spec first — requirements → design → tasks, with your approval at each step — then implements it task by task. Slower, but traceable and consistent.",
  },
  {
    n: 3,
    title: "Harness Engineering",
    text: "The design system and architecture are locked; you only describe the feature. A lint gate enforces compliance, so every app comes out uniform and production-aligned.",
  },
];

export function InfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <span className="mark"><CodeGlyph size={19} /></span>
          <div>
            <h2>Three Ways to Build</h2>
            <p>One app idea, three AI-coding philosophies.</p>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="modal-lead">
          Build the same kind of app three different ways to feel the trade-offs between
          <strong> speed</strong>, <strong>structure</strong>, and <strong>guardrails</strong>.
        </p>

        <div className="modal-modes">
          {MODES.map((m) => (
            <div className="mm" key={m.n}>
              <span className="mm-n">{m.n}</span>
              <div>
                <strong>{m.title}</strong>
                <p>{m.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-how">
          <strong>How to use:</strong> pick a mode from the menu up top, type in the chat on the
          right, and watch it build in the editor. The finished app opens full screen — press
          <strong> Esc</strong> to close it. Hit <strong>↻ Reset</strong> any time to start over.
        </div>
      </div>
    </div>,
    document.body
  );
}
