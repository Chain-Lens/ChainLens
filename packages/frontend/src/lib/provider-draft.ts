import { apiClient } from "./api-client";

export type DraftStatus = "UNCLAIMED" | "CLAIMED" | "LISTED" | "ARCHIVED";

export interface ProviderDraft {
  id: string;
  providerSlug: string;
  name: string;
  description: string;
  category: string;
  website: string;
  docs?: string | null;
  directoryVerified: boolean;
  status: DraftStatus;
  claimedBy?: string | null;
  listingUrl?: string | null;
  listingOnChainId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderDraftState {
  draft: ProviderDraft | null;
  found: boolean;
  status: DraftStatus | null;
  loading: boolean;
  error: string | null;
}

export async function fetchProviderDraft(slug: string): Promise<ProviderDraft | null> {
  try {
    return await apiClient.get<ProviderDraft>(`/directory/drafts/${encodeURIComponent(slug)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/404|not found/i.test(msg)) return null;
    throw err;
  }
}
