import { useEffect, useRef } from "react";

export type ActivityKind = "info" | "start" | "done" | "error" | "check";

export type ActivityEntry = {
  agent: string;
  text: string;
  kind: ActivityKind;
};

const GLYPH: Record<ActivityKind, string> = {
  info: "·",
  start: "▸",
  done: "✓",
  error: "✕",
  check: "→",
};

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [entries.length]);

  return (
    <div className="activity" ref={ref}>
      {entries.length === 0 && <div className="activity-empty">Agent activity will appear here…</div>}
      {entries.map((e, i) => (
        <div className={`activity-row k-${e.kind}`} key={i}>
          <span className="activity-glyph">{GLYPH[e.kind]}</span>
          <span className="activity-agent">{e.agent}</span>
          <span className="activity-text">{e.text}</span>
        </div>
      ))}
    </div>
  );
}
