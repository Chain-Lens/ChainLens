import Link from "next/link";
import { formatUnits } from "viem";
import type { ApiListingPublic } from "@chainlens/shared";

export default function ApiCard({ api }: { api: ApiListingPublic }) {
  return (
    <Link href={`/apis/${api.id}`}>
      <div
        className="card cursor-pointer transition-all"
        style={{ borderColor: "var(--border)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border2)";
          (e.currentTarget as HTMLDivElement).style.background = "var(--bg3)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
          (e.currentTarget as HTMLDivElement).style.background = "var(--bg2)";
        }}
      >
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>{api.name}</h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border2)" }}
          >
            {api.category}
          </span>
        </div>
        <p className="text-sm mb-4 line-clamp-2" style={{ color: "var(--text2)" }}>
          {api.description}
        </p>
        <div className="flex justify-between items-center">
          <span className="text-base font-bold" style={{ color: "var(--accent)" }}>
            {formatUnits(BigInt(api.price), 6)} USDC
          </span>
          <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>
            {api.sellerAddress.slice(0, 6)}...{api.sellerAddress.slice(-4)}
          </span>
        </div>
      </div>
    </Link>
  );
}
