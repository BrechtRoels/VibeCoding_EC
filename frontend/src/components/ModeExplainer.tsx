type Props = {
  num: number;
  title: string;
  blurb: string;
  tags: { label: string; accent?: boolean }[];
};

export function ModeExplainer({ num, title, blurb, tags }: Props) {
  return (
    <div className="explainer">
      <h2>
        <span className="num-badge">{num}</span>
        {title}
      </h2>
      <p>{blurb}</p>
      <div className="tags">
        {tags.map((t) => (
          <span key={t.label} className={`pill ${t.accent ? "accent" : ""}`}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
