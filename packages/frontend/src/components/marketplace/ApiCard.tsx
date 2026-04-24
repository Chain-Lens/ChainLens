import Link from "next/link";
import { formatUnits } from "viem";
import type { ApiListingPublic } from "@chain-lens/shared";

export default function ApiCard({ api }: { api: ApiListingPublic }) {
  const href =
    typeof api.onChainId === "number" ? `/discover/${api.onChainId}` : null;

  const content = (
    <div className="card cursor-pointer border-[var(--border)] transition-all hover:border-[var(--border2)] hover:bg-[var(--bg3)]">
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-base font-semibold text-[var(--text)]">{api.name}</h3>
        <span className="rounded-full border border-[var(--border2)] bg-[var(--bg3)] px-2 py-0.5 text-xs text-[var(--text2)]">
          {api.category}
        </span>
      </div>
      <p className="mb-4 line-clamp-2 text-sm text-[var(--text2)]">
        {api.description}
      </p>
      <div className="flex justify-between items-center">
        <span className="text-base font-bold text-[var(--accent)]">
          {formatUnits(BigInt(api.price), 6)} USDC
        </span>
        <span className="font-mono text-xs text-[var(--text3)]">
          {api.sellerAddress.slice(0, 6)}...{api.sellerAddress.slice(-4)}
        </span>
      </div>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href}>
      {content}
    </Link>
  );
}
