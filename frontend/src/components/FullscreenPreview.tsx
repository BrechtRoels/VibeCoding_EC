import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Untrusted (gallery) HTML runs in an opaque origin with the minimum capability;
// trusted (the user's own preview) gets same-origin + forms/modals/popups. See Preview.tsx.
const UNTRUSTED_SANDBOX = "allow-scripts";
const TRUSTED_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups";
const sandboxFor = (trusted: boolean) => (trusted ? TRUSTED_SANDBOX : UNTRUSTED_SANDBOX);

type Props = {
  html: string;
  open: boolean;
  onClose: () => void;
  title?: string;
  /** See Preview.tsx — only true for the current user's own generated HTML. */
  trusted?: boolean;
};

/** Full-viewport preview overlay (sandboxed iframe) with Esc + native fullscreen. */
export function FullscreenPreview({ html, open, onClose, title = "Generated app", trusted = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !html) return null;

  const nativeFullscreen = () => wrapRef.current?.requestFullscreen?.().catch(() => {});

  return createPortal(
    <div className="fs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fs-bar">
        <span className="fs-title">
          <span className="dot live" /> {title} — full screen
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" onClick={nativeFullscreen}>⛶ Native fullscreen</button>
          <button className="btn-secondary" onClick={onClose}>Close (Esc)</button>
        </div>
      </div>
      <div className="fs-frame-wrap" ref={wrapRef}>
        <iframe title="preview-full" sandbox={sandboxFor(trusted)} srcDoc={html} />
      </div>
    </div>,
    document.body
  );
}
