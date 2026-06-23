import { apiUrl } from "./api";

/** Current shared session epoch (bumped when the host starts a fresh session). */
export async function fetchEpoch(): Promise<number> {
  const r = await fetch(apiUrl("/api/session"));
  const d = await r.json();
  return Number(d.epoch ?? 0);
}

/** Host action: clear the wall and bump the epoch (logs out / resets everyone). */
export async function resetSession(): Promise<void> {
  await fetch(apiUrl("/api/session/reset"), { method: "POST" });
}
