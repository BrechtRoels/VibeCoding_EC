import { apiUrl, authHeaders } from "./api";

/** The three labs ("ways to build"). */
export type ModeId = "vibe" | "spec" | "harness";
export const MODE_IDS: ModeId[] = ["vibe", "spec", "harness"];

/** Per-lab training state, steered live by the admin. */
export type LabState = "hidden" | "locked" | "unlocked";
export type Stage = Record<ModeId, LabState>;

export const DEFAULT_STAGE: Stage = { vibe: "locked", spec: "locked", harness: "locked" };

export type OpenedAt = Record<ModeId, number | null>;
export type SessionState = {
  epoch: number;
  stage: Stage;
  /** Server epoch-seconds when each lab was unlocked (the race start), or null. */
  openedAt: OpenedAt;
  /** Server clock at fetch time — lets the wall sync its live timer past clock skew. */
  serverNow: number;
  /** Client clock at fetch time (Date.now() ms). */
  fetchedAt: number;
};

function normalizeStage(raw: unknown): Stage {
  const out: Stage = { ...DEFAULT_STAGE };
  if (raw && typeof raw === "object") {
    for (const m of MODE_IDS) {
      const v = (raw as Record<string, unknown>)[m];
      if (v === "hidden" || v === "locked" || v === "unlocked") out[m] = v;
    }
  }
  return out;
}

function normalizeOpened(raw: unknown): OpenedAt {
  const out: OpenedAt = { vibe: null, spec: null, harness: null };
  if (raw && typeof raw === "object") {
    for (const m of MODE_IDS) {
      const v = (raw as Record<string, unknown>)[m];
      if (typeof v === "number") out[m] = v;
    }
  }
  return out;
}

/** Public poll: current session epoch + the live training stage + race clocks. */
export async function fetchSession(): Promise<SessionState> {
  const r = await fetch(apiUrl("/api/session"));
  const d = await r.json();
  return {
    epoch: Number(d.epoch ?? 0),
    stage: normalizeStage(d.stage),
    openedAt: normalizeOpened(d.opened_at),
    serverNow: Number(d.now ?? 0),
    fetchedAt: Date.now(),
  };
}

/** Host action: clear the wall, bump the epoch, reset all labs to locked. */
export async function resetSession(): Promise<void> {
  await fetch(apiUrl("/api/session/reset"), { method: "POST", headers: authHeaders() });
}

/** Admin action: set the per-lab training stage (live). */
export async function setStage(stage: Stage): Promise<Stage> {
  const r = await fetch(apiUrl("/api/admin/stage"), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(stage),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return normalizeStage(d.stage);
}
