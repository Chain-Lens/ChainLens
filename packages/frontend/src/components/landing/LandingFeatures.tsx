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
    desc: "Successful calls settle on-chain through ChainLensMarket. Buyers get a tx hash, sellers get claimable balances, and the flow is auditable on Base.",
  },
  {
    label: "03 · Curated",
    title: "Reviewed by ChainLens",
    desc: "Every listing is screened by the ChainLens team — null-response checks, schema match, and a first-pass prompt-injection filter — before it ever reaches buyers.",
  },
  {
    label: "04 · Real-Time",
    title: "Fast Buyer Loop",
    desc: "Discover, inspect, and settle in seconds. The gateway runs the seller call immediately and only finalizes payment after a clean response.",
  },
  {
    label: "05 · Protected",
    title: "Failure-Safe Payments",
    desc: "If the seller fails or policy checks reject the response, the v3 gateway drops the signed authorization and no USDC moves.",
  },
  {
    label: "06 · Extensible",
    title: "Built for Scale",
    desc: "The stack already supports browser buyers, MCP agents, and direct x402 clients. Mainnet hardening and broader listing supply come next.",
  },
  {
    label: "07 · Aligned",
    title: "Free to List · 5% on Settlement",
    desc: "Sellers register for free. ChainLens only earns when a call settles successfully — a flat 5% USDC fee on each settled payment, taken from the buyer's authorization.",
  },
];

const TAGS = [
  "Base EVM",
  "ChainLensMarket",
  "Node.js Gateway",
  "x402",
  "HTTP + MCP",
  "No KYC",
  "Pre-Call Inspect",
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
            Every design decision optimizes for autonomous agents as first-class economic actors.
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
