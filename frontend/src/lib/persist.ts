import type { ChatMsg } from "../components/Ide";

/** Load a JSON snapshot from localStorage (null if absent/corrupt). */
export function loadSnap<T = Record<string, unknown>>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const _timers: Record<string, ReturnType<typeof setTimeout>> = {};

/**
 * Persist a JSON snapshot (best-effort). Debounced per key so rapid updates
 * during streaming coalesce into a single write instead of serializing per token.
 */
export function saveSnap(key: string, value: unknown): void {
  clearTimeout(_timers[key]);
  _timers[key] = setTimeout(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or circular — skip */
    }
  }, 400);
}

/**
 * Chat messages carry non-serializable React nodes (issue lists, variant grids)
 * and transient streaming flags. Strip both before persisting so a reload restores
 * the readable transcript without the interactive bits or stuck spinners.
 */
export function sanitizeMessages(messages: ChatMsg[]): ChatMsg[] {
  return messages.map(({ node, streaming, ...rest }) => {
    void node;
    void streaming;
    return rest;
  });
}
