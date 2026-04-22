import FadeIn from "./FadeIn";
import { TerminalWindow, TLine, T, Cursor } from "./Terminal";
import sStyles from "./Section.module.css";
import styles from "./LandingHowItWorks.module.css";

const STEPS = [
  { num: "01", title: "Discover", desc: "Agent queries the curated marketplace and finds a verified API." },
  { num: "02", title: "Prepare", desc: "Gateway returns price + a unique request ID. No account needed." },
  { num: "03", title: "Pay On-Chain", desc: "Agent signs a tx. Funds lock in the escrow smart contract." },
  { num: "04", title: "Execute", desc: "Gateway detects the on-chain event and calls the seller API." },
  { num: "05", title: "Settle", desc: "Success → seller receives funds. Failure → agent is refunded." },
];

export default function LandingHowItWorks() {
  return (
    <section className={sStyles.section} id="how">
      <div className={sStyles.inner}>
        <FadeIn>
          <div className={sStyles.tag}>{"// How It Works"}</div>
          <h2 className={sStyles.title}>
            From request to result
            <br />
            in a single transaction
          </h2>
          <p className={sStyles.sub}>
            ChainLens connects on-chain payment with off-chain API execution
            through a transparent, escrow-based flow.
          </p>
        </FadeIn>

        <div className={styles.steps}>
          {STEPS.map((s, i) => (
            <FadeIn key={s.num} delay={i * 80}>
              <div className={styles.step}>
                <div className={styles.stepNum}>{s.num}</div>
                <div className={styles.stepTitle}>{s.title}</div>
                <div className={styles.stepDesc}>{s.desc}</div>
                {i < STEPS.length - 1 && (
                  <div className={styles.arrow}>→</div>
                )}
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={400}>
          <div style={{ marginTop: "3rem" }}>
            <TerminalWindow title="agent.js — With ChainLens">
              <TLine>
                <T.cmt>{"// ✅ Fully autonomous — no human required"}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>const</T.kw>
                {" "}<T.val>apis</T.val>{" "}
                <T.out>{"= await fetch("}</T.out>
                <T.str>&apos;https://chainlens.pelicanlab.dev/api/apis&apos;</T.str>
                <T.out>{");"}</T.out>
              </TLine>
              <TLine>
                <T.cmt>{"// → [{ id: \"weather-v2\", price: \"0.05 USDC\", verified: true }]"}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>const</T.kw>{" "}
                <T.val>req</T.val>{" "}
                <T.out>{"= await fetch("}</T.out>
                <T.str>&apos;/prepare&apos;</T.str>
                <T.out>{", { method: "}</T.out>
                <T.str>&apos;POST&apos;</T.str>
                <T.out>{", body: { apiId: "}</T.out>
                <T.str>&apos;weather-v2&apos;</T.str>
                <T.out>{" } });"}</T.out>
              </TLine>
              <TLine>
                <T.cmt>{"// → { requestId: \"0xab12...ef\", price: \"0.001\", contract: \"0x...\" }"}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>await</T.kw>{" "}
                <T.cmd>escrow</T.cmd>
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
                <T.out>{"  });  "}</T.out>
                <T.cmt>{"// on-chain tx"}</T.cmt>
              </TLine>
              <TLine>
                <T.cmt>{"// Base confirms in ~1s → Gateway triggers API automatically"}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.ok>✓ API response delivered · Seller paid · Agent continues</T.ok>{" "}
                <Cursor />
              </TLine>
            </TerminalWindow>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
