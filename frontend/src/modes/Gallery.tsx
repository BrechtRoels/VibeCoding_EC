import { useEffect, useMemo, useState } from "react";
import { Preview } from "../components/Preview";
import { CodeGlyph } from "../components/CodeGlyph";
import { RefreshIcon } from "../components/RefreshIcon";
import { fetchGallery, MODE_LABEL, type GalleryEntry } from "../lib/gallery";
import { fetchSession, resetSession, MODE_IDS, type ModeId, type SessionState } from "../lib/session";
import { useComplianceRules, ComplianceGrid } from "../components/ComplianceRequirements";

type Filter = "all" | "vibe" | "spec" | "harness";
const ORDER: GalleryEntry["mode"][] = ["vibe", "spec", "harness"];

/** Projected reference: the compliance requirements participants must write into their spec. */
const BRIEF_KEY = "twtb_wall_brief";

/** Seconds → m:ss (— when unknown). */
function fmtClock(sec: number | null | undefined): string {
  if (sec == null || sec < 0 || !isFinite(sec)) return "—";
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ComplianceBrief() {
  const { rules, categories } = useComplianceRules();
  const [open, setOpen] = useState(() => sessionStorage.getItem(BRIEF_KEY) !== "0");
  const toggle = () =>
    setOpen((o) => {
      const n = !o;
      sessionStorage.setItem(BRIEF_KEY, n ? "1" : "0");
      return n;
    });

  if (!rules.length) return null;
  return (
    <section className={`comp-brief ${open ? "open" : ""}`}>
      <button className="comp-brief-head" onClick={toggle}>
        <span className="cb-mark">⚖</span>
        <div className="cb-titles">
          <h2>Compliance requirements</h2>
          <p>Describe these in your spec — they aren't added automatically.</p>
        </div>
        <span className="cb-toggle">{open ? "▾ Hide" : "▸ Show"}</span>
      </button>
      {open && <ComplianceGrid rules={rules} categories={categories} />}
    </section>
  );
}

/** Live "race" clocks for every unlocked lab, synced to the server time. */
function RaceBar({ session }: { session: SessionState | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!session) return null;
  const offsetMs = session.serverNow * 1000 - session.fetchedAt;
  const active = MODE_IDS.filter((m) => session.stage[m] === "unlocked" && session.openedAt[m] != null);
  if (!active.length) return null;
  return (
    <div className="race-bar">
      {active.map((m) => {
        const elapsed = (Date.now() + offsetMs) / 1000 - (session.openedAt[m] as number);
        return (
          <div key={m} className={`race-chip m-${m}`}>
            <span className="race-dot" />
            <span className="race-label">{MODE_LABEL[m]}</span>
            <span className="race-time">{fmtClock(elapsed)}</span>
          </div>
        );
      })}
    </div>
  );
}

const MEDAL = ["🥇", "🥈", "🥉"];

/** Ranked board: lowest score wins (fast + few iterations). Respects the active filter. */
function Leaderboard({ entries, filter }: { entries: GalleryEntry[]; filter: Filter }) {
  const ranked = useMemo(
    () =>
      entries
        .filter((e) => typeof e.score === "number" && (filter === "all" || e.mode === filter))
        .sort((a, b) => (a.score as number) - (b.score as number))
        .slice(0, 10),
    [entries, filter]
  );
  if (!ranked.length) return null;
  return (
    <section className="leaderboard">
      <div className="lb-head">
        <h2>🏁 Leaderboard</h2>
        <span className="lb-sub">Fastest with the fewest iterations wins · score = time + 30s per extra iteration</span>
      </div>
      <div className="lb-rows">
        <div className="lb-row lb-cols">
          <span className="lb-rank">#</span>
          <span className="lb-who">Builder</span>
          <span className="lb-mode">Lab</span>
          <span className="lb-num">Time</span>
          <span className="lb-num">Iters</span>
          <span className="lb-num">Score</span>
        </div>
        {ranked.map((e, i) => (
          <div key={e.id} className={`lb-row ${i < 3 ? "lb-top" : ""}`}>
            <span className="lb-rank">{MEDAL[i] ?? i + 1}</span>
            <span className="lb-who" title={e.author}>{e.author}</span>
            <span className="lb-mode"><span className={`mode-badge m-${e.mode}`}>{MODE_LABEL[e.mode]}</span></span>
            <span className="lb-num">{fmtClock(e.elapsed_sec)}</span>
            <span className="lb-num">{e.iterations ?? "—"}</span>
            <span className="lb-num lb-score">{fmtClock(e.score)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function WallTile({ e }: { e: GalleryEntry }) {
  const [showReq, setShowReq] = useState(false);
  const hasMetrics = typeof e.score === "number";
  return (
    <div className="wall-tile">
      <div className="wall-frame">
        <Preview html={e.html} title={`${MODE_LABEL[e.mode]} · ${e.title}`} />
      </div>
      <div className="wall-meta">
        <span className={`mode-badge m-${e.mode}`}>{MODE_LABEL[e.mode]}</span>
        <span className="wall-tt" title={e.title}>{e.title}</span>
        <span className="wall-by">{e.author}</span>
      </div>
      {hasMetrics && (
        <div className="wall-stats">
          <span title="Time from lab open to submit">⏱ {fmtClock(e.elapsed_sec)}</span>
          <span title="Build rounds taken">↻ {e.iterations ?? "—"} iter</span>
          <span className="wall-stat-score" title="Combined score (lower is better)">★ {fmtClock(e.score)}</span>
        </div>
      )}
      {!!e.requirements && (
        <div className="wall-req">
          <button className="wall-req-toggle" onClick={() => setShowReq((s) => !s)}>
            {showReq ? "▾ Hide requirements" : "▸ Show requirements"}
          </button>
          {showReq && <div className="wall-req-body">{e.requirements}</div>}
        </div>
      )}
    </div>
  );
}

export function Gallery({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    let on = true;
    const load = () => {
      fetchGallery().then((e) => on && (setEntries(e), setLoaded(true))).catch(() => {});
      fetchSession().then((s) => on && setSession(s)).catch(() => {});
    };
    load();
    const t = setInterval(load, 4000); // live wall: poll for new submissions + race state
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length, vibe: 0, spec: 0, harness: 0 };
    for (const e of entries) c[e.mode] = (c[e.mode] ?? 0) + 1;
    return c;
  }, [entries]);

  const groups = filter === "all" ? ORDER : [filter];

  async function onFreshSession() {
    if (
      window.confirm(
        "Start a fresh session?\n\nThis clears the wall, re-locks every lab, AND logs out & resets every participant (their work is cleared)."
      )
    ) {
      await resetSession();
      setEntries([]);
      try {
        setSession(await fetchSession());
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="wall">
      <div className="wall-head">
        <div className="wall-title">
          <span className="mark"><CodeGlyph size={19} /></span>
          <div>
            <h1>Gallery Wall</h1>
            <p>Same prompts, three philosophies — fastest with the fewest iterations tops the board.</p>
          </div>
        </div>
        <div className="wall-filters">
          {(["all", "vibe", "spec", "harness"] as Filter[]).map((f) => (
            <button key={f} className={`wall-chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : MODE_LABEL[f as ModeId]} <span className="ct">{counts[f] ?? 0}</span>
            </button>
          ))}
          <button className="btn-secondary btn-ico" onClick={onFreshSession} title="Clear the wall and reset all participants">
            <RefreshIcon size={13} /> Fresh session
          </button>
          <button className="btn-secondary" onClick={onClose}>← Back to studio</button>
        </div>
      </div>

      <RaceBar session={session} />

      <div className="wall-body">
        <Leaderboard entries={entries} filter={filter} />
        <ComplianceBrief />
        {loaded && entries.length === 0 && (
          <div className="wall-empty">
            No apps yet. As participants hit <strong>↗ Share to wall</strong>, their apps appear here live.
          </div>
        )}
        {groups.map((mode) => {
          const items = entries.filter((e) => e.mode === mode);
          if (!items.length) return null;
          return (
            <section key={mode} className="wall-section">
              <h2 className={`wall-section-title m-${mode}`}>
                {MODE_LABEL[mode]} <span>{items.length}</span>
              </h2>
              <div className="wall-grid">
                {items.map((e) => (
                  <WallTile e={e} key={e.id} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
