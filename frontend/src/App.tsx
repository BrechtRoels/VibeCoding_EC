import { useState } from "react";
import { VibeMode } from "./modes/VibeMode";
import { SpecMode } from "./modes/SpecMode";
import { HarnessMode } from "./modes/HarnessMode";
import { Login } from "./components/Login";

type Mode = "vibe" | "spec" | "harness";

const AUTH_KEY = "twtb_authed";

const NAV: { id: Mode; label: string }[] = [
  { id: "vibe", label: "Vibecoding" },
  { id: "spec", label: "Spec-Driven" },
  { id: "harness", label: "Harness" },
];

const MODE_LABEL: Record<Mode, string> = {
  vibe: "Vibecoding",
  spec: "Spec-Driven",
  harness: "Harness",
};

export default function App() {
  const [mode, setMode] = useState<Mode>("vibe");
  const [resetN, setResetN] = useState<Record<Mode, number>>({ vibe: 0, spec: 0, harness: 0 });
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === "1");

  function unlock() {
    sessionStorage.setItem(AUTH_KEY, "1");
    setAuthed(true);
  }

  function resetMode(m: Mode) {
    if (!window.confirm(`Start over with a blank ${MODE_LABEL[m]}? This clears the current work.`)) return;
    localStorage.removeItem(`twtb:${m}`);
    setResetN((r) => ({ ...r, [m]: r[m] + 1 }));
  }

  if (!authed) return <Login onUnlock={unlock} />;

  return (
    <div className="app-fs">
      <div className="app-wordmark">
        <span className="mark" />
        <span className="wm-text">
          <span className="wm-title">Three Ways to Build</span>
          <span className="wm-sub">AI-assisted development studio</span>
        </span>
      </div>

      <nav className="floatmenu">
        <div className="fm-tabs">
          {NAV.map((n, i) => (
            <button
              key={n.id}
              className={`fm-tab ${mode === n.id ? "active" : ""}`}
              onClick={() => setMode(n.id)}
            >
              <span className="fm-num">{i + 1}</span>
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="app-topright">
        <div className="app-env">
          <span className="env-dot" />
          PwC GenAI · Opus
        </div>
      </div>

      <main className="main-fs">
        {mode === "vibe" && <VibeMode key={`vibe-${resetN.vibe}`} onReset={() => resetMode("vibe")} />}
        {mode === "spec" && <SpecMode key={`spec-${resetN.spec}`} onReset={() => resetMode("spec")} />}
        {mode === "harness" && <HarnessMode key={`harness-${resetN.harness}`} onReset={() => resetMode("harness")} />}
      </main>
    </div>
  );
}
