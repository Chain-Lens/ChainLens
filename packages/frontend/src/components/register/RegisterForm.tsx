"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import {
  useRegisterV3,
  type ListingMetadata,
} from "@/hooks/useRegisterV3";

export default function RegisterForm() {
  const { address, isConnected } = useAccount();
  const {
    register,
    txHash,
    isPending,
    isConfirming,
    isConfirmed,
    listingId,
    error,
    reset,
  } = useRegisterV3();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [priceInUsdc, setPriceInUsdc] = useState("");
  const [tags, setTags] = useState("");
  const [payoutOverride, setPayoutOverride] = useState("");

  if (!isConnected) {
    return (
      <div className="card text-center py-8">
        <p className="text-[var(--text2)]">Connect your wallet to register an API</p>
      </div>
    );
  }

  if (isConfirmed && listingId !== null) {
    return (
      <div className="card text-center py-8 space-y-3">
        <h3 className="text-xl font-semibold text-[var(--green)]">
          Listing Registered on-chain ✓
        </h3>
        <p className="text-[var(--text2)]">
          Listing <code className="text-[var(--cyan)]">#{listingId.toString()}</code>{" "}
          is now discoverable by agents.
        </p>
        {txHash && (
          <p className="font-mono text-xs text-[var(--text3)] break-all">
            tx: {txHash}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="btn-secondary"
        >
          Register another
        </button>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;

    const atomic = parseUnits(priceInUsdc || "0", 6);
    const payout =
      (payoutOverride.trim() as `0x${string}`) || (address as `0x${string}`);

    const metadata: ListingMetadata = {
      name: name.trim(),
      description: description.trim(),
      endpoint: endpoint.trim(),
      method,
      pricing: {
        amount: atomic.toString(),
        unit: "per_call",
      },
      ...(tags.trim()
        ? { tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }
        : {}),
    };

    register({ payout, metadata });
  }

  const submitting = isPending || isConfirming;
  const canSubmit =
    !submitting &&
    name.trim() &&
    description.trim() &&
    endpoint.trim() &&
    priceInUsdc;

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="rounded border border-[var(--border)] bg-[var(--bg3)] p-3 text-xs text-[var(--text2)] leading-relaxed">
        <p className="mb-1 font-medium text-[var(--text)]">
          v3: any HTTP API. No wrapper required.
        </p>
        <p>
          The ChainLens gateway proxies the request to your endpoint with the
          method and query-/body-shape declared below. Failed seller calls
          cause the buyer&apos;s signature to be discarded — no USDC moves, no
          refund contract needed.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text2)]">
          API Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder="e.g. TSLA Stock Price"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text2)]">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input min-h-[80px]"
          placeholder="What does your API return?"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text2)]">
          Endpoint URL
        </label>
        <input
          type="url"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          className="input"
          placeholder="https://api.example.com/tsla"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text2)]">
            HTTP Method
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as "GET" | "POST")}
            className="input"
          >
            <option value="GET">GET (inputs → query string)</option>
            <option value="POST">POST (inputs → JSON body)</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text2)]">
            Price (USDC per call)
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={priceInUsdc}
            onChange={(e) => setPriceInUsdc(e.target.value)}
            className="input"
            placeholder="0.05"
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text2)]">
          Tags <span className="text-[var(--text3)]">(comma-separated, optional)</span>
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="input"
          placeholder="finance, stocks, real-time"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text2)]">
          Payout address{" "}
          <span className="text-[var(--text3)]">
            (optional — defaults to connected wallet)
          </span>
        </label>
        <input
          type="text"
          value={payoutOverride}
          onChange={(e) => setPayoutOverride(e.target.value)}
          className="input font-mono text-sm"
          placeholder={address}
          pattern="^0x[a-fA-F0-9]{40}$"
        />
      </div>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      <button type="submit" disabled={!canSubmit} className="w-full btn-primary py-3">
        {isPending
          ? "Confirm in wallet…"
          : isConfirming
            ? "Waiting for confirmation…"
            : "Register on-chain"}
      </button>

      <p className="text-center font-mono text-xs text-[var(--text3)]">
        Seller: {address}
      </p>
    </form>
  );
}