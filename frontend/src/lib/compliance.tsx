import type { ReactNode } from "react";
import type { ChatMsg } from "../components/Ide";
import { apiUrl } from "./api";

export type ComplianceResult = {
  rule: string;
  category: "security" | "privacy" | "data" | "branding" | string;
  severity: "error" | "warn";
  status: "pass" | "fail";
  detail: string;
};

export type ComplianceReview = { approved: boolean; results: ComplianceResult[] };

const CATEGORY_LABEL: Record<string, string> = {
  security: "Security",
  privacy: "Privacy / legal",
  data: "Data storage",
  branding: "Branding",
};

/** Run the shared deterministic compliance gate against the current build. */
export async function reviewCompliance(html: string): Promise<ComplianceReview> {
  const res = await fetch(apiUrl("/api/compliance/review"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html }),
  });
  if (!res.ok) throw new Error(`Compliance review failed (${res.status})`);
  return res.json();
}

/**
 * Shared "Submit for approval" handler used by every mode. Posts the build to the
 * compliance gate, narrates the verdict in chat, and returns whether it passed.
 *
 * `automatic` tweaks the wording for harness (where compliance is enforced up front).
 */
export async function submitForApproval(opts: {
  html: string;
  push: (m: Omit<ChatMsg, "id">) => string;
  update: (id: string, patch: Partial<ChatMsg>) => void;
  attempt: number; // the attempt number this submission represents (1-based)
  automatic?: boolean;
}): Promise<boolean> {
  const { html, push, update, attempt, automatic } = opts;
  const sid = push({ role: "system", kind: "start", text: `Compliance · review #${attempt} running`, streaming: true });
  let data: ComplianceReview;
  try {
    data = await reviewCompliance(html);
  } catch (e) {
    update(sid, { kind: "error", streaming: false, text: (e as Error).message || "Compliance gate unavailable — try again." });
    return false;
  }
  update(sid, {
    kind: data.approved ? "done" : "error",
    streaming: false,
    text: `Compliance review #${attempt} · ${data.approved ? "approved ✓" : "changes required"}`,
  });
  const fails = data.results.filter((r) => r.status === "fail" && r.severity === "error").length;
  push({
    role: "agent",
    author: "Compliance Officer",
    text: data.approved
      ? automatic
        ? "✅ Approved automatically — the harness enforces these compliance rules on every build, so it ships as-is."
        : `✅ Approved — this build passes the compliance track on attempt ${attempt}. It's cleared to ship.`
      : `❌ Not approved — ${fails} item(s) must be fixed before this can ship. Address them and submit again.`,
    node: complianceGateNode(data.results, data.approved),
  });
  return data.approved;
}

/** Fancy chat card rendering the compliance verdict: status badge, score bar, grouped rules. */
export function complianceGateNode(results: ComplianceResult[], approved: boolean): ReactNode {
  const order = ["security", "privacy", "data", "branding"];
  const cats = Array.from(new Set(results.map((r) => r.category))).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b)
  );
  const passed = results.filter((r) => r.status === "pass").length;
  const total = results.length;
  const mustFix = results.filter((r) => r.status === "fail" && r.severity === "error").length;
  const warns = results.filter((r) => r.status === "fail" && r.severity === "warn").length;
  const pct = total ? Math.round((passed / total) * 100) : 0;

  const sub = approved
    ? warns > 0
      ? `All required checks passed · ${warns} advisory note${warns > 1 ? "s" : ""}`
      : "All checks passed — cleared to ship"
    : `${mustFix} blocking issue${mustFix > 1 ? "s" : ""} must be fixed before this can ship`;

  return (
    <div className="comp-card">
      <div className={`comp-head ${approved ? "ok" : "bad"}`}>
        <span className={`comp-badge ${approved ? "ok" : "bad"}`}>{approved ? "✓" : "✕"}</span>
        <div style={{ minWidth: 0 }}>
          <div className="comp-title">{approved ? "Compliance approved" : "Changes required"}</div>
          <div className="comp-sub">{sub}</div>
        </div>
        <div className="comp-score">
          <span className="cs-num">{passed}/{total} passed</span>
          <span className="comp-bar"><i className={approved ? "ok" : "bad"} style={{ width: `${pct}%` }} /></span>
        </div>
      </div>
      <div className="comp-body">
        {cats.map((cat) => {
          const rows = results.filter((r) => r.category === cat);
          const ok = rows.filter((r) => r.status === "pass").length;
          return (
            <div className="comp-cat" key={cat}>
              <div className="comp-cat-h">
                <span>{CATEGORY_LABEL[cat] ?? cat}</span>
                <span className="ct-count">{ok}/{rows.length}</span>
                <span className="ct-rule" />
              </div>
              {rows.map((r, i) => {
                const kind = r.status === "pass" ? "pass" : r.severity === "error" ? "fail" : "warn";
                const tag = r.status === "pass" ? "pass" : r.severity === "error" ? "must fix" : "review";
                const glyph = kind === "pass" ? "✓" : kind === "fail" ? "✕" : "!";
                return (
                  <div className="comp-row" key={i}>
                    <span className={`comp-ico ${kind}`}>{glyph}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="comp-rule">{r.rule}</div>
                      <div className="comp-detail">{r.detail}</div>
                    </div>
                    <span className={`comp-tag ${kind}`}>{tag}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
