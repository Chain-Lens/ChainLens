import FadeIn from "./FadeIn";
import styles from "./LandingWaitlist.module.css";

export default function LandingWaitlist() {
  return (
    <section className={styles.section} id="waitlist">
      <div className={styles.glow} />
      <div className={styles.inner}>
        <FadeIn>
          <div className={styles.tag}>{"// Mainnet Access"}</div>
          <h2 className={styles.title}>
            Get early access
            <br />
            when we launch
          </h2>
          <p className={styles.sub}>
            ChainLens mainnet is coming soon. Join the waitlist to be first in
            line — whether you&apos;re building agents, offering APIs, or
            watching the agent economy grow.
          </p>

          <a
            href="https://forms.gle/EtCpnWtRcMeM7UtC7"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btn}
          >
            📋 Apply for Mainnet Access
          </a>

          <p className={styles.note}>
            Takes ~1 minute · No spam · Cancel anytime
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
