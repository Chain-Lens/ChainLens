"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { useRegister } from "@/hooks/useRegister";

export default function RegisterForm() {
  const { address, isConnected } = useAccount();
  const { register, loading, error, result } = useRegister();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [priceInUsdc, setPriceInUsdc] = useState("");
  const [category, setCategory] = useState("general");

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
    if (!address) return;

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
          placeholder="https://your-api.com/endpoint"
          required
        />
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
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input"
          >
            <option value="general">General</option>
            <option value="ai">AI / ML</option>
            <option value="data">Data</option>
            <option value="finance">Finance</option>
            <option value="social">Social</option>
            <option value="utility">Utility</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
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
