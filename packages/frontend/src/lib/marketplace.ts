import type { ApiListingPublic } from "@chain-lens/shared";
import { mockApis } from "@/lib/mock-data";

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api";

type MarketplaceFilters = {
  category?: string;
  search?: string;
};

function filterMockApis(filters: MarketplaceFilters): ApiListingPublic[] {
  let filtered = mockApis;

  if (filters.category) {
    filtered = filtered.filter((api) => api.category === filters.category);
  }

  if (filters.search) {
    const query = filters.search.toLowerCase();
    filtered = filtered.filter(
      (api) =>
        api.name.toLowerCase().includes(query) ||
        api.description.toLowerCase().includes(query)
    );
  }

  return filtered;
}

export async function getMarketplaceApis(filters: MarketplaceFilters): Promise<{
  apis: ApiListingPublic[];
  isMock: boolean;
}> {
  const params = new URLSearchParams();

  if (filters.category) params.set("category", filters.category);
  if (filters.search) params.set("search", filters.search);

  const query = params.toString() ? `?${params.toString()}` : "";

  try {
    const res = await fetch(`${BASE_URL}/apis${query}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Failed to load APIs: ${res.status}`);
    }

    const apis = (await res.json()) as ApiListingPublic[];
    return { apis, isMock: false };
  } catch {
    return {
      apis: filterMockApis(filters),
      isMock: true,
    };
  }
}
