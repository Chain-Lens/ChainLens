import FadeIn from "./FadeIn";
import { TerminalWindow, TLine, T, Cursor } from "./Terminal";
import sStyles from "./Section.module.css";
import styles from "./LandingDemo.module.css";

export default function LandingDemo() {
  return (
    <section className={sStyles.section} id="demo">
      <div className={sStyles.inner}>
        <FadeIn>
          <div className={sStyles.tag}>{"// Live on Testnet"}</div>
          <h2 className={sStyles.title}>
            Try it now.
            <br />
            No signup needed.
          </h2>
          <p className={sStyles.sub}>
            The testnet is running on Base Sepolia. Connect your wallet, pick a
            listing, inspect the live quality signals, and experience
            wallet-native API settlement firsthand.
          </p>
        </FadeIn>

        <FadeIn delay={150}>
          <div style={{ marginTop: "2.5rem" }}>
            <TerminalWindow title="bash — Quick Start">
              <TLine>
                <T.cmt>{"# 1. Search live listings"}</T.cmt>
              </TLine>
              <TLine>
                <T.prompt>$</T.prompt>{" "}
                <T.cmd>curl "https://chainlens.pelicanlab.dev/api/market/listings?q=weather"</T.cmd>
              </TLine>
              <TLine />
              <TLine>
                <T.cmt>{"# 2. Inspect one listing before spending"}</T.cmt>
              </TLine>
              <TLine>
                <T.prompt>$</T.prompt>{" "}
                <T.cmd>curl https://chainlens.pelicanlab.dev/api/market/listings/7</T.cmd>
              </TLine>
              <TLine>
                <T.out>{"{"}</T.out>
              </TLine>
              <TLine indent={1}>
                <T.key>&quot;listingId&quot;</T.key>
                <T.out>{": "}</T.out>
                <T.str>&quot;7&quot;</T.str>
                <T.out>,</T.out>
              </TLine>
              <TLine indent={1}>
                <T.key>&quot;successRate&quot;</T.key>
                <T.out>{": "}</T.out>
                <T.str>&quot;0.98&quot;</T.str>
                <T.out>,</T.out>
              </TLine>
              <TLine indent={1}>
                <T.key>&quot;price&quot;</T.key>
                <T.out>{": "}</T.out>
                <T.str>&quot;0.05 USDC&quot;</T.str>
              </TLine>
              <TLine>
                <T.out>{"}"}</T.out>
              </TLine>
              <TLine />
              <TLine>
                <T.cmt>{"# 3. Pay through the x402 gateway"}</T.cmt>
              </TLine>
              <TLine>
                <T.prompt>$</T.prompt>{" "}
                <T.cmd>{"curl -H \"X-Payment: <signed-auth>\" \\"}</T.cmd>
              </TLine>
              <TLine indent={1}>
                <T.cmd>&quot;https://chainlens.pelicanlab.dev/api/x402/7?city=seoul&quot;</T.cmd>
              </TLine>
              <TLine />
              <TLine>
                <T.ok>→ Returns seller response + settlement tx hash</T.ok>{" "}
                <Cursor />
              </TLine>
            </TerminalWindow>
          </div>
        </FadeIn>

        <FadeIn delay={300}>
          <div className={styles.cta}>
            <a
              href="https://chainlens.pelicanlab.dev"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btn}
            >
              ⚡ Open Testnet App
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
