import FadeIn from "./FadeIn";
import { TerminalWindow, TLine, T, Cursor } from "./Terminal";
import sStyles from "./Section.module.css";
import styles from "./LandingHowItWorks.module.css";

const STEPS = [
  { num: "01", title: "Discover", desc: "Agent queries live listings ranked by price, quality, and recency." },
  { num: "02", title: "Inspect", desc: "Before spending, the agent reads schemas, examples, latency, and recent failures." },
  { num: "03", title: "Sign", desc: "Buyer signs a USDC ReceiveWithAuthorization for the chosen listing." },
  { num: "04", title: "Execute", desc: "Gateway calls the seller API and applies policy + schema checks." },
  { num: "05", title: "Settle", desc: "Success settles on ChainLensMarket. Failure drops the auth so no USDC moves." },
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
            in one wallet-native flow
          </h2>
          <p className={sStyles.sub}>
            ChainLens connects listing discovery, pre-call inspection, and
            Base settlement through a transparent x402 buyer flow.
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
                <T.cmt>{"// ✅ Wallet-native agent flow"}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>const</T.kw>
                {" "}<T.val>listings</T.val>{" "}
                <T.out>{"= await fetch("}</T.out>
                <T.str>&apos;https://chainlens.pelicanlab.dev/api/market/listings?q=weather&apos;</T.str>
                <T.out>{");"}</T.out>
              </TLine>
              <TLine>
                <T.cmt>{"// → [{ listingId: \"7\", metadata, stats, score }]"}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>const</T.kw>{" "}
                <T.val>detail</T.val>{" "}
                <T.out>{"= await fetch("}</T.out>
                <T.str>&apos;https://chainlens.pelicanlab.dev/api/market/listings/7&apos;</T.str>
                <T.out>{");"}</T.out>
              </TLine>
              <TLine>
                <T.cmt>{"// → inspect schemas, examples, and recent policy rejects"}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>await</T.kw>{" "}
                <T.cmd>fetch</T.cmd>
                <T.out>(</T.out>
                <T.str>&apos;https://chainlens.pelicanlab.dev/api/x402/7?city=seoul&apos;</T.str>
                <T.out>{", { headers: { "}</T.out>
                <T.key>&apos;X-Payment&apos;</T.key>
                <T.out>{": signedAuth } });"}</T.out>
              </TLine>
              <TLine>
                <T.cmt>{"// Gateway executes seller → settles only on success"}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.ok>✓ Seller response delivered · Settlement tx returned</T.ok>{" "}
                <Cursor />
              </TLine>
            </TerminalWindow>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
