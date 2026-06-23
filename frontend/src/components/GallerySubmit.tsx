import { useState } from "react";
import { ensureName, submitGallery, type GalleryEntry } from "../lib/gallery";

type Props = {
  mode: GalleryEntry["mode"];
  title: string;
  html: string;
};

/** A small "share to the projected wall" button for the IDE titlebar. */
export function GallerySubmit({ mode, title, html }: Props) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  if (!html) return null;

  async function share() {
    if (state === "sending") return;
    setState("sending");
    try {
      await submitGallery(mode, title || "Untitled", html, ensureName());
      setState("done");
      setTimeout(() => setState("idle"), 2200);
    } catch {
      setState("idle");
    }
  }

  return (
    <button className="btn-secondary" style={{ padding: "6px 11px", fontSize: 12 }} onClick={share} disabled={state === "sending"}>
      {state === "done" ? "✓ Shared to wall" : state === "sending" ? "Sharing…" : "↗ Share to wall"}
    </button>
  );
}
