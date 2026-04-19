"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { keccak256, stringToBytes } from "viem";
import { useMemo } from "react";
import { useJob } from "@/hooks/useJob";
import StatusBadge from "@/components/shared/StatusBadge";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function EvidencePage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const { job, loading, error } = useJob(jobId);

  const localHash = useMemo(() => {
    if (!job || job.response == null) return null;
    try {
      return keccak256(stringToBytes(JSON.stringify(job.response)));
    } catch {
      return null;
    }
  }, [job]);

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );

  if (error || !job) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p style={{ color: "var(--red)" }}>{error ?? "Evidence not found"}</p>
      </div>
    );
  }

  const hashMatches =
    localHash !== null && job.responseHash !== null
      ? localHash.toLowerCase() === job.responseHash.toLowerCase()
      : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
          Evidence
        </h1>
        <p className="text-sm font-mono" style={{ color: "var(--text3)" }}>
          Job #{job.onchainJobId}
        </p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            Job Details
          </h2>
          <StatusBadge status={job.status} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="Buyer" mono value={job.buyer} />
          <Field
            label="Seller"
            mono
            value={
              <Link
                href={`/reputation/${job.seller}`}
                style={{ color: "var(--cyan)" }}
                className="hover:underline"
              >
                {job.seller}
              </Link>
            }
          />
          <Field label="API ID" mono value={job.apiId} />
          <Field label="Amount (USDC base)" mono value={job.amount} />
          <Field
            label="Task Type"
            value={job.taskType ?? "legacy"}
          />
          <Field
            label="Created"
            value={new Date(job.createdAt).toLocaleString()}
          />
          {job.completedAt && (
            <Field
              label="Completed"
              value={new Date(job.completedAt).toLocaleString()}
            />
          )}
          {job.evidenceURI && (
            <Field label="Evidence URI" mono value={job.evidenceURI} />
          )}
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Hashes
        </h2>
        <Field label="Inputs Hash" mono value={job.inputsHash} />
        {job.responseHash && (
          <Field label="Response Hash (on-chain)" mono value={job.responseHash} />
        )}
        {hashMatches !== null && (
          <div
            className="px-3 py-2 rounded-lg text-sm"
            style={{
              background: hashMatches
                ? "rgba(35,134,54,0.12)"
                : "rgba(248,81,73,0.12)",
              border: hashMatches
                ? "1px solid rgba(35,134,54,0.3)"
                : "1px solid rgba(248,81,73,0.3)",
              color: hashMatches ? "#3fb950" : "var(--red)",
            }}
          >
            {hashMatches
              ? "✓ Local keccak256(response) matches on-chain responseHash"
              : "✗ Local hash does NOT match on-chain responseHash"}
          </div>
        )}
      </div>

      {job.inputs != null && (
        <div className="card space-y-2">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            Request Inputs
          </h2>
          <JsonBlock value={job.inputs} />
        </div>
      )}

      {job.response != null && (
        <div className="card space-y-2">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            Response
          </h2>
          <JsonBlock value={job.response} />
        </div>
      )}

      {job.errorReason && (
        <div
          className="p-4 rounded-lg"
          style={{
            background: "rgba(248,81,73,0.1)",
            border: "1px solid rgba(248,81,73,0.3)",
          }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--red)" }}>
            Error:{" "}
          </span>
          <span className="text-sm" style={{ color: "var(--red)" }}>
            {job.errorReason}
          </span>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--text2)" }}>
        {label}
      </div>
      <div
        className={mono ? "font-mono text-xs break-all" : ""}
        style={{ color: "var(--text)" }}
      >
        {value}
      </div>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre
      className="p-4 rounded-lg text-sm overflow-auto"
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        fontFamily: "var(--font-mono)",
      }}
    >
      {text}
    </pre>
  );
}
