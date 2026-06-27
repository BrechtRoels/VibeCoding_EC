import { CodeGlyph } from "./CodeGlyph";

/** Shown when a lab is part of the training but the facilitator hasn't opened it yet. */
export function LockedLab({ label }: { label: string }) {
  return (
    <div className="locked-lab">
      <div className="locked-card">
        <div className="locked-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h2>{label} is locked</h2>
        <p>This lab is part of the training but your facilitator hasn't opened it yet.</p>
        <p className="locked-sub">It'll unlock here automatically the moment they do — no need to refresh.</p>
        <div className="locked-mark"><CodeGlyph size={16} /> Three Ways to Build</div>
      </div>
    </div>
  );
}
