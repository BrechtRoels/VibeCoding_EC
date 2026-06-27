import { useEffect, useMemo, useState } from "react";
import { VibeMode } from "./modes/VibeMode";
import { SpecMode } from "./modes/SpecMode";
import { HarnessMode } from "./modes/HarnessMode";
import { Login } from "./components/Login";
import { CodeGlyph } from "./components/CodeGlyph";
import { InfoModal } from "./components/InfoModal";
import { LockedLab } from "./components/LockedLab";
import { fetchSession, type ModeId, type Stage, DEFAULT_STAGE } from "./lib/session";
import { clearToken } from "./lib/api";

const AUTH_KEY = "twtb_authed";
const EPOCH_KEY = "twtb:epoch";
const SNAP_KEYS = ["twtb:vibe", "twtb:spec", "twtb:harness"];

const NAV: { id: ModeId; label: string }[] = [
  { id: "vibe", label: "Vibecoding" },
  { id: "spec", label: "Spec-Driven" },
  { id: "harness", label: "Harness" },
];

const MODE_LABEL: Record<ModeId, string> = {
  vibe: "Vibecoding",
  spec: "Spec-Driven",
  harness: "Harness",
};

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export default function App() {
  const [mode, setMode] = useState<ModeId>("vibe");
  const [resetN, setResetN] = useState<Record<ModeId, number>>({ vibe: 0, spec: 0, harness: 0 });
  const [info, setInfo] = useState(false);
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === "1");
  const [stage, setStage] = useState<Stage>(DEFAULT_STAGE);

  // Poll the shared session: the epoch (host "fresh session" → log out + reset)
  // and the live training stage (which labs are visible / locked / unlocked).
  useEffect(() => {
    let on = true;
    async function check() {
      try {
        const { epoch, stage: nextStage } = await fetchSession();
        if (!on) return;
        setStage(nextStage);
        const local = localStorage.getItem(EPOCH_KEY);
        const e = String(epoch);
        if (local === null) {
          localStorage.setItem(EPOCH_KEY, e);
        } else if (local !== e) {
          localStorage.setItem(EPOCH_KEY, e);
          SNAP_KEYS.forEach((k) => localStorage.removeItem(k));
          sessionStorage.removeItem(AUTH_KEY);
          clearToken();
          window.location.reload();
        }
      } catch {
        /* offline / backend down — ignore */
      }
    }
    check();
    const t = setInterval(check, 4000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);

  // Labs that are part of this training (anything not hidden), in canonical order.
  const visible = useMemo(() => NAV.filter((n) => stage[n.id] !== "hidden"), [stage]);

  // Keep the selected lab valid: if it gets hidden, fall back to the first visible
  // one (prefer an unlocked lab so participants land somewhere playable).
  useEffect(() => {
    if (stage[mode] !== "hidden") return;
    const next = visible.find((n) => stage[n.id] === "unlocked") ?? visible[0];
    if (next) setMode(next.id);
  }, [stage, mode, visible]);

  function unlock() {
    sessionStorage.setItem(AUTH_KEY, "1");
    setAuthed(true);
  }

  function resetMode(m: ModeId) {
    if (!window.confirm(`Start over with a blank ${MODE_LABEL[m]}? This clears the current work.`)) return;
    localStorage.removeItem(`twtb:${m}`);
    setResetN((r) => ({ ...r, [m]: r[m] + 1 }));
  }

  if (!authed) return <Login onUnlock={unlock} />;

  const current = stage[mode] === "hidden" ? null : mode;

  return (
    <div className="app-fs">
      <div className="app-wordmark">
        <span className="mark"><CodeGlyph size={15} /></span>
        <span className="wm-text">
          <span className="wm-title">Three Ways to Build</span>
          <span className="wm-sub">AI-assisted development studio</span>
        </span>
      </div>

      {visible.length > 0 && (
        <nav className="floatmenu">
          <div className="fm-tabs">
            {visible.map((n, i) => {
              const locked = stage[n.id] === "locked";
              return (
                <button
                  key={n.id}
                  className={`fm-tab ${mode === n.id ? "active" : ""} ${locked ? "locked" : ""}`}
                  onClick={() => setMode(n.id)}
                  title={locked ? `${n.label} — locked until your facilitator opens it` : n.label}
                >
                  <span className="fm-num">{locked ? <LockIcon /> : i + 1}</span>
                  {n.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <div className="app-topright">
        <button className="info-btn" onClick={() => setInfo(true)} title="What is this?" aria-label="About this app">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="11" x2="12" y2="16.5" />
            <circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <div className="app-env">
          <span className="env-dot" />
          PwC GenAI · Mistral
        </div>
      </div>

      <InfoModal open={info} onClose={() => setInfo(false)} />

      <main className="main-fs">
        {visible.length === 0 ? (
          <LockedLab label="The training" />
        ) : current === null ? null : stage[current] === "locked" ? (
          <LockedLab label={MODE_LABEL[current]} />
        ) : (
          <>
            {current === "vibe" && <VibeMode key={`vibe-${resetN.vibe}`} onReset={() => resetMode("vibe")} />}
            {current === "spec" && <SpecMode key={`spec-${resetN.spec}`} onReset={() => resetMode("spec")} />}
            {current === "harness" && <HarnessMode key={`harness-${resetN.harness}`} onReset={() => resetMode("harness")} />}
          </>
        )}
      </main>
    </div>
  );
}
