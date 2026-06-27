import { useCallback, useRef, useState } from "react";
import { apiUrl, authHeaders } from "./api";

type StreamState = {
  text: string;
  streaming: boolean;
  error: string | null;
  elapsedMs: number;
};

/**
 * POSTs JSON to an SSE endpoint and accumulates `data: {delta}` frames.
 * Returns live text plus streaming/error/elapsed state, and a `run` trigger.
 */
export function useStream() {
  const [state, setState] = useState<StreamState>({
    text: "",
    streaming: false,
    error: null,
    elapsedMs: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, streaming: false }));
  }, []);

  const run = useCallback(
    async (url: string, body: unknown, onDone?: (full: string) => void) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const started = performance.now();
      setState({ text: "", streaming: true, error: null, elapsedMs: 0 });

      const tick = setInterval(() => {
        setState((s) => (s.streaming ? { ...s, elapsedMs: performance.now() - started } : s));
      }, 100);

      let full = "";
      try {
        const res = await fetch(apiUrl(url), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            if (frame.startsWith("event: error")) {
              const line = frame.split("\n").find((l) => l.startsWith("data: "));
              const msg = line ? JSON.parse(line.slice(6)).message : "stream error";
              throw new Error(msg);
            }
            if (frame.startsWith("event: done")) continue;
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              const delta = JSON.parse(line.slice(6)).delta as string;
              if (delta) {
                full += delta;
                setState((s) => ({ ...s, text: full }));
              }
            } catch {
              /* ignore malformed frame */
            }
          }
        }
        setState((s) => ({ ...s, streaming: false, elapsedMs: performance.now() - started }));
        onDone?.(full);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setState((s) => ({
          ...s,
          streaming: false,
          error: (e as Error).message,
          elapsedMs: performance.now() - started,
        }));
        throw e; // let callers surface the message (e.g. rate-limit notice) in the UI
      } finally {
        clearInterval(tick);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({ text: "", streaming: false, error: null, elapsedMs: 0 });
  }, []);

  return { ...state, run, stop, reset };
}

/** Strip accidental markdown code fences from generated HTML. */
export function cleanHtml(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  return s;
}
