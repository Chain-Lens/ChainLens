import FadeIn from "./FadeIn";
import sStyles from "./Section.module.css";
import styles from "./LandingToken.module.css";

const STATS = [
  { num: "Solana", label: "Issuance Chain" },
  { num: "Live", label: "Public DEX Trading" },
  { num: "EASYA", label: "Grant-Funded Genesis" },
];

const UTILITY = [
  {
    label: "Phase 3 · Listing Fee",
    title: "Pay to Register",
    desc: "New sellers pay a $LENS listing fee. 50% is burned, 50% routes to the ecosystem treasury — listing supply self-rate-limits as the network grows.",
  },
  {
    label: "Phase 3 · Visibility Boost",
    title: "Stake to Surface",
    desc: "Quality score sets the baseline ranking. Sellers can stake additional $LENS to boost visibility — but listings below the quality threshold are excluded entirely.",
  },
  {
    label: "Phase 3 · Governance",
    title: "Holders Decide",
    desc: "Verification rules, dispute outcomes, and key parameters move on-chain. $LENS holders vote — ChainLens-team final-call sunsets over time.",
  },
];

export default function LandingToken() {
  return (
    <section className={sStyles.section} id="token">
      <div className={sStyles.inner}>
        <FadeIn>
          <div className={sStyles.tag}>{"// $LENS Token"}</div>
          <h2 className={sStyles.title}>
            The token behind
            <br />
            the marketplace.
          </h2>
          <p className={sStyles.sub}>
            $LENS launched on Solana under the EASYA grant program — issuance, allocation, and DEX
            listing already complete. Utility activates as ChainLens moves from hackathon MVP to a
            multi-chain agent economy.
          </p>
        </FadeIn>

        <FadeIn delay={150}>
          <div className={styles.stats}>
            {STATS.map((s) => (
              <div key={s.label} className={styles.stat}>
                <div className={styles.statNum}>{s.num}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>
        </FadeIn>

        <div className={styles.grid}>
          {UTILITY.map((u, i) => (
            <FadeIn key={u.title} delay={i * 100}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>{u.label}</div>
                <h3 className={styles.cardTitle}>{u.title}</h3>
                <p className={styles.cardDesc}>{u.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={350}>
          <p className={styles.note}>
            Phase 0 (token genesis) is complete. Utility wiring above ships in Phase 3 — see the
            roadmap below.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
