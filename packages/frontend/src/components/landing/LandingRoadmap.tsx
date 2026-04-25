import FadeIn from "./FadeIn";
import sStyles from "./Section.module.css";
import styles from "./LandingRoadmap.module.css";

type PhaseStatus = "done" | "active" | "next";

const PHASES: {
  num: string;
  title: string;
  status: PhaseStatus;
  bullets: string[];
}[] = [
  {
    num: "Phase 0",
    title: "Token Genesis",
    status: "done",
    bullets: [
      "$LENS issued on Solana under the EASYA grant",
      "Allocation published; team & treasury disclosed",
      "Public DEX listing live",
    ],
  },
  {
    num: "Phase 1",
    title: "Hackathon MVP",
    status: "active",
    bullets: [
      "x402 settlement on Base Sepolia",
      "Manual ChainLens review · null + schema + injection screening",
      "Rule-based discovery (no quality score yet)",
      "Free to list · 5% USDC fee on settlement",
    ],
  },
  {
    num: "Phase 2",
    title: "Mainnet + Quality Layer",
    status: "next",
    bullets: [
      "Base mainnet deployment",
      "Continuous seller scoring — uptime, schema match, pass rate",
      "Quality-based ranking and adaptive routing",
      "Earned Verified badge (free, never bought)",
    ],
  },
  {
    num: "Phase 3",
    title: "$LENS Utility",
    status: "next",
    bullets: [
      "Listing fee in $LENS (50% burn / 50% treasury)",
      "Visibility boost staking — quality floor still required",
      "Governance: dispute votes, verification rules, parameters",
      "Multi-chain bridge: Base ↔ Solana",
    ],
  },
  {
    num: "Phase 4",
    title: "Agent-Native Discovery",
    status: "next",
    bullets: [
      "Natural-language API search (semantic retrieval + routing)",
      "Multi-API task bundles for agents",
      "LangChain · CrewAI · Eliza integrations",
      "Decentralized dispute resolution by stakers",
    ],
  },
];

const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: "Complete",
  active: "Now",
  next: "Planned",
};

export default function LandingRoadmap() {
  return (
    <section className={sStyles.section} id="roadmap">
      <div className={sStyles.inner}>
        <FadeIn>
          <div className={sStyles.tag}>{"// Roadmap"}</div>
          <h2 className={sStyles.title}>
            From hackathon MVP
            <br />
            to a full agent economy.
          </h2>
          <p className={sStyles.sub}>
            ChainLens ships in stages — start with a working settlement loop,
            layer in quality data, then activate $LENS utility and decentralize
            governance. Locked through Consensus Miami.
          </p>
        </FadeIn>

        <div className={styles.timeline}>
          {PHASES.map((p, i) => (
            <FadeIn key={p.num} delay={i * 80}>
              <div className={`${styles.phase} ${styles[p.status]}`}>
                <div className={styles.phaseHead}>
                  <span className={styles.phaseNum}>{p.num}</span>
                  <span className={styles.phaseStatus}>
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>
                <h3 className={styles.phaseTitle}>{p.title}</h3>
                <ul className={styles.bullets}>
                  {p.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
