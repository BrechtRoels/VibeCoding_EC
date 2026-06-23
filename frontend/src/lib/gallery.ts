import { apiUrl } from "./api";

export type GalleryEntry = {
  id: string;
  mode: "vibe" | "spec" | "harness";
  title: string;
  author: string;
  html: string;
  ts: number;
};

export const MODE_LABEL: Record<GalleryEntry["mode"], string> = {
  vibe: "Vibecoding",
  spec: "Spec-Driven",
  harness: "Harness",
};

const NAME_KEY = "twtb_name";

/** Ask once for a display name, remembered for the session. */
export function ensureName(): string {
  let n = sessionStorage.getItem(NAME_KEY);
  if (!n) {
    n = (window.prompt("Your name for the gallery wall?", "") || "").trim().slice(0, 40) || "Anonymous";
    sessionStorage.setItem(NAME_KEY, n);
  }
  return n;
}

export async function fetchGallery(): Promise<GalleryEntry[]> {
  const r = await fetch(apiUrl("/api/gallery"));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return d.entries ?? [];
}

export async function submitGallery(
  mode: GalleryEntry["mode"],
  title: string,
  html: string,
  author: string
): Promise<void> {
  await fetch(apiUrl("/api/gallery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, title, html, author }),
  });
}

export async function clearGallery(): Promise<void> {
  await fetch(apiUrl("/api/gallery/clear"), { method: "POST" });
}
