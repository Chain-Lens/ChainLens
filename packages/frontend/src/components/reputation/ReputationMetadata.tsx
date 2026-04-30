import { resolveUri } from "@/lib/url";

export function ReputationMetadata({ metadataURI }: { metadataURI: string }) {
  return (
    <div className="card space-y-2">
      <h2 className="text-lg font-semibold text-[var(--text)]">Metadata</h2>
      <a
        href={resolveUri(metadataURI)}
        target="_blank"
        rel="noreferrer"
        className="break-all font-mono text-sm text-[var(--cyan)] hover:underline"
      >
        {metadataURI}
      </a>
    </div>
  );
}
