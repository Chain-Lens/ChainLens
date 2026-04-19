import FadeIn from "./FadeIn";
import { TerminalWindow, TLine, T } from "./Terminal";
import sStyles from "./Section.module.css";
import styles from "./LandingArchitecture.module.css";

const POINTS = [
  {
    icon: "🔗",
    title: "Smart Contract (Escrow Layer)",
    desc: (
      <>
        Solidity contract on Base handles all payment logic. Funds lock on{" "}
        <code>pay()</code>, release on <code>complete()</code>, or return on{" "}
        <code>refund()</code>. Trustless by design.
      </>
    ),
  },
  {
    icon: "⚙️",
    title: "Gateway (Orchestration Layer)",
    desc: "Listens for on-chain events, triggers seller APIs, validates responses, and issues settlements — connecting payment to execution without exposing seller credentials.",
  },
  {
    icon: "🛍️",
    title: "Curated Marketplace",
    desc: "Every API is pre-tested before listing. The Gateway validates endpoints, checks response schemas, and monitors uptime. Only verified APIs get listed.",
  },
  {
    icon: "🤖",
    title: "Agent SDK (Buyer Layer)",
    desc: "Any agent with an EVM wallet can interact via standard HTTP + Web3. No SDK lock-in. Works with any agent framework — LangChain, AutoGen, custom.",
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
            One seamless flow.
          </h2>
          <p className={sStyles.sub}>
            ChainLens separates concerns cleanly — on-chain security,
            off-chain performance, curated trust.
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
            <TerminalWindow title="ChainLens.sol — Escrow Core">
              <TLine>
                <T.cmt>{"// SPDX-License-Identifier: MIT"}</T.cmt>
              </TLine>
              <TLine>
                <T.kw>pragma</T.kw>{" "}
                <T.cmd>solidity</T.cmd>{" "}
                <T.str>^0.8.20</T.str>
                <T.out>;</T.out>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>struct</T.kw>{" "}
                <T.cyan>Payment</T.cyan>
                <T.out>{" {"}</T.out>
              </TLine>
              <TLine indent={1}>
                <T.cyan>address</T.cyan> <T.out>buyer;</T.out>
              </TLine>
              <TLine indent={1}>
                <T.cyan>address</T.cyan> <T.out>seller;</T.out>
              </TLine>
              <TLine indent={1}>
                <T.cyan>uint256</T.cyan> <T.out>amount;</T.out>
              </TLine>
              <TLine indent={1}>
                <T.cyan>bool</T.cyan>{"    "}<T.out>completed;</T.out>
              </TLine>
              <TLine>
                <T.out>{"}"}</T.out>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>function</T.kw>{" "}
                <T.ok>pay</T.ok>
                <T.out>(</T.out>
                <T.cyan>bytes32</T.cyan>{" "}
                <T.val>requestId</T.val>
                <T.out>)</T.out>
              </TLine>
              <TLine indent={1}>
                <T.kw>external</T.kw>{" "}
                <T.kw>payable</T.kw>
                <T.out>{" {"}</T.out>
              </TLine>
              <TLine indent={2}>
                <T.cmt>{"// lock funds in escrow"}</T.cmt>
              </TLine>
              <TLine>
                <T.out>{"}"}</T.out>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>function</T.kw>{" "}
                <T.ok>complete</T.ok>
                <T.out>(</T.out>
                <T.cyan>bytes32</T.cyan>{" "}
                <T.val>requestId</T.val>
                <T.out>)</T.out>
              </TLine>
              <TLine indent={1}>
                <T.kw>external</T.kw>{" "}
                <T.kw>onlyGateway</T.kw>
                <T.out>{" {"}</T.out>
              </TLine>
              <TLine indent={2}>
                <T.cmt>{"// release funds → seller"}</T.cmt>
              </TLine>
              <TLine>
                <T.out>{"}"}</T.out>
              </TLine>
              <TLine />
              <TLine>
                <T.kw>function</T.kw>{" "}
                <T.err>refund</T.err>
                <T.out>(</T.out>
                <T.cyan>bytes32</T.cyan>{" "}
                <T.val>requestId</T.val>
                <T.out>)</T.out>
              </TLine>
              <TLine indent={1}>
                <T.kw>external</T.kw>{" "}
                <T.kw>onlyGateway</T.kw>
                <T.out>{" {"}</T.out>
              </TLine>
              <TLine indent={2}>
                <T.cmt>{"// return funds → buyer"}</T.cmt>
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
