import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSellerFilter,
  listSellers,
  SELLERS_DEFAULT_LIMIT,
  SELLERS_MAX_LIMIT,
  type SellersStore,
  type SellerView,
  type NormalizedSellerFilter,
  type SellerListPage,
} from "./sellers.service.js";

describe("normalizeSellerFilter", () => {
  it("defaults activeOnly to true when not provided", () => {
    assert.equal(normalizeSellerFilter({}).activeOnly, true);
  });

  it("respects explicit activeOnly=false (show inactive sellers too)", () => {
    assert.equal(
      normalizeSellerFilter({ activeOnly: false }).activeOnly,
      false,
    );
  });

  it("clamps limit to [1, max] and floors decimals", () => {
    assert.equal(normalizeSellerFilter({ limit: 0 }).limit, 1);
    assert.equal(normalizeSellerFilter({ limit: 9999 }).limit, SELLERS_MAX_LIMIT);
    assert.equal(normalizeSellerFilter({ limit: 12.9 }).limit, 12);
    assert.equal(normalizeSellerFilter({}).limit, SELLERS_DEFAULT_LIMIT);
  });

  it("clamps negative offsets to 0", () => {
    assert.equal(normalizeSellerFilter({ offset: -5 }).offset, 0);
  });

  it("passes taskType through unchanged", () => {
    assert.equal(
      normalizeSellerFilter({ taskType: "blockscout_contract_source" }).taskType,
      "blockscout_contract_source",
    );
  });
});

describe("listSellers", () => {
  const SELLER: SellerView = {
    sellerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    name: "Blockscout Wrapper",
    endpointUrl: "https://example.com/api",
    capabilities: ["blockscout_contract_source"],
    pricePerCall: "0.050000",
    metadataURI: null,
    status: "active",
    jobsCompleted: 10,
    jobsFailed: 0,
    totalEarnings: "0.500000",
    createdAt: "2026-04-19T10:00:00.000Z",
    updatedAt: "2026-04-19T10:05:00.000Z",
  };

  it("delegates to the store with a normalized filter", async () => {
    const calls: NormalizedSellerFilter[] = [];
    const store: SellersStore = {
      async list(filter) {
        calls.push(filter);
        const page: SellerListPage = {
          items: [SELLER],
          limit: filter.limit,
          offset: filter.offset,
          total: 1,
        };
        return page;
      },
    };
    const out = await listSellers(
      { taskType: "blockscout_contract_source", limit: 500 },
      store,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].taskType, "blockscout_contract_source");
    assert.equal(calls[0].activeOnly, true);
    assert.equal(calls[0].limit, SELLERS_MAX_LIMIT);
    assert.equal(calls[0].offset, 0);
    assert.equal(out.total, 1);
    assert.equal(out.items[0].sellerAddress, SELLER.sellerAddress);
  });
});
