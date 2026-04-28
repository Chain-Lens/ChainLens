import Image from "next/image";
import styles from "./LandingFooter.module.css";

function IconX() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconTelegram() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export default function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <span
        className={styles.logo}
        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
      >
        <Image src="/chainlens_coin_256.png" alt="ChainLens" width={18} height={18} />
        ChainLens
      </span>

      <div className={styles.links}>
        <a href="https://x.com/ihojae212644" target="_blank" rel="noopener noreferrer">
          <IconX /> @ihojae212644
        </a>
        <a href="https://t.me/ghwo336" target="_blank" rel="noopener noreferrer">
          <IconTelegram /> @ghwo336
        </a>
        <a href="https://chainlens.pelicanlab.dev" target="_blank" rel="noopener noreferrer">
          ⚡ Testnet
        </a>
        <a href="https://forms.gle/EtCpnWtRcMeM7UtC7" target="_blank" rel="noopener noreferrer">
          Waitlist
        </a>
      </div>

      <span className={styles.copy}>© 2025 ChainLens · Built on Base</span>
    </footer>
  );
}
