import { formatUnits } from "viem";
import type { ApiListingPublic } from "@chain-lens/shared";
import StatusBadge from "../shared/StatusBadge";

export default function ApiInfo({ api }: { api: ApiListingPublic }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">{api.name}</h1>
          <p className="mt-1 text-sm text-[var(--text2)]">
            by{" "}
            <span className="font-mono">
              {api.sellerAddress.slice(0, 6)}...{api.sellerAddress.slice(-4)}
            </span>
          </p>
        </div>
        <StatusBadge status={api.status} />
      </div>

      <p className="mb-6 text-[var(--text2)]">{api.description}</p>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg3)] p-4">
          <p className="mb-1 text-sm text-[var(--text2)]">Price</p>
          <p className="text-2xl font-bold text-[var(--accent)]">
            {formatUnits(BigInt(api.price), 6)} USDC
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg3)] p-4">
          <p className="mb-1 text-sm text-[var(--text2)]">Category</p>
          <p className="text-lg font-medium text-[var(--text)]">{api.category}</p>
        </div>
      </div>

      {api.exampleRequest != null && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-[var(--text2)]">Example Request</h3>
          <pre className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 font-mono text-sm text-[var(--text)]">
            {JSON.stringify(api.exampleRequest, null, 2)}
          </pre>
        </div>
      )}

      {api.exampleResponse != null && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-[var(--text2)]">Example Response</h3>
          <pre className="overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 font-mono text-sm text-[var(--text)]">
            {JSON.stringify(api.exampleResponse, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
