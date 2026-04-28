import styles from "./Terminal.module.css";

export function TerminalWindow({
  title = "bash",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <span className={`${styles.btn} ${styles.red}`} />
        <span className={`${styles.btn} ${styles.yellow}`} />
        <span className={`${styles.btn} ${styles.green}`} />
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}

export function TLine({ children, indent = 0 }: { children?: React.ReactNode; indent?: number }) {
  return (
    <div className={styles.line} style={{ paddingLeft: indent * 16 }}>
      {children}
    </div>
  );
}

export const T = {
  prompt: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.prompt}>{children}</span>
  ),
  cmd: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.cmd}>{children}</span>
  ),
  out: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.out}>{children}</span>
  ),
  key: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.key}>{children}</span>
  ),
  val: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.val}>{children}</span>
  ),
  str: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.str}>{children}</span>
  ),
  num: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.num}>{children}</span>
  ),
  ok: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.ok}>{children}</span>
  ),
  err: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.err}>{children}</span>
  ),
  cmt: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.cmt}>{children}</span>
  ),
  cyan: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.cyan}>{children}</span>
  ),
  kw: ({ children }: { children: React.ReactNode }) => (
    <span className={styles.kw}>{children}</span>
  ),
};

export function Cursor() {
  return <span className={styles.cursor} />;
}
