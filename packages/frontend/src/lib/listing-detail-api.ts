import type { ListingDetail } from "@/types/market";
import { DISCOVER_BACKEND_URL } from "./discover-api";

export async function fetchListing(id: string): Promise<ListingDetail | null> {
  try {
    const res = await fetch(`${DISCOVER_BACKEND_URL}/market/listings/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ListingDetail;
  } catch {
    return null;
  }
}
