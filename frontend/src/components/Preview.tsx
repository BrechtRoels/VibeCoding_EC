import { useState } from "react";
import { FullscreenPreview } from "./FullscreenPreview";

type Props = {
  html: string;
  placeholder?: string;
  /** Label shown in the full-screen bar. */
  title?: string;
  /**
   * Whether the HTML is the current user's own freshly-generated app. When true we
   * add `allow-same-origin` so the preview can use localStorage/IndexedDB (e.g. a
   * food tracker persists entries). NEVER set this for HTML authored by other users
   * (the gallery wall): with both `allow-scripts` and `allow-same-origin`, a srcDoc
   * iframe is same-origin with this app and its scripts could read our storage/DOM —
   * i.e. stored XSS. Untrusted HTML runs sandboxed in an opaque origin instead.
   */
  trusted?: boolean;
};

// Untrusted (gallery) HTML gets the minimum: scripts run so the app renders, but
// in an opaque origin with no popups/modals/forms/top-navigation — it cannot reach
// this app's DOM/storage/cookies or open attacker windows. Trusted (the user's own
// local preview) additionally gets same-origin so localStorage-backed apps work.
const UNTRUSTED_SANDBOX = "allow-scripts";
const TRUSTED_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups";
const sandboxFor = (trusted: boolean) => (trusted ? TRUSTED_SANDBOX : UNTRUSTED_SANDBOX);

/** Renders generated HTML in a sandboxed iframe with a full-screen viewer. */
export function Preview({ html, placeholder, title = "Generated app", trusted = false }: Props) {
  const [full, setFull] = useState(false);

  if (!html) {
    return <div className="preview-empty">{placeholder ?? "Preview appears here"}</div>;
  }

  return (
    <div className="preview-wrap">
      <iframe className="preview-frame" title="preview" sandbox={sandboxFor(trusted)} srcDoc={html} />
      <button className="preview-expand" title="Full screen" onClick={() => setFull(true)}>
        ⛶
      </button>
      <FullscreenPreview html={html} open={full} onClose={() => setFull(false)} title={title} trusted={trusted} />
    </div>
  );
}
