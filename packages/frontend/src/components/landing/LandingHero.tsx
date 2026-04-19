import Image from "next/image";
import { TerminalWindow, TLine, T, Cursor } from "./Terminal";
import styles from "./LandingHero.module.css";

const STATS = [
  { num: "~1s", label: "Payment → Execution" },
  { num: "0", label: "Trusted Intermediaries" },
  { num: "100%", label: "Curated APIs" },
  { num: "EVM", label: "Compatible (Base)" },
];

export default function LandingHero() {
  return (
    <section className={styles.hero}>
      <div className={styles.glow} />

      <Image src="/chainlens_coin_256.png" alt="ChainLens" width={64} height={64} style={{ marginBottom: "1rem" }} />

      <div className={styles.badge}>
        <span className={styles.dot} />
        Live on Base Sepolia
      </div>

      <h1 className={styles.h1}>
        The Payment Layer
        <br />
        for the <span className={styles.hl}>Agent Economy</span>
      </h1>

      <p className={styles.sub}>
        Autonomous AI agents can now{" "}
        <strong>discover, pay for, and execute</strong> verified APIs — all
        on-chain, in real-time. No accounts. No credit cards. No trust
        assumptions.
      </p>

      <div className={styles.actions}>
        <a
          href="/marketplace"
          className={styles.btnPrimary}
        >
          Try Testnet
        </a>
        <a
          href="https://forms.gle/EtCpnWtRcMeM7UtC7"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.btnSecondary}
        >
          Join Mainnet Waitlist
        </a>
      </div>

      <div className={styles.termWrap}>
        <TerminalWindow title="agent.js — ChainLens quickstart">
          <TLine>
            <T.cmt>{"// Autonomous agent pays for an API — no human needed"}</T.cmt>
          </TLine>
          <TLine />
          <TLine>
            <T.kw>const</T.kw>{" "}
            <T.val>apis</T.val>{" "}
            <T.out>= await</T.out>{" "}
            <T.cmd>chainLens</T.cmd>
            <T.out>.</T.out>
            <T.ok>discover</T.ok>
            <T.out>();</T.out>
          </TLine>
          <TLine>
            <T.cmt>{"// → [{ id: \"weather-v2\", price: \"1.00 USDC\", verified: true }]"}</T.cmt>
          </TLine>
          <TLine />
          <TLine>
            <T.kw>const</T.kw>{" "}
            <T.val>req</T.val>{" "}
            <T.out>= await</T.out>{" "}
            <T.cmd>chainLens</T.cmd>
            <T.out>.</T.out>
            <T.ok>prepare</T.ok>
            <T.out>(</T.out>
            <T.str>&quot;weather-v2&quot;</T.str>
            <T.out>);</T.out>
          </TLine>
          <TLine>
            <T.kw>const</T.kw>{" "}
            <T.val>tx</T.val>{" "}
            <T.out>= await</T.out>{" "}
            <T.cmd>wallet</T.cmd>
            <T.out>.</T.out>
            <T.ok>pay</T.ok>
            <T.out>(</T.out>
            <T.val>req</T.val>
            <T.out>.</T.out>
            <T.key>requestId</T.key>
            <T.out>{", { value: "}</T.out>
            <T.val>req</T.val>
            <T.out>.</T.out>
            <T.key>price</T.key>
            <T.out>{" });"}</T.out>
          </TLine>
          <TLine />
          <TLine>
            <T.cmt>{"// tx confirms in ~1s on Base → Gateway executes API"}</T.cmt>
          </TLine>
          <TLine>
            <T.ok>✓ Response received · Seller paid · Escrow cleared</T.ok>{" "}
            <Cursor />
          </TLine>
        </TerminalWindow>
      </div>

      <div className={styles.stats}>
        {STATS.map((s) => (
          <div key={s.label} className={styles.stat}>
            <div className={styles.statNum}>{s.num}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
