export type AgentStatus = "idle" | "queued" | "running" | "done" | "error";

export type AgentInfo = {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
};

const ICON: Record<AgentStatus, string> = {
  idle: "○",
  queued: "◔",
  running: "",
  done: "✓",
  error: "✕",
};

export function AgentList({
  agents,
  activeId,
  onSelect,
}: {
  agents: AgentInfo[];
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="agent-list">
      {agents.map((a) => (
        <button
          key={a.id}
          className={`agent-card s-${a.status} ${activeId === a.id ? "active" : ""}`}
          onClick={() => onSelect?.(a.id)}
        >
          <span className={`agent-status s-${a.status}`}>
            {a.status === "running" ? <span className="spinner" /> : ICON[a.status]}
          </span>
          <span className="agent-meta">
            <span className="agent-name">{a.name}</span>
            <span className="agent-role">{a.role}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
