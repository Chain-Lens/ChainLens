import type { DiscoverItem } from "@/components/discover/DiscoverItems";

export interface DiscoverResponse {
  items: DiscoverItem[];
  total: number;
  totalBeforeFilter: number;
}

export type DiscoverLoadErrorKind = "api_missing" | "backend_unreachable" | "backend_error";

export interface DiscoverLoadError {
  kind: DiscoverLoadErrorKind;
  title: string;
  message: string;
  detail?: string;
  status?: number;
}

export type DiscoverLoadResult =
  | { ok: true; data: DiscoverResponse }
  | { ok: false; error: DiscoverLoadError };

export const DISCOVER_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001/api";

export async function fetchListings(params: {
  q?: string;
  tag?: string;
  sort?: string;
}): Promise<DiscoverLoadResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.tag) qs.set("tag", params.tag);
  if (params.sort) qs.set("sort", params.sort);
  qs.set("limit", "50");

  const url = `${DISCOVER_BACKEND_URL}/market/listings?${qs}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "backend_unreachable",
        title: "Backend connection failed",
        message: "The Discovery page could not connect to the configured backend.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }

  if (res.status === 404) {
    return {
      ok: false,
      error: {
        kind: "api_missing",
        title: "Discovery API is missing",
        message: "The backend is reachable, but /api/market/listings was not found.",
        status: res.status,
      },
    };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      error: {
        kind: "backend_error",
        title: "Backend returned an error",
        message: "The Discovery API exists, but the backend failed while loading listings.",
        detail: detail.slice(0, 500),
        status: res.status,
      },
    };
  }

  try {
    return { ok: true, data: (await res.json()) as DiscoverResponse };
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "backend_error",
        title: "Backend returned invalid JSON",
        message: "The Discovery API responded, but the response could not be parsed.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
