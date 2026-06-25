import { useEffect, useMemo, useState } from "react";
import { Preview } from "../components/Preview";
import { CodeGlyph } from "../components/CodeGlyph";
import { RefreshIcon } from "../components/RefreshIcon";
import { fetchGallery, MODE_LABEL, type GalleryEntry } from "../lib/gallery";
import { resetSession } from "../lib/session";
import { apiUrl } from "../lib/api";

type Filter = "all" | "vibe" | "spec" | "harness";
const ORDER: GalleryEntry["mode"][] = ["vibe", "spec", "harness"];

type Rule = { rule: string; category: string; severity: "error" | "warn"; description: string };
type Category = { key: string; label: string };

/** Projected reference: the compliance requirements participants must write into their spec. */
const BRIEF_KEY = "twtb_wall_brief";

function ComplianceBrief() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [open, setOpen] = useState(() => sessionStorage.getItem(BRIEF_KEY) !== "0");
  const toggle = () =>
    setOpen((o) => {
      const n = !o;
      sessionStorage.setItem(BRIEF_KEY, n ? "1" : "0");
      return n;
    });

  useEffect(() => {
    fetch(apiUrl("/api/compliance/rules"))
      .then((r) => r.json())
      .then((d) => {
        setRules(d.rules ?? []);
        setCats(d.categories ?? []);
      })
      .catch(() => {});
  }, []);

  if (!rules.length) return null;
  return (
    <section className={`comp-brief ${open ? "open" : ""}`}>
      <button className="comp-brief-head" onClick={toggle}>
        <span className="cb-mark">⚖</span>
        <div className="cb-titles">
          <h2>Compliance requirements</h2>
          <p>Spec-Driven won't add these for you — read them here and describe them in your spec, or approval fails.</p>
        </div>
        <span className="cb-toggle">{open ? "▾ Hide" : "▸ Show"}</span>
      </button>
      {open && (
        <div className="comp-brief-grid">
          {cats.map((c) => {
            const rs = rules.filter((r) => r.category === c.key);
            if (!rs.length) return null;
            return (
              <div className="comp-brief-cat" key={c.key}>
                <h3>{c.label}</h3>
                {rs.map((r) => (
                  <div className="comp-brief-rule" key={r.rule}>
                    <span className={`comp-tag ${r.severity === "error" ? "fail" : "warn"}`}>
                      {r.severity === "error" ? "must" : "should"}
                    </span>
                    <span className="cbr-text">{r.description}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function WallTile({ e }: { e: GalleryEntry }) {
  const [showReq, setShowReq] = useState(false);
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

  useEffect(() => {
    let on = true;
    const load = () => fetchGallery().then((e) => on && (setEntries(e), setLoaded(true))).catch(() => {});
    load();
    const t = setInterval(load, 4000); // live wall: poll for new submissions
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
        "Start a fresh session?\n\nThis clears the wall AND logs out & resets every participant (their work is cleared)."
      )
    ) {
      await resetSession();
      setEntries([]);
    }
  }

  return (
    <div className="wall">
      <div className="wall-head">
        <div className="wall-title">
          <span className="mark"><CodeGlyph size={19} /></span>
          <div>
            <h1>Gallery Wall</h1>
            <p>Same prompts, three philosophies — watch the look diverge in Vibecoding and converge in Harness.</p>
          </div>
        </div>
        <div className="wall-filters">
          {(["all", "vibe", "spec", "harness"] as Filter[]).map((f) => (
            <button key={f} className={`wall-chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : MODE_LABEL[f]} <span className="ct">{counts[f] ?? 0}</span>
            </button>
          ))}
          <button className="btn-secondary btn-ico" onClick={onFreshSession} title="Clear the wall and reset all participants">
            <RefreshIcon size={13} /> Fresh session
          </button>
          <button className="btn-secondary" onClick={onClose}>← Back to studio</button>
        </div>
      </div>

      <div className="wall-body">
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
