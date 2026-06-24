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
    node: complianceGateNode(data.results),
  });
  return data.approved;
}

/** Chat node rendering compliance results grouped by category (reuses .cm-issue/.sev). */
export function complianceGateNode(results: ComplianceResult[]): ReactNode {
  const order = ["security", "privacy", "data", "branding"];
  const cats = Array.from(new Set(results.map((r) => r.category))).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b)
  );
  return (
    <div>
      {cats.map((cat) => (
        <div key={cat} style={{ marginBottom: 6 }}>
          <div className="id" style={{ textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.7, margin: "4px 0 2px" }}>
            {CATEGORY_LABEL[cat] ?? cat}
          </div>
          {results
            .filter((r) => r.category === cat)
            .map((r, i) => (
              <div className="cm-issue" key={i}>
                <span className={`sev ${r.status === "pass" ? "pass" : r.severity === "error" ? "high" : "medium"}`}>
                  {r.status === "pass" ? "pass" : r.severity === "error" ? "must fix" : "review"}
                </span>
                <div style={{ flex: 1 }}>
                  <div className="it" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5 }}>{r.rule}</div>
                  <div className="id">{r.detail}</div>
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
