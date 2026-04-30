"use client";

import { useParams } from "next/navigation";
import { useLegacyApiRedirect } from "@/hooks/useLegacyApiRedirect";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import ErrorMessage from "@/components/shared/ErrorMessage";

export default function ApiDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { error } = useLegacyApiRedirect(id);

  if (!error) return <LoadingSpinner />;
  return <ErrorMessage message={error} />;
}
