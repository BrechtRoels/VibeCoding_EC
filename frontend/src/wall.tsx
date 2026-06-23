import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { Gallery } from "./modes/Gallery";
import { PasswordGate } from "./components/PasswordGate";
import "./theme.css";

// Host-only password for the projected wall (separate from the studio login).
const WALL_PASSWORD = "PwCVibeWall2026";
const WALL_KEY = "twtb_wall";

function WallApp() {
  const [ok, setOk] = useState(() => sessionStorage.getItem(WALL_KEY) === "1");

  if (!ok) {
    return (
      <PasswordGate
        title="Gallery Wall"
        subtitle="Host view · projected showcase"
        password={WALL_PASSWORD}
        storageKey={WALL_KEY}
        onUnlock={() => setOk(true)}
        hint="For facilitators"
      />
    );
  }
  return <Gallery onClose={() => (window.location.href = "/")} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WallApp />
  </React.StrictMode>
);
