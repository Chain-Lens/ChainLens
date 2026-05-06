import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import {
  ListingsSearchService,
  type ListingsSearchOptions,
  type GetListingsStatsFn,
} from "./listings-search.service.js";
import type {
  ListingsRepository,
  ApprovedListingRow,
  ListingsSearchFilter,
  ListingsOrder,
} from "../repositories/listing.repository.js";
import type { ListingStats } from "./call-log.service.js";

// ─── fakes ────────────────────────────────────────────────────────────
// The whole point of DIP here: tests instantiate the service with these
// fakes and never touch Prisma, the DB, or the call-log table.

class FakeRepo implements ListingsRepository {
  constructor(
    private readonly rows: ApprovedListingRow[],
    private readonly v3Total: number = rows.length,
  ) {}
  lastFilter?: ListingsSearchFilter;
  lastOrder?: ListingsOrder;
  async countV3() {
    return this.v3Total;
  }
  async findApproved(filter: ListingsSearchFilter, order: ListingsOrder) {
    this.lastFilter = filter;
    this.lastOrder = order;
    return this.rows;
  }
  async findApprovalStatus() {
    // The search service never reaches into approval-by-id; returning
    // null keeps the contract honest and surfaces accidental coupling.
    return null;
  }
  async findDirectoryTrust() {
    return null;
  }
}

function fakeStats(byId: Record<number, Partial<ListingStats>>): GetListingsStatsFn {
  return async (ids: number[]) => {
    const map = new Map<number, ListingStats>();
    for (const id of ids) {
      const partial = byId[id] ?? {};
      map.set(id, {
        successRate: 0,
        avgLatencyMs: 0,
        totalCalls: 0,
        successes: 0,
        lastCalledAt: null,
        windowDays: 30,
        ...partial,
      });
    }
    return map;
  };
}

function row(over: Partial<ApprovedListingRow> & { onChainId: number }): ApprovedListingRow {
  return {
    name: `Listing ${over.onChainId}`,
    description: "",
    endpoint: "https://example.test/api",
    price: "1000000",
    category: "general",
    sellerAddress: "0xseller",
    ...over,
  };
}

const baseOpts: ListingsSearchOptions = { sort: "score", limit: 20 };

// ─── tests ────────────────────────────────────────────────────────────

describe("ListingsSearchService", () => {
  test("score_strict sorts by score descending", async () => {
    const repo = new FakeRepo([row({ onChainId: 1 }), row({ onChainId: 2 }), row({ onChainId: 3 })]);
    const stats = fakeStats({
      1: { successRate: 0.5, totalCalls: 10, successes: 5 },
      2: { successRate: 0.9, totalCalls: 10, successes: 9 },
      3: { successRate: 0.7, totalCalls: 10, successes: 7 },
    });
    const svc = new ListingsSearchService(repo, stats);

    const result = await svc.search({ ...baseOpts, sort: "score_strict" });

    assert.deepEqual(
      result.items.map((it) => it.listingId),
      ["2", "3", "1"],
    );
    assert.equal(result.totalBeforeFilter, 3);
    assert.equal(result.total, 3);
  });

  test("minSuccessRate filters out low-rate listings before counting total", async () => {
    const repo = new FakeRepo([row({ onChainId: 1 }), row({ onChainId: 2 })]);
    const stats = fakeStats({
      1: { successRate: 0.2, totalCalls: 100, successes: 20 },
      2: { successRate: 0.95, totalCalls: 100, successes: 95 },
    });
    const svc = new ListingsSearchService(repo, stats);

    const result = await svc.search({ ...baseOpts, sort: "score_strict", minSuccessRate: 0.5 });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.listingId, "2");
    assert.equal(result.total, 1, "total reflects post-filter count");
    assert.equal(result.totalBeforeFilter, 2, "totalBeforeFilter reflects all V3 rows");
  });

  // NOTE: end-to-end seed determinism would require scoreListing to be
  // injectable too — it currently samples a Beta distribution off
  // Math.random, so identical inputs across two calls produce different
  // weights and therefore different shuffle orders even with the same
  // seed. The seed still makes the *shuffle* itself reproducible given
  // fixed weights, but exercising that requires stubbing scoreListing,
  // which is out of scope for this layer.

  test("filter is forwarded to the repository verbatim", async () => {
    const repo = new FakeRepo([]);
    const svc = new ListingsSearchService(repo, fakeStats({}));

    await svc.search({ ...baseOpts, q: "weather", tag: "geo", sort: "latest" });

    assert.deepEqual(repo.lastFilter, { q: "weather", tag: "geo" });
    assert.equal(repo.lastOrder, "latest", "latest sort hints repo to order by id desc");
  });

  test("limit clips items but `total` reports unclipped post-filter count", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ onChainId: i + 1 }));
    const svc = new ListingsSearchService(new FakeRepo(rows), fakeStats({}));

    const result = await svc.search({ ...baseOpts, limit: 2, sort: "score_strict" });

    assert.equal(result.items.length, 2);
    assert.equal(result.total, 5);
  });
});
