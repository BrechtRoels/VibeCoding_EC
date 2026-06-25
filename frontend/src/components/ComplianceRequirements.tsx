import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiUrl } from "../lib/api";

export type Rule = { rule: string; category: string; severity: "error" | "warn"; description: string };
export type Category = { key: string; label: string };

/** Load the canonical compliance rule set (shared by the wall brief and the spec modal). */
export function useComplianceRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    fetch(apiUrl("/api/compliance/rules"))
      .then((r) => r.json())
      .then((d) => {
        setRules(d.rules ?? []);
        setCategories(d.categories ?? []);
      })
      .catch(() => {});
  }, []);
  return { rules, categories };
}

/** The categories → rules grid (presentational). */
export function ComplianceGrid({ rules, categories }: { rules: Rule[]; categories: Category[] }) {
  return (
    <div className="comp-brief-grid">
      {categories.map((c) => {
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
  );
}

/** View-only modal listing the compliance requirements — opened from the Spec chat. */
export function ComplianceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { rules, categories } = useComplianceRules();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal comp-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <span className="mark">⚖</span>
          <div>
            <h2>Compliance requirements</h2>
            <p>Describe these in your spec to pass approval — they aren't added automatically.</p>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ComplianceGrid rules={rules} categories={categories} />
      </div>
    </div>,
    document.body
  );
}
