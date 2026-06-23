import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  html: string;
  placeholder?: string;
  /** Label shown in the full-screen bar. */
  title?: string;
};

// allow-same-origin lets generated apps use localStorage/IndexedDB so they actually
// work (e.g. a food tracker persists entries). These are locally-generated previews.
const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups";

/** Renders generated HTML in a sandboxed iframe with a full-screen viewer. */
export function Preview({ html, placeholder, title = "Generated app" }: Props) {
  const [full, setFull] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  if (!html) {
    return <div className="preview-empty">{placeholder ?? "Preview appears here"}</div>;
  }

  const nativeFullscreen = () => {
    const el = wrapRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  return (
    <div className="preview-wrap">
      <iframe className="preview-frame" title="preview" sandbox={SANDBOX} srcDoc={html} />
      <button className="preview-expand" title="Full screen" onClick={() => setFull(true)}>
        ⛶
      </button>

      {full &&
        createPortal(
          <div
            className="fs-overlay"
            onClick={(e) => e.target === e.currentTarget && setFull(false)}
          >
            <div className="fs-bar">
              <span className="fs-title">
                <span className="dot live" /> {title} — full screen
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-secondary" onClick={nativeFullscreen}>
                  ⛶ Native fullscreen
                </button>
                <button className="btn-secondary" onClick={() => setFull(false)}>
                  Close (Esc)
                </button>
              </div>
            </div>
            <div className="fs-frame-wrap" ref={wrapRef}>
              <iframe title="preview-full" sandbox={SANDBOX} srcDoc={html} />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
