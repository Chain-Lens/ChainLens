export function TerminalWindow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden my-6" style={{ border: "1px solid var(--border2)" }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: "var(--bg3)" }}>
        <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
        <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
        <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
        <span className="ml-3 text-xs font-mono" style={{ color: "var(--text2)" }}>
          {title}
        </span>
      </div>
      <div
        className="px-6 py-5 text-sm leading-relaxed overflow-x-auto"
        style={{ background: "var(--bg)", fontFamily: "var(--font-mono)", color: "var(--text)" }}
      >
        {children}
      </div>
    </div>
  );
}

const COLOR_MAP: Record<string, string> = {
  white: "var(--text)",
  green: "var(--green)",
  blue: "var(--cyan)",
  yellow: "#e3b341",
  purple: "var(--purple)",
  gray: "var(--text3)",
};

export function Line({
  prompt = true,
  children,
  color = "white",
}: {
  prompt?: boolean;
  children: React.ReactNode;
  color?: "white" | "green" | "blue" | "yellow" | "purple" | "gray";
}) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      {prompt && (
        <span style={{ color: "var(--green)" }} className="select-none">
          $
        </span>
      )}
      <span style={{ color: COLOR_MAP[color] }}>{children}</span>
    </div>
  );
}
