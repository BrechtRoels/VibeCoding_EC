import { useState } from "react";

type Props = {
  title: string;
  subtitle: string;
  password: string;
  storageKey: string;
  onUnlock: () => void;
  hint?: string;
};

/** Minimal, professional password gate (reuses the login visuals). */
export function PasswordGate({ title, subtitle, password, storageKey, onUnlock, hint }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value === password) {
      sessionStorage.setItem(storageKey, "1");
      onUnlock();
    } else {
      setError(true);
      setValue("");
      setTimeout(() => setError(false), 600);
    }
  }

  return (
    <div className="login">
      <div className="login-bg" aria-hidden>
        <span className="orb a" />
        <span className="orb b" />
        <span className="orb c" />
        <span className="orb d" />
      </div>
      <div className={`login-card ${error ? "login-shake" : ""}`}>
        <div className="login-brand">▦</div>
        <h1>{title}</h1>
        <p className="sub">{subtitle}</p>
        <form className="login-form" onSubmit={submit}>
          <input
            type="password"
            value={value}
            autoFocus
            placeholder="Enter password"
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={!value}>
            Open
          </button>
          <p className="login-err">{error ? "Incorrect password — try again" : ""}</p>
        </form>
        {hint && <p className="login-hint">{hint}</p>}
      </div>
    </div>
  );
}
