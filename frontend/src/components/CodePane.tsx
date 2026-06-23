type Props = {
  code: string;
  streaming: boolean;
  placeholder?: string;
};

export function CodePane({ code, streaming, placeholder }: Props) {
  return (
    <pre className="code">
      {code || (!streaming && <span style={{ color: "var(--c-fg3)" }}>{placeholder}</span>)}
      {streaming && <span className="cursor" />}
    </pre>
  );
}
