"use client";

import LoadingSpinner from "@/components/shared/LoadingSpinner";
import type { SellerApi } from "@/hooks/useSellerApis";
import SellerApiRow from "./SellerApiRow";
import SellerEmptyState from "./SellerEmptyState";
import type { SellerPatch } from "./SellerEditForm";

export default function SellerApiList({
  loading,
  error,
  apis,
  editable,
  onDelete,
  onEdit,
}: {
  loading: boolean;
  error: string | null;
  apis: SellerApi[];
  editable: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string, patch: SellerPatch) => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }
  if (error) return <div className="card py-8 text-center text-[var(--red)]">{error}</div>;
  if (apis.length === 0) return <SellerEmptyState />;
  return (
    <div className="space-y-4">
      {apis.map((api) => (
        <SellerApiRow
          key={api.id}
          api={api}
          editable={editable}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
