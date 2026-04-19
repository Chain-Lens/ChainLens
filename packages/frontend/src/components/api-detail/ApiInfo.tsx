import { formatUnits } from "viem";
import type { ApiListingPublic } from "@chainlens/shared";
import StatusBadge from "../shared/StatusBadge";

export default function ApiInfo({ api }: { api: ApiListingPublic }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>{api.name}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text2)" }}>
            by{" "}
            <span className="font-mono">
              {api.sellerAddress.slice(0, 6)}...{api.sellerAddress.slice(-4)}
            </span>
          </p>
        </div>
        <StatusBadge status={api.status} />
      </div>

      <p className="mb-6" style={{ color: "var(--text2)" }}>{api.description}</p>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg p-4" style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}>
          <p className="text-sm mb-1" style={{ color: "var(--text2)" }}>Price</p>
          <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
            {formatUnits(BigInt(api.price), 6)} USDC
          </p>
        </div>
        <div className="rounded-lg p-4" style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}>
          <p className="text-sm mb-1" style={{ color: "var(--text2)" }}>Category</p>
          <p className="text-lg font-medium" style={{ color: "var(--text)" }}>{api.category}</p>
        </div>
      </div>

      {api.exampleRequest != null && (
        <div className="mb-4">
          <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text2)" }}>
            Example Request
          </h3>
          <pre
            className="p-4 rounded-lg text-sm overflow-auto"
            style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)" }}
          >
            {JSON.stringify(api.exampleRequest, null, 2)}
          </pre>
        </div>
      )}

      {api.exampleResponse != null && (
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text2)" }}>
            Example Response
          </h3>
          <pre
            className="p-4 rounded-lg text-sm overflow-auto"
            style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)" }}
          >
            {JSON.stringify(api.exampleResponse, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
