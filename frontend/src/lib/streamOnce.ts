import { apiUrl, authHeaders } from "./api";

/** One-shot SSE consumer for parallel jobs (e.g. Compare variants). */
export async function streamOnce(
  url: string,
  body: unknown,
  onDelta?: (full: string) => void
): Promise<string> {
  const res = await fetch(apiUrl(url), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      if (frame.startsWith("event: error")) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        throw new Error(line ? JSON.parse(line.slice(6)).message : "stream error");
      }
      if (frame.startsWith("event: done")) continue;
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const delta = JSON.parse(line.slice(6)).delta as string;
        if (delta) {
          full += delta;
          onDelta?.(full);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return full;
}
