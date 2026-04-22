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
            verified API, and experience agent-native payments firsthand.
          </p>
        </FadeIn>

        <FadeIn delay={150}>
          <div style={{ marginTop: "2.5rem" }}>
            <TerminalWindow title="bash — Quick Start">
              <TLine>
                <T.cmt>{"# 1. Browse the curated marketplace"}</T.cmt>
              </TLine>
              <TLine>
                <T.prompt>$</T.prompt>{" "}
                <T.cmd>curl https://chainlens.pelicanlab.dev/api/apis</T.cmd>
              </TLine>
              <TLine />
              <TLine>
                <T.cmt>{"# 2. Prepare a payment request"}</T.cmt>
              </TLine>
              <TLine>
                <T.prompt>$</T.prompt>{" "}
                <T.cmd>{"curl -X POST https://chainlens.pelicanlab.dev/prepare \\"}</T.cmd>
              </TLine>
              <TLine indent={1}>
                <T.cmd>
                  {"-H "}<T.str>&quot;Content-Type: application/json&quot;</T.str>{" \\"}
                </T.cmd>
              </TLine>
              <TLine indent={1}>
                <T.cmd>
                  {"-d "}<T.str>&apos;{"{\"apiId\":\"weather-v2\"}"}&apos;</T.str>
                </T.cmd>
              </TLine>
              <TLine>
                <T.out>{"{"}</T.out>
              </TLine>
              <TLine indent={1}>
                <T.key>&quot;requestId&quot;</T.key>
                <T.out>{": "}</T.out>
                <T.str>&quot;0xab12...ef&quot;</T.str>
                <T.out>,</T.out>
              </TLine>
              <TLine indent={1}>
                <T.key>&quot;price&quot;</T.key>
                <T.out>{": "}</T.out>
                <T.str>&quot;0.05 USDC&quot;</T.str>
                <T.out>,</T.out>
              </TLine>
              <TLine indent={1}>
                <T.key>&quot;contract&quot;</T.key>
                <T.out>{": "}</T.out>
                <T.str>&quot;0x1234...dead&quot;</T.str>
              </TLine>
              <TLine>
                <T.out>{"}"}</T.out>
              </TLine>
              <TLine />
              <TLine>
                <T.cmt>{"# 3. Sign the tx with your wallet → API executes automatically"}</T.cmt>
              </TLine>
              <TLine />
              <TLine>
                <T.ok>→ Full UI available at https://chainlens.pelicanlab.dev</T.ok>{" "}
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
