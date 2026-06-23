export type TaskItem = { id: string; refs: string; text: string; done: boolean };

/** Parse `- [ ] T1 (R1, R2): description` lines from tasks.md. */
export function parseTasks(md: string): TaskItem[] {
  const out: TaskItem[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\s*-\s*\[[ xX]?\]\s*(T\d+)\s*(?:\(([^)]*)\))?\s*:?\s*(.*)$/);
    if (m) out.push({ id: m[1], refs: m[2] ?? "", text: m[3].trim(), done: false });
  }
  return out;
}

export function TaskChecklist({ tasks, doneCount }: { tasks: TaskItem[]; doneCount: number }) {
  return (
    <div className="tasklist">
      {tasks.map((t, i) => {
        const done = i < doneCount;
        return (
          <div className={`task-row ${done ? "done" : ""}`} key={t.id}>
            <span className={`task-check ${done ? "done" : ""}`}>{done ? "✓" : ""}</span>
            <span className="task-id">{t.id}</span>
            {t.refs && <span className="task-refs">{t.refs}</span>}
            <span className="task-text">{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
