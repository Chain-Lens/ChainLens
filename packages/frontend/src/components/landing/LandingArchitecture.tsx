import FadeIn from "./FadeIn";
import { TerminalWindow, TLine, T } from "./Terminal";
import sStyles from "./Section.module.css";
import styles from "./LandingArchitecture.module.css";

const POINTS = [
  {
    icon: "🔗",
    title: "Smart Contract (Market Layer)",
    desc: (
      <>
        <code>ChainLensMarket</code> on Base handles listing state, gateway settlement, and seller
        claims. Funds only move on successful settlement.
      </>
    ),
  },
  {
    icon: "⚙️",
    title: "Gateway (Orchestration Layer)",
    desc: "Serves market discovery, runs seller calls, validates responses, and triggers settlement — connecting wallet payment to real API execution.",
  },
  {
    icon: "🛍️",
    title: "Curated Marketplace",
    desc: "Every listing exposes metadata, example payloads, and recent quality signals. Buyers can inspect before they spend.",
  },
  {
    icon: "🤖",
    title: "Agent SDK (Buyer Layer)",
    desc: "Any agent with an EVM wallet can use standard HTTP, MCP, or custom x402 signing. No SDK lock-in.",
  },
];

export default function LandingArchitecture() {
  return (
    <section className={sStyles.section} id="arch">
      <div className={sStyles.inner}>
        <FadeIn>
          <div className={sStyles.tag}>{"// Architecture"}</div>
          <h2 className={sStyles.title}>
            Three layers.
            <br />
            One current flow.
          </h2>
          <p className={sStyles.sub}>
            ChainLens separates concerns cleanly — on-chain security, off-chain execution, and
            pre-purchase trust signals.
          </p>
        </FadeIn>

        <div className={styles.layout}>
          <div className={styles.points}>
            {POINTS.map((p, i) => (
              <FadeIn key={p.title} delay={i * 100}>
                <div className={styles.point}>
                  <div className={styles.pointIcon}>{p.icon}</div>
                  <div className={styles.pointText}>
                    <h4>{p.title}</h4>
                    <p>{p.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={200}>
            <TerminalWindow title="ChainLensMarket.sol — settlement core">
              <TLine>
                <T.cmt>{"// SPDX-License-Identifier: MIT"}</T.cmt>
              </TLine>
              <TLine>
                <T.kw>pragma</T.kw> <T.cmd>solidity</T.cmd> <T.str>^0.8.28</T.str>
                <T.out>;</T.out>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>struct</T.kw> <T.cyan>Listing</T.cyan>
                <T.out>{" {"}</T.out>
              </TLine>
              <TLine indent={1}>
                <T.cyan>address</T.cyan> <T.out>owner;</T.out>
              </TLine>
              <TLine indent={1}>
                <T.cyan>address</T.cyan> <T.out>payout;</T.out>
              </TLine>
              <TLine indent={1}>
                <T.cyan>string</T.cyan>
                {"  "} <T.out>metadataURI;</T.out>
              </TLine>
              <TLine indent={1}>
                <T.cyan>bool</T.cyan>
                {"    "}
                <T.out>active;</T.out>
              </TLine>
              <TLine>
                <T.out>{"}"}</T.out>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>function</T.kw> <T.ok>settle</T.ok>
                <T.out>(</T.out>
                <T.cyan>uint256</T.cyan> <T.val>listingId</T.val>
                <T.out>, </T.out>
                <T.cyan>bytes32</T.cyan> <T.val>jobRef</T.val>
                <T.out>)</T.out>
              </TLine>
              <TLine indent={1}>
                <T.kw>external</T.kw> <T.kw>onlyGateway</T.kw>
                <T.out>{" {"}</T.out>
              </TLine>
              <TLine indent={2}>
                <T.cmt>{"// pull USDC with signed auth, credit seller, emit Settled"}</T.cmt>
              </TLine>
              <TLine>
                <T.out>{"}"}</T.out>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>function</T.kw> <T.ok>claim</T.ok>
                <T.out>(</T.out>
                <T.out>)</T.out>
              </TLine>
              <TLine indent={1}>
                <T.kw>external</T.kw>
                <T.out>{" {"}</T.out>
              </TLine>
              <TLine indent={2}>
                <T.cmt>{"// seller withdraws accrued USDC"}</T.cmt>
              </TLine>
              <TLine>
                <T.out>{"}"}</T.out>
              </TLine>
            </TerminalWindow>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
