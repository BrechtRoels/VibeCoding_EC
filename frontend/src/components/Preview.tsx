import { useState } from "react";
import { FullscreenPreview } from "./FullscreenPreview";

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

  if (!html) {
    return <div className="preview-empty">{placeholder ?? "Preview appears here"}</div>;
  }

  return (
    <div className="preview-wrap">
      <iframe className="preview-frame" title="preview" sandbox={SANDBOX} srcDoc={html} />
      <button className="preview-expand" title="Full screen" onClick={() => setFull(true)}>
        ⛶
      </button>
      <FullscreenPreview html={html} open={full} onClose={() => setFull(false)} title={title} />
    </div>
  );
}
