"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import type { ApiListing } from "@chainlens/shared";
import StatusBadge from "../shared/StatusBadge";

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api";

interface TestResult {
  status: number | null;
  body: unknown;
  error: string | null;
  latencyMs: number;
}

interface Props {
  api: ApiListing;
  adminAddress: string;
  onApprove: (id: string, reason?: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
}

export default function ApprovalCard({ api, adminAddress, onApprove, onReject }: Props) {
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
      const res = await fetch(`${BASE_URL}/admin/apis/${api.id}/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-address": adminAddress,
        },
        body: JSON.stringify({ payload: api.exampleRequest ?? {} }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ status: null, body: null, error: "Network error", latencyMs: 0 });
    } finally {
      setTestLoading(false);
    }
  }

  const isOk = testResult?.status != null && testResult.status >= 200 && testResult.status < 300;

  return (
    <div className="card" style={{ borderColor: "var(--border)" }}>
      {/* Header */}
      <div className="pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{api.name}</h3>
              <StatusBadge status={api.status} />
            </div>
            <p className="text-xs font-mono" style={{ color: "var(--text3)" }}>
              Seller: {api.sellerAddress}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium" style={{ color: "var(--green)" }}>{formatUnits(BigInt(api.price), 6)} USDC</p>
            <p className="capitalize text-xs" style={{ color: "var(--text2)" }}>{api.category}</p>
          </div>
        </div>
        <p className="text-sm mt-3" style={{ color: "var(--text2)" }}>{api.description}</p>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text2)" }}>Endpoint:</span>
          <code
            className="text-xs px-2 py-0.5 rounded flex-1 truncate"
            style={{ background: "var(--bg3)", color: "var(--cyan)", fontFamily: "var(--font-mono)", border: "1px solid var(--border2)" }}
          >
            {api.endpoint}
          </code>
        </div>
      </div>

      {/* Example request/response */}
      {(api.exampleRequest || api.exampleResponse) && (
        <div className="py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium transition-colors"
            style={{ color: "var(--cyan)" }}
          >
            {expanded ? "Hide" : "Show"} sample request/response
          </button>
          {expanded && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {api.exampleRequest && (
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--text2)" }}>Example Request</p>
                  <pre
                    className="text-xs rounded p-2 overflow-auto max-h-40"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)" }}
                  >
                    {JSON.stringify(api.exampleRequest as object, null, 2)}
                  </pre>
                </div>
              )}
              {api.exampleResponse && (
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--text2)" }}>Example Response</p>
                  <pre
                    className="text-xs rounded p-2 overflow-auto max-h-40"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)" }}
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
      <div className="py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Live Test</p>
          <button
            onClick={handleTest}
            disabled={testLoading}
            className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50"
            style={{ background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border2)" }}
          >
            {testLoading ? "Testing..." : "Run Test"}
          </button>
        </div>

        {testResult && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs">
              <span
                className="font-bold px-2 py-0.5 rounded"
                style={{
                  background: isOk ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)",
                  color: isOk ? "var(--green)" : "var(--red)",
                }}
              >
                {testResult.status ?? "ERR"}
              </span>
              <span style={{ color: "var(--text3)" }}>{testResult.latencyMs}ms</span>
              {testResult.error && (
                <span style={{ color: "var(--red)" }}>{testResult.error}</span>
              )}
            </div>
            {testResult.body !== null && (
              <pre
                className="text-xs rounded p-2 overflow-auto max-h-48"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)" }}
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
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text2)" }}>
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
              className="px-3 py-2 text-sm transition-colors"
              style={{ color: "var(--text2)" }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
