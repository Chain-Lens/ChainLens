"use client";

import { useState } from "react";
import type { SellerApi } from "@/hooks/useSellerApis";

export type SellerPatch = {
  name?: string;
  description?: string;
  endpoint?: string;
};

export default function SellerEditForm({
  api,
  onCancel,
  onSubmit,
}: {
  api: SellerApi;
  onCancel: () => void;
  onSubmit: (patch: SellerPatch) => Promise<void>;
}) {
  const [name, setName] = useState(api.name);
  const [description, setDescription] = useState(api.description);
  const [endpoint, setEndpoint] = useState(api.endpoint ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const patch: SellerPatch = {};
      if (name !== api.name) patch.name = name;
      if (description !== api.description) patch.description = description;
      if (endpoint !== (api.endpoint ?? "")) patch.endpoint = endpoint;
      if (Object.keys(patch).length === 0) {
        onCancel();
        return;
      }
      await onSubmit(patch);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-[var(--border2)] bg-[var(--bg2)] p-3">
      <label className="flex flex-col gap-1 text-xs text-[var(--text2)]">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-[var(--border2)] bg-[var(--bg3)] px-2 py-1 text-sm text-[var(--text)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--text2)]">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="rounded border border-[var(--border2)] bg-[var(--bg3)] px-2 py-1 text-sm text-[var(--text)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--text2)]">
        Endpoint
        <input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://..."
          className="rounded border border-[var(--border2)] bg-[var(--bg3)] px-2 py-1 font-mono text-xs text-[var(--text)]"
        />
      </label>
      {err && <p className="text-xs text-[var(--red)]">{err}</p>}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-xs font-medium text-[var(--text3)] hover:text-[var(--text)]"
        >
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="btn-primary px-3 py-1 text-xs">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
