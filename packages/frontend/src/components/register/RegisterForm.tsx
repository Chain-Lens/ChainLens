"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import {
  useRegisterV3,
  type ListingMetadata,
} from "@/hooks/useRegisterV3";
import { apiClient } from "@/lib/api-client";

type PreflightResult = {
  status: number | null;
  body: unknown;
  error: string | null;
  latencyMs: number;
  safety: {
    scanned: boolean;
    schemaValid: boolean | null;
    warnings: string[];
  };
};

const SCHEMA_TEMPLATES = [
  {
    label: "Generic data",
    description: "Top-level object with a data object.",
    schema: {
      type: "object",
      required: ["data"],
      properties: {
        data: { type: "object" },
      },
    },
  },
  {
    label: "Price quote",
    description: "Symbol, numeric price, and currency fields.",
    schema: {
      type: "object",
      required: ["symbol", "price", "currency"],
      properties: {
        symbol: { type: "string" },
        price: { type: "number" },
        currency: { type: "string" },
        timestamp: { type: "string" },
      },
    },
  },
  {
    label: "List response",
    description: "Object with an items array.",
    schema: {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
  },
  {
    label: "httpbin GET",
    description: "Shape returned by https://httpbin.org/get.",
    schema: {
      type: "object",
      required: ["args", "headers", "origin", "url"],
      properties: {
        args: { type: "object" },
        headers: { type: "object" },
        origin: { type: "string" },
        url: { type: "string" },
      },
    },
  },
] as const;

function formatSchema(schema: unknown) {
  return JSON.stringify(schema, null, 2);
}

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
  const [outputSchemaText, setOutputSchemaText] = useState(
    formatSchema(SCHEMA_TEMPLATES[0].schema),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);

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

    let outputSchema: unknown;
    setFormError(null);

    try {
      outputSchema = JSON.parse(outputSchemaText);
    } catch {
      setFormError("Output schema must be valid JSON.");
      return;
    }

    if (!outputSchema || typeof outputSchema !== "object" || Array.isArray(outputSchema)) {
      setFormError("Output schema must be a JSON object.");
      return;
    }

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
      output_schema: outputSchema,
      ...(tags.trim()
        ? { tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }
        : {}),
    };

    register({ payout, metadata });
  }

  async function handlePreflight() {
    setFormError(null);
    setPreflightResult(null);

    let outputSchema: unknown;
    try {
      outputSchema = JSON.parse(outputSchemaText);
    } catch {
      setFormError("Output schema must be valid JSON before self-test.");
      return;
    }

    if (!endpoint.trim()) {
      setFormError("Endpoint URL is required before self-test.");
      return;
    }

    setPreflightLoading(true);
    try {
      const result = await apiClient.post<PreflightResult>("/seller/preflight", {
        endpoint: endpoint.trim(),
        method,
        output_schema: outputSchema,
      });
      setPreflightResult(result);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Self-test request failed.",
      );
    } finally {
      setPreflightLoading(false);
    }
  }

  const submitting = isPending || isConfirming;
  const canSubmit =
    !submitting &&
    name.trim() &&
    description.trim() &&
    endpoint.trim() &&
    priceInUsdc &&
    outputSchemaText.trim();

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="rounded border border-[var(--border)] bg-[var(--bg3)] p-3 text-xs text-[var(--text2)] leading-relaxed">
        <p className="mb-1 font-medium text-[var(--text)]">
          v3: any HTTP API, but structured output is required.
        </p>
        <p>
          The ChainLens gateway proxies the request to your endpoint with the
          method and query-/body-shape declared below. Failed seller calls
          cause the buyer&apos;s signature to be discarded — no USDC moves, no
          refund contract needed. Curated listings must declare an
          <code className="mx-1">output_schema</code> so buyer agents can
          validate the response shape before settlement.
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
          Output Schema <span className="text-[var(--red)]">(required)</span>
        </label>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {SCHEMA_TEMPLATES.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => {
                setOutputSchemaText(formatSchema(template.schema));
                setPreflightResult(null);
              }}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg3)] p-3 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg2)]"
            >
              <span className="block text-sm font-medium text-[var(--text)]">
                {template.label}
              </span>
              <span className="mt-1 block text-xs text-[var(--text3)]">
                {template.description}
              </span>
            </button>
          ))}
        </div>
        <textarea
          value={outputSchemaText}
          onChange={(e) => setOutputSchemaText(e.target.value)}
          className="input min-h-[220px] font-mono text-xs"
          spellCheck={false}
          placeholder='{"type":"object","required":["data"],"properties":{"data":{"type":"object"}}}'
          required
        />
        <p className="mt-1 text-xs text-[var(--text3)]">
          JSON-schema-like object used by the gateway to validate seller
          responses before settlement. At minimum, declare the expected top-level
          shape and required fields.
        </p>
      </div>

      <div className="rounded border border-[var(--border)] bg-[var(--bg3)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">
              Schema Self-Test
            </p>
            <p className="text-xs text-[var(--text3)]">
              Calls your endpoint through the backend preflight route and checks
              injection scan + output schema before you register.
            </p>
          </div>
          <button
            type="button"
            onClick={handlePreflight}
            disabled={preflightLoading || !endpoint.trim() || !outputSchemaText.trim()}
            className="btn-secondary"
          >
            {preflightLoading ? "Running self-test..." : "Run self-test"}
          </button>
        </div>

        {preflightResult && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="text-xs text-[var(--text3)]">HTTP Status</div>
                <div className="mt-1 text-sm text-[var(--text)]">
                  {preflightResult.status ?? "none"}
                </div>
              </div>
              <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="text-xs text-[var(--text3)]">Latency</div>
                <div className="mt-1 text-sm text-[var(--text)]">
                  {preflightResult.latencyMs} ms
                </div>
              </div>
              <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
                <div className="text-xs text-[var(--text3)]">Schema Valid</div>
                <div className="mt-1 text-sm text-[var(--text)]">
                  {preflightResult.safety.schemaValid === null
                    ? "n/a"
                    : preflightResult.safety.schemaValid
                      ? "true"
                      : "false"}
                </div>
              </div>
            </div>

            {preflightResult.error && (
              <p className="text-sm text-[var(--red)]">
                {preflightResult.error}
              </p>
            )}

            <div>
              <div className="mb-1 text-xs text-[var(--text3)]">Warnings</div>
              <pre className="overflow-auto rounded-lg bg-[var(--bg)] p-3 font-mono text-xs text-[var(--text)]">
                {JSON.stringify(preflightResult.safety.warnings, null, 2)}
              </pre>
            </div>

            <div>
              <div className="mb-1 text-xs text-[var(--text3)]">Response Body</div>
              <pre className="overflow-auto rounded-lg bg-[var(--bg)] p-3 font-mono text-xs text-[var(--text)]">
                {JSON.stringify(preflightResult.body, null, 2)}
              </pre>
            </div>
          </div>
        )}
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

      {formError && <p className="text-sm text-[var(--red)]">{formError}</p>}
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
