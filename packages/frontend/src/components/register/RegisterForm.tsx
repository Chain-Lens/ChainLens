"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { useRegister } from "@/hooks/useRegister";
import { useTaskTypes } from "@/hooks/useTaskTypes";

export default function RegisterForm() {
  const { address, isConnected } = useAccount();
  const { register, loading, error, result } = useRegister();
  const { taskTypes, loading: taskTypesLoading, error: taskTypesError } = useTaskTypes();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [priceInUsdc, setPriceInUsdc] = useState("");
  const [category, setCategory] = useState("");

  // Pick the first enabled task type as the default once it loads, so the
  // form never submits an empty category.
  useEffect(() => {
    if (!category && taskTypes.length > 0) {
      setCategory(taskTypes[0]!.name);
    }
  }, [taskTypes, category]);

  if (!isConnected) {
    return (
      <div className="card text-center py-8">
        <p className="text-[var(--text2)]">Connect your wallet to register an API</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="card text-center py-8">
        <h3 className="mb-2 text-xl font-semibold text-[var(--green)]">
          API Registered Successfully!
        </h3>
        <p className="mb-2 text-[var(--text2)]">
          Your API has been submitted for review.
        </p>
        <p className="font-mono text-sm text-[var(--text3)]">ID: {result.id}</p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !category) return;

    try {
      const priceInWei = parseUnits(priceInUsdc, 6).toString();
      await register({
        name,
        description,
        endpoint,
        price: priceInWei,
        sellerAddress: address,
        category,
      });
    } catch {
      // Error handled in hook state
    }
  }

  const canSubmit = !loading && !taskTypesLoading && taskTypes.length > 0 && !!category;

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text2)]">
          API Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder="e.g. Weather API"
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
          className="input min-h-[100px]"
          placeholder="Describe what your API does..."
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
          placeholder="https://your-seller-wrapper.com/endpoint"
          required
        />
        <div className="mt-2 rounded border border-[var(--border)] bg-[var(--bg3)] p-3 text-xs text-[var(--text2)]">
          <p className="mb-1 font-medium text-[var(--text)]">
            This URL is called by the ChainLens gateway — not a raw upstream API.
          </p>
          <p className="mb-2 leading-relaxed">
            Your endpoint must accept <code className="rounded bg-[var(--bg2)] px-1 text-[var(--cyan)]">POST</code>
            {" "}with body{" "}
            <code className="rounded bg-[var(--bg2)] px-1 text-[var(--cyan)]">
              {`{ task_type, inputs, jobId, buyer }`}
            </code>
            {" "}and return JSON matching the task type&apos;s schema.
            Pointing this at a raw upstream (e.g. <code>api.llama.fi</code>,{" "}
            <code>blockscout.com/api</code>) will cause every job to be refunded.
          </p>
          <p className="text-[var(--text3)]">
            Need a template?{" "}
            <a
              href="https://github.com/Chain-Lens/ChainLens/tree/main/packages/sample-sellers"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--cyan)] hover:underline"
            >
              packages/sample-sellers
            </a>
            {" "}has ready-made wrappers (DefiLlama, Blockscout, Sourcify) you
            can fork and deploy. Or scaffold a fresh one with{" "}
            <code>npx @chain-lens/create-seller</code>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text2)]">
            Price (USDC)
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={priceInUsdc}
            onChange={(e) => setPriceInUsdc(e.target.value)}
            className="input"
            placeholder="1.00"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text2)]">
            Task type
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input"
            required
            disabled={taskTypesLoading || taskTypes.length === 0}
          >
            {taskTypesLoading && <option value="">Loading…</option>}
            {!taskTypesLoading && taskTypes.length === 0 && (
              <option value="">No task types enabled</option>
            )}
            {taskTypes.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          {taskTypesError && (
            <p className="mt-1 text-xs text-[var(--red)]">{taskTypesError}</p>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full btn-primary py-3"
      >
        {loading ? "Submitting..." : "Register API"}
      </button>

      <p className="text-center font-mono text-xs text-[var(--text3)]">
        Seller address: {address}
      </p>
    </form>
  );
}
