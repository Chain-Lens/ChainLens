import FadeIn from "./FadeIn";
import { TerminalWindow, TLine, T, Cursor } from "./Terminal";
import sStyles from "./Section.module.css";
import styles from "./LandingProblem.module.css";

const CARDS = [
  {
    icon: "🔐",
    title: "Centralized API Access",
    desc: "Every API requires an account, API keys, and human-managed credits. An autonomous agent cannot create an account or hold a credit card.",
  },
  {
    icon: "💸",
    title: "No Agent-Native Payments",
    desc: "Existing payment rails require human identity. Agents have wallets — but there's nowhere to spend them on APIs.",
  },
  {
    icon: "🎲",
    title: "Unverified API Quality",
    desc: "Open API marketplaces have no trust layer. Agents risk paying for endpoints that are down, slow, or outright fake.",
  },
];

export default function LandingProblem() {
  return (
    <section className={sStyles.section} id="problem">
      <div className={sStyles.inner}>
        <FadeIn>
          <div className={sStyles.tag}>{"// The Problem"}</div>
          <h2 className={sStyles.title}>
            Agents can act.
            <br />
            But they can&apos;t <span style={{ color: "var(--red)" }}>pay</span>.
          </h2>
          <p className={sStyles.sub}>
            The rise of autonomous AI agents exposes a fundamental gap in today&apos;s API economy.
            Agents are powerful — but economically paralyzed.
          </p>
        </FadeIn>

        <div className={styles.cards}>
          {CARDS.map((c, i) => (
            <FadeIn key={c.title} delay={i * 100}>
              <div className={styles.card}>
                <div className={styles.icon}>{c.icon}</div>
                <h3 className={styles.cardTitle}>{c.title}</h3>
                <p className={styles.cardDesc}>{c.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={300}>
          <div style={{ marginTop: "2.5rem" }}>
            <TerminalWindow title="agent.py — Current Reality">
              <TLine>
                <T.cmt>{"# ❌ What happens when an agent tries to use an API today"}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.prompt>agent</T.prompt>
                <T.out>@autonomous:~$ </T.out>
                <T.cmd>{"curl -X POST https://api.example.com/analyze \\"}</T.cmd>
              </TLine>
              <TLine indent={1}>
                <T.cmd>
                  {"-H "}
                  <T.str>&quot;Authorization: Bearer ???&quot;</T.str>
                </T.cmd>
              </TLine>
              <TLine />
              <TLine>
                <T.err>{'{"error": "401 Unauthorized — Please sign up at example.com"}'}</T.err>
              </TLine>
              <TLine />
              <TLine>
                <T.cmt>{"# Agent has 10 ETH in its wallet. The API wants a credit card."}</T.cmt>
              </TLine>
              <TLine>
                <T.cmt>{"# Agent is stuck. Economy is locked. Opportunity is lost."}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.prompt>agent</T.prompt>
                <T.out>@autonomous:~$ </T.out>
                <T.err>Task failed. Human intervention required.</T.err> <Cursor />
              </TLine>
            </TerminalWindow>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
