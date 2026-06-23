import { useState } from "react";
import { CodePane } from "./CodePane";
import { Preview } from "./Preview";

type Props = {
  /** Live streaming text (raw model output). */
  liveCode: string;
  /** Cleaned HTML to render once a version is committed. */
  html: string;
  streaming: boolean;
  elapsedMs: number;
  title?: string;
};

/** Split work area: streams code live, shows preview, with Code/Preview tabs. */
export function ResultView({ liveCode, html, streaming, elapsedMs, title }: Props) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  // While streaming, force the code tab so the user watches it build.
  const active = streaming ? "code" : tab;

  return (
    <div className="workarea">
      <div className="pane">
        <div className="pane-head">
          <span>{title ?? "Output"}</span>
          <div className="meta">
            <span className={`dot ${streaming ? "live" : html ? "ok" : ""}`} />
            {streaming ? "streaming" : html ? "ready" : "idle"}
            {elapsedMs > 0 && <span>{(elapsedMs / 1000).toFixed(1)}s</span>}
          </div>
        </div>
        <div className="pane-body">
          <CodePane code={liveCode} streaming={streaming} placeholder="Generated code streams here…" />
        </div>
      </div>

      <div className="pane">
        <div className="pane-head">
          <span>Live preview</span>
          <div className="tabs">
            <button className={`tab ${active === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>
              Preview
            </button>
            <button className={`tab ${active === "code" ? "active" : ""}`} onClick={() => setTab("code")}>
              Code
            </button>
          </div>
        </div>
        <div className="pane-body">
          {active === "preview" ? (
            <Preview
              html={html}
              title={title ?? "Generated app"}
              placeholder={streaming ? "Building… preview renders when done" : "Preview appears here"}
            />
          ) : (
            <CodePane code={liveCode || html} streaming={false} placeholder="No code yet" />
          )}
        </div>
      </div>
    </div>
  );
}
