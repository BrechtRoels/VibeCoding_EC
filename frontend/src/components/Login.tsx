import { useEffect, useState } from "react";

const PASSWORD = "PwCVibeCoding2026";

const QUOTES: { text: string; author: string }[] = [
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  { text: "Any sufficiently advanced technology is indistinguishable from magic.", author: "Arthur C. Clarke" },
  { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "Programs must be written for people to read.", author: "Harold Abelson" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "Creativity is intelligence having fun.", author: "Albert Einstein" },
  { text: "Good design is as little design as possible.", author: "Dieter Rams" },
  { text: "The computer was born to solve problems that did not exist before.", author: "Bill Gates" },
  { text: "Code is the closest thing we have to a superpower.", author: "Drew Houston" },
  { text: "Vibe first, validate always, ship with intent.", author: "Three Ways to Build" },
];

export function Login({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [qi, setQi] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setQi((i) => (i + 1) % QUOTES.length), 4200);
    return () => clearInterval(t);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value === PASSWORD) {
      onUnlock();
    } else {
      setError(true);
      setValue("");
      setTimeout(() => setError(false), 600);
    }
  }

  const quote = QUOTES[qi];

  return (
    <div className="login">
      <div className="login-bg" aria-hidden>
        <span className="orb a" />
        <span className="orb b" />
        <span className="orb c" />
        <span className="orb d" />
        <span className="qfloat q1">&ldquo;</span>
        <span className="qfloat q2">&rdquo;</span>
        <span className="qfloat q3">&ldquo;</span>
        <span className="qfloat q4">&rdquo;</span>
        <span className="qfloat q5">&ldquo;</span>
        <span className="qfloat q6">&rdquo;</span>
      </div>

      <div className={`login-card ${error ? "login-shake" : ""}`}>
        <div className="login-brand">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="8 7 3 12 8 17" />
            <polyline points="16 7 21 12 16 17" />
            <line x1="13.5" y1="5" x2="10.5" y2="19" />
          </svg>
        </div>
        <h1>Three Ways to Build</h1>
        <p className="sub">Vibecoding · Spec-Driven · Harness Engineering</p>

        <div className="quote-rotator">
          <div className="qmark">&ldquo;</div>
          <p className="quote-text" key={qi}>
            {quote.text}
          </p>
          <p className="quote-author" key={`a-${qi}`}>
            — {quote.author}
          </p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <input
            type="password"
            value={value}
            autoFocus
            placeholder="Enter password"
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={!value}>
            Enter the studio
          </button>
          <p className="login-err">{error ? "Incorrect password — try again" : ""}</p>
        </form>

        <p className="login-hint">Authorized access only</p>
      </div>
    </div>
  );
}
