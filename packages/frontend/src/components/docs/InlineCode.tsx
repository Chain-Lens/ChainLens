export default function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="text-sm px-1.5 py-0.5 rounded"
      style={{ background: "var(--bg3)", color: "var(--cyan)", fontFamily: "var(--font-mono)" }}
    >
      {children}
    </code>
  );
}
