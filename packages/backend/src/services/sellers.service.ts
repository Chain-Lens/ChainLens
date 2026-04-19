export const SELLERS_DEFAULT_LIMIT = 20;
export const SELLERS_MAX_LIMIT = 100;

export interface SellerFilter {
  taskType?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface NormalizedSellerFilter {
  taskType?: string;
  activeOnly: boolean;
  limit: number;
  offset: number;
}

export interface SellerView {
  sellerAddress: `0x${string}`;
  name: string;
  endpointUrl: string;
  capabilities: string[];
  pricePerCall: string;
  metadataURI: string | null;
  status: string;
  jobsCompleted: number;
  jobsFailed: number;
  totalEarnings: string;
  createdAt: string;
  updatedAt: string;
}

export interface SellerListPage {
  items: SellerView[];
  limit: number;
  offset: number;
  total: number;
}

export interface SellersStore {
  list(filter: NormalizedSellerFilter): Promise<SellerListPage>;
}

export function normalizeSellerFilter(
  filter: SellerFilter,
): NormalizedSellerFilter {
  const limit = Math.min(
    Math.max(Math.floor(filter.limit ?? SELLERS_DEFAULT_LIMIT), 1),
    SELLERS_MAX_LIMIT,
  );
  const offset = Math.max(Math.floor(filter.offset ?? 0), 0);
  return {
    taskType: filter.taskType,
    activeOnly: filter.activeOnly ?? true,
    limit,
    offset,
  };
}

export async function listSellers(
  filter: SellerFilter,
  store: SellersStore,
): Promise<SellerListPage> {
  return store.list(normalizeSellerFilter(filter));
}
