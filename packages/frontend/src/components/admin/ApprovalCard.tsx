"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import type { ApiListing } from "@chain-lens/shared";
import StatusBadge from "../shared/StatusBadge";

interface TestResult {
  status: number | null;
  body: unknown;
  error: string | null;
  latencyMs: number;
}

interface Props {
  api: ApiListing;
  onApprove: (id: string, reason?: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
  onRunTest: (apiId: string, payload?: unknown, method?: string) => Promise<TestResult>;
}

export default function ApprovalCard({ api, onApprove, onReject, onRunTest }: Props) {
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleApprove() {
    setActionLoading(true);
    try {
      await onApprove(api.id);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!showRejectInput) {
      setShowRejectInput(true);
      return;
    }
    setActionLoading(true);
    try {
      await onReject(api.id, rejectReason || undefined);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTest() {
    setTestLoading(true);
    setTestResult(null);
    try {
      const data = await onRunTest(api.id, api.exampleRequest ?? {});
      setTestResult(data);
    } catch {
      setTestResult({ status: null, body: null, error: "Network error", latencyMs: 0 });
    } finally {
      setTestLoading(false);
    }
  }

  const isOk = testResult?.status != null && testResult.status >= 200 && testResult.status < 300;

  return (
    <div className="card border-[var(--border)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] pb-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-[var(--text)]">{api.name}</h3>
              <StatusBadge status={api.status} />
            </div>
            <p className="text-xs font-mono text-[var(--text3)]">
              Seller: {api.sellerAddress}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium text-[var(--green)]">{formatUnits(BigInt(api.price), 6)} USDC</p>
            <p className="capitalize text-xs text-[var(--text2)]">{api.category}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--text2)]">{api.description}</p>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-[var(--text2)]">Endpoint:</span>
          <code
            className="flex-1 truncate rounded border border-[var(--border2)] bg-[var(--bg3)] px-2 py-0.5 font-mono text-xs text-[var(--cyan)]"
          >
            {api.endpoint}
          </code>
        </div>
      </div>

      {/* Example request/response */}
      {(api.exampleRequest || api.exampleResponse) && (
        <div className="border-b border-[var(--border)] py-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-[var(--cyan)] transition-colors"
          >
            {expanded ? "Hide" : "Show"} sample request/response
          </button>
          {expanded && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {api.exampleRequest && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--text2)]">Example Request</p>
                  <pre
                    className="max-h-40 overflow-auto rounded border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-xs text-[var(--text)]"
                  >
                    {JSON.stringify(api.exampleRequest as object, null, 2)}
                  </pre>
                </div>
              )}
              {api.exampleResponse && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--text2)]">Example Response</p>
                  <pre
                    className="max-h-40 overflow-auto rounded border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-xs text-[var(--text)]"
                  >
                    {JSON.stringify(api.exampleResponse as object, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Test section */}
      <div className="border-b border-[var(--border)] py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-[var(--text)]">Live Test</p>
          <button
            onClick={handleTest}
            disabled={testLoading}
            className="rounded border border-[var(--border2)] bg-[var(--bg3)] px-3 py-1.5 text-xs text-[var(--text2)] transition-colors disabled:opacity-50"
          >
            {testLoading ? "Testing..." : "Run Test"}
          </button>
        </div>

        {testResult && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs">
              <span
                className={`rounded px-2 py-0.5 font-bold ${
                  isOk
                    ? "bg-[rgba(63,185,80,0.15)] text-[var(--green)]"
                    : "bg-[rgba(248,81,73,0.15)] text-[var(--red)]"
                }`}
              >
                {testResult.status ?? "ERR"}
              </span>
              <span className="text-[var(--text3)]">{testResult.latencyMs}ms</span>
              {testResult.error && (
                <span className="text-[var(--red)]">{testResult.error}</span>
              )}
            </div>
            {testResult.body !== null && (
              <pre
                className="max-h-48 overflow-auto rounded border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-xs text-[var(--text)]"
              >
                {JSON.stringify(testResult.body, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pt-4 space-y-3">
        {showRejectInput && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text2)]">
              Rejection reason (optional)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="input text-sm min-h-[60px]"
              placeholder="e.g. Endpoint unreachable, invalid response format..."
            />
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={actionLoading}
            className="btn-primary flex-1"
          >
            {actionLoading ? "Processing..." : "Approve"}
          </button>
          <button
            onClick={handleReject}
            disabled={actionLoading}
            className="btn-danger flex-1"
          >
            {showRejectInput ? "Confirm Reject" : "Reject"}
          </button>
          {showRejectInput && (
            <button
              onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
              className="px-3 py-2 text-sm text-[var(--text2)] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
