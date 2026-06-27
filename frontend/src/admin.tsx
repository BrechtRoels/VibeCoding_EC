import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { CodeGlyph } from "./components/CodeGlyph";
import { login, clearToken } from "./lib/api";
import {
  fetchSession,
  resetSession,
  setStage as pushStage,
  MODE_IDS,
  type LabState,
  type ModeId,
  type Stage,
  DEFAULT_STAGE,
} from "./lib/session";
import "./theme.css";

const ADMIN_KEY = "twtb_admin";

const MODE_LABEL: Record<ModeId, string> = {
  vibe: "Vibecoding",
  spec: "Spec-Driven",
  harness: "Harness",
};
const MODE_BLURB: Record<ModeId, string> = {
  vibe: "Describe an app in plain language; the agent builds it.",
  spec: "Kiro-style: requirements → design → tasks, then build.",
  harness: "Build inside locked rules with a deterministic lint gate.",
};

const STATES: { value: LabState; label: string; hint: string }[] = [
  { value: "hidden", label: "Hidden", hint: "Not in this training — participants don't see it." },
  { value: "locked", label: "Locked", hint: "Shown as an upcoming lab, but not yet playable." },
  { value: "unlocked", label: "Unlocked", hint: "Open — participants can use it now." },
];

// ---- Login ---------------------------------------------------------------
function AdminLogin({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { ok, role } = await login(value);
      if (ok && role === "admin") {
        sessionStorage.setItem(ADMIN_KEY, "1");
        onUnlock();
        return;
      }
      clearToken();
      setError(ok ? "That password isn't an admin password." : "Incorrect password.");
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
    setValue("");
  }

  return (
    <div className="login">
      <div className="login-bg" aria-hidden>
        <span className="orb a" /><span className="orb b" /><span className="orb c" /><span className="orb d" />
      </div>
      <div className={`login-card ${error ? "login-shake" : ""}`}>
        <div className="login-brand"><CodeGlyph size={28} /></div>
        <h1>Training Control</h1>
        <p className="sub">Facilitator admin · steer the labs</p>
        <form className="login-form" onSubmit={submit}>
          <input type="password" value={value} autoFocus placeholder="Admin password" onChange={(e) => setValue(e.target.value)} />
          <button type="submit" className="btn-primary" disabled={!value || busy}>{busy ? "Checking…" : "Open control"}</button>
          <p className="login-err">{error}</p>
        </form>
        <p className="login-hint">Facilitators only</p>
      </div>
    </div>
  );
}

// ---- Control panel -------------------------------------------------------
function AdminPanel() {
  const [stage, setStage] = useState<Stage>(DEFAULT_STAGE);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Load + keep in sync (so two facilitators / a reload reflect live state).
  useEffect(() => {
    let on = true;
    const load = () => fetchSession().then((s) => on && setStage(s.stage)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { on = false; clearInterval(t); };
  }, []);

  async function apply(next: Stage) {
    setStage(next); // optimistic
    setSaving(true);
    setErr("");
    try {
      const saved = await pushStage(next);
      setStage(saved);
    } catch {
      setErr("Save failed — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const setOne = (m: ModeId, v: LabState) => apply({ ...stage, [m]: v });

  async function freshSession() {
    if (!window.confirm("Start a fresh session?\n\nThis clears the wall, logs out & resets every participant, and re-locks every lab.")) return;
    setSaving(true);
    try {
      await resetSession();
      const s = await fetchSession();
      setStage(s.stage);
    } catch {
      setErr("Reset failed.");
    } finally {
      setSaving(false);
    }
  }

  const visibleCount = MODE_IDS.filter((m) => stage[m] !== "hidden").length;
  const openCount = MODE_IDS.filter((m) => stage[m] === "unlocked").length;

  return (
    <div className="admin">
      <header className="admin-head">
        <div className="admin-title">
          <span className="mark"><CodeGlyph size={19} /></span>
          <div>
            <h1>Training Control</h1>
            <p>Choose which labs are in this training and open them when you're ready. Participants update live.</p>
          </div>
        </div>
        <div className="admin-actions">
          <span className={`admin-status ${saving ? "busy" : ""}`}>{saving ? "Saving…" : "Saved"}</span>
          <button className="btn-secondary" onClick={freshSession}>↻ Fresh session</button>
        </div>
      </header>

      {err && <div className="admin-err">{err}</div>}

      <div className="admin-summary">
        {visibleCount === 0
          ? "No labs in this training yet — set at least one to Locked or Unlocked."
          : `${visibleCount} lab${visibleCount > 1 ? "s" : ""} in this training · ${openCount} open now.`}
      </div>

      <div className="admin-grid">
        {MODE_IDS.map((m, i) => (
          <section key={m} className={`admin-lab state-${stage[m]}`}>
            <div className="admin-lab-head">
              <span className="admin-lab-num">{i + 1}</span>
              <div>
                <h2>{MODE_LABEL[m]}</h2>
                <p>{MODE_BLURB[m]}</p>
              </div>
            </div>
            <div className="seg">
              {STATES.map((s) => (
                <button
                  key={s.value}
                  className={`seg-btn ${stage[m] === s.value ? "active" : ""} seg-${s.value}`}
                  onClick={() => setOne(m, s.value)}
                  title={s.hint}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="admin-lab-hint">{STATES.find((s) => s.value === stage[m])?.hint}</p>
          </section>
        ))}
      </div>

      <div className="admin-foot">
        <div className="admin-quick">
          <span>Quick presets:</span>
          <button className="chip" onClick={() => apply({ vibe: "unlocked", spec: "hidden", harness: "hidden" })}>Vibecoding only</button>
          <button className="chip" onClick={() => apply({ vibe: "unlocked", spec: "locked", harness: "hidden" })}>Vibe → Spec</button>
          <button className="chip" onClick={() => apply({ vibe: "unlocked", spec: "locked", harness: "locked" })}>All three (gated)</button>
          <button className="chip" onClick={() => apply({ vibe: "locked", spec: "locked", harness: "locked" })}>Lock everything</button>
        </div>
        <p className="admin-note">Locks are enforced on the server — a locked lab's actions are refused even if a participant calls the API directly.</p>
      </div>
    </div>
  );
}

function AdminApp() {
  const [ok, setOk] = useState(() => sessionStorage.getItem(ADMIN_KEY) === "1");
  return ok ? <AdminPanel /> : <AdminLogin onUnlock={() => setOk(true)} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
