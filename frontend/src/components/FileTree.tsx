export type FileEntry = {
  name: string;
  status: "pending" | "writing" | "ready";
  kind: "md" | "html";
};

const EXT_ICON: Record<FileEntry["kind"], string> = { md: "📄", html: "🌐" };

export function FileTree({
  files,
  activeName,
  onSelect,
  title = "spec/",
}: {
  files: FileEntry[];
  activeName?: string;
  onSelect?: (name: string) => void;
  title?: string;
}) {
  return (
    <div className="filetree">
      <div className="filetree-head">{title}</div>
      {files.map((f) => (
        <button
          key={f.name}
          className={`file-row ${activeName === f.name ? "active" : ""} st-${f.status}`}
          onClick={() => onSelect?.(f.name)}
          disabled={f.status === "pending"}
        >
          <span className="file-ico">{EXT_ICON[f.kind]}</span>
          <span className="file-name">{f.name}</span>
          {f.status === "writing" && <span className="spinner sm" />}
          {f.status === "ready" && <span className="file-dot" />}
        </button>
      ))}
    </div>
  );
}
