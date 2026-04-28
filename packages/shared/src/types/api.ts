export enum ApiStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  REVOKED = "REVOKED",
}

export interface ApiListing {
  id: string;
  onChainId: number | null;
  name: string;
  description: string;
  endpoint: string;
  price: string;
  category: string;
  sellerAddress: string;
  status: ApiStatus;
  exampleRequest?: Record<string, unknown> | null;
  exampleResponse?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiListingPublic extends Omit<ApiListing, "endpoint"> {}
