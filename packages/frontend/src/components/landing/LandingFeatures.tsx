import FadeIn from "./FadeIn";
import sStyles from "./Section.module.css";
import styles from "./LandingFeatures.module.css";

const FEATURES = [
  {
    label: "01 · Agent-First",
    title: "No Human Required",
    desc: "An agent with an EVM wallet can discover, pay for, and use any verified API — fully autonomously. Zero account creation. Zero credit cards.",
  },
  {
    label: "02 · On-Chain",
    title: "Transparent Settlement",
    desc: "All payments live on-chain. Every pay(), complete(), and refund() is publicly verifiable on Base. No black-box billing.",
  },
  {
    label: "03 · Curated",
    title: "Verified APIs Only",
    desc: "We test every API before listing it. Response validation, uptime monitoring, and schema checks ensure agents never pay for a broken endpoint.",
  },
  {
    label: "04 · Real-Time",
    title: "~1s Payment → Execution",
    desc: "Built on Base's high-throughput EVM chain. Block finality is near-instant, so agents receive API responses in real-time after payment.",
  },
  {
    label: "05 · Protected",
    title: "Escrow-Based Safety",
    desc: "Funds are always held in escrow until execution succeeds. If an API fails, the agent is automatically refunded — no disputes, no support tickets.",
  },
  {
    label: "06 · Extensible",
    title: "Built for Scale",
    desc: "Roadmap includes reputation scoring, seller staking, usage-based billing, and multi-agent coordination. The foundation is live today.",
  },
];

const TAGS = [
  "Base EVM",
  "Solidity Escrow",
  "Node.js Gateway",
  "Event-Driven",
  "HTTP + Web3",
  "No KYC",
  "No Accounts",
];

export default function LandingFeatures() {
  return (
    <section className={sStyles.section} id="features">
      <div className={sStyles.inner}>
        <FadeIn>
          <div className={sStyles.tag}>{"// Why ChainLens"}</div>
          <h2 className={sStyles.title}>
            Built for the
            <br />
            agent-native future
          </h2>
          <p className={sStyles.sub}>
            Every design decision optimizes for autonomous agents as first-class
            economic actors.
          </p>
        </FadeIn>

        <div className={styles.grid}>
          {FEATURES.map((f, i) => (
            <FadeIn key={f.label} delay={i * 80}>
              <div className={styles.card}>
                <div className={styles.label}>{f.label}</div>
                <h3 className={styles.title}>{f.title}</h3>
                <p className={styles.desc}>{f.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={500}>
          <div className={styles.tags}>
            {TAGS.map((t) => (
              <span key={t} className={styles.tag}>
                {t}
              </span>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
