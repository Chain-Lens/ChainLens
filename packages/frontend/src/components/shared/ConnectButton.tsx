"use client";

import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit";
import { useTheme } from "@/providers/ThemeProvider";

export default function ConnectButton() {
  const { theme } = useTheme();
  const accountButtonClass =
    theme === "dark"
      ? "border-[rgba(63,185,80,0.3)] bg-[rgba(63,185,80,0.12)] text-[var(--green)] hover:bg-[rgba(63,185,80,0.2)]"
      : "border-[rgba(37,99,235,0.3)] bg-[rgba(37,99,235,0.1)] text-[var(--accent)] hover:bg-[rgba(37,99,235,0.18)]";
  const statusDotClass =
    theme === "dark" ? "bg-[var(--green)]" : "bg-[var(--accent)]";

  return (
    <RainbowConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              className: "pointer-events-none select-none opacity-0",
            })}
          >
            {!connected ? (
              <button
                onClick={openConnectModal}
                className="btn-primary px-4 py-[0.4375rem] text-[0.8125rem]"
              >
                Connect Wallet
              </button>
            ) : chain?.unsupported ? (
              <button
                onClick={openChainModal}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.15)] px-4 py-[0.4375rem] text-[0.8125rem] font-semibold text-[var(--red)]"
              >
                Wrong Network
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {/* Chain button */}
                <button
                  onClick={openChainModal}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border2)] bg-[var(--bg3)] px-3 py-[0.4375rem] text-[0.8125rem] font-medium text-[var(--text2)] transition-colors hover:bg-[var(--border)]"
                >
                  {chain?.hasIcon && chain.iconUrl && (
                    <img src={chain.iconUrl} alt={chain.name} className="h-[14px] w-[14px] rounded-full" />
                  )}
                  {chain?.name}
                </button>

                {/* Account button */}
                <button
                  onClick={openAccountModal}
                  className={`inline-flex items-center gap-2 rounded-[8px] border px-[0.875rem] py-[0.4375rem] font-mono text-[0.8125rem] font-semibold transition-colors ${accountButtonClass}`}
                >
                  {/* Status dot */}
                  <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${statusDotClass}`} />
                  {account.displayName}
                </button>
              </div>
            )}
          </div>
        );
      }}
    </RainbowConnectButton.Custom>
  );
}
