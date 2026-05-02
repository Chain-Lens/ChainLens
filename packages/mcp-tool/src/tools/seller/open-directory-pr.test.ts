import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDirectoryPrHandler, type OpenDirectoryPrDeps } from "./open-directory-pr.js";

type Route = (url: string, init?: RequestInit) => { status: number; body: unknown };

function makeDeps(route: Route): OpenDirectoryPrDeps & { calls: Array<{ url: string; method: string; body: unknown }> } {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method, body });
    const { status, body: resBody } = route(url, init);
    return new Response(JSON.stringify(resBody), { status });
  }) as typeof fetch;
  return { token: "tok", repoOwner: "owner", repoName: "repo", fetch: fetchFn, calls };
}

const fakeProviderJson = {
  name: "Test Provider",
  slug: "test-provider",
  description: "A test provider.",
  category: "rpc",
  added_date: "2026-05-02",
  last_verified: "2026-05-02",
  website: "https://test.example.com",
  source_attestation: "https://github.com/test",
};

function defaultRoute(url: string, init?: RequestInit): { status: number; body: unknown } {
  if (url.endsWith("/repos/owner/repo") && (!init?.method || init.method === "GET")) {
    return { status: 200, body: { default_branch: "main" } };
  }
  if (url.includes("/git/ref/heads/main")) {
    return { status: 200, body: { object: { sha: "abc123" } } };
  }
  if (url.includes("/git/refs") && init?.method === "POST") {
    return { status: 201, body: { ref: "refs/heads/new-branch" } };
  }
  if (url.includes("/contents/providers/") && (!init?.method || init.method === "GET")) {
    return { status: 404, body: { message: "Not Found" } };
  }
  if (url.includes("/contents/providers/") && init?.method === "PUT") {
    return { status: 201, body: { content: { sha: "newsha" } } };
  }
  if (url.includes("/pulls") && (!init?.method || init.method === "GET")) {
    return { status: 200, body: [] }; // no existing PR
  }
  if (url.includes("/pulls") && init?.method === "POST") {
    return { status: 201, body: { html_url: "https://github.com/owner/repo/pull/1", number: 1 } };
  }
  return { status: 404, body: { message: "Unexpected call" } };
}

describe("openDirectoryPrHandler", () => {
  it("creates branch, writes file, and opens PR", async () => {
    const deps = makeDeps(defaultRoute);
    const result = await openDirectoryPrHandler(
      { provider_entries: [{ slug: "test-provider", provider_json: fakeProviderJson }] },
      deps,
    );

    assert.equal(result.pr_url, "https://github.com/owner/repo/pull/1");
    assert.ok(result.branch.includes("test-provider"));
    assert.deepEqual(result.files_written, ["providers/test-provider.json"]);
    assert.ok(result.diff_summary.includes("providers/test-provider.json"));
    assert.equal(result.warnings.length, 0);
  });

  it("uses provided branch_name and pr_title", async () => {
    const deps = makeDeps(defaultRoute);
    const result = await openDirectoryPrHandler(
      {
        provider_entries: [{ slug: "test-provider", provider_json: fakeProviderJson }],
        branch_name: "feature/my-branch",
        pr_title: "Custom PR Title",
      },
      deps,
    );

    assert.equal(result.branch, "feature/my-branch");
    const prCall = deps.calls.find((c) => c.method === "POST" && (c.url as string).includes("/pulls"));
    assert.ok(prCall);
    assert.equal((prCall.body as { title: string }).title, "Custom PR Title");
  });

  it("marks existing file as update (M) vs new file (A)", async () => {
    const deps = makeDeps((url, init) => {
      if (url.includes("/contents/providers/") && (!init?.method || init.method === "GET")) {
        return { status: 200, body: { sha: "existingsha", content: "", encoding: "base64" } };
      }
      return defaultRoute(url, init);
    });
    const result = await openDirectoryPrHandler(
      { provider_entries: [{ slug: "test-provider", provider_json: fakeProviderJson }] },
      deps,
    );
    assert.ok(result.diff_summary.startsWith("M "));
  });

  it("returns existing PR URL when PR already open", async () => {
    const deps = makeDeps((url, init) => {
      if (url.includes("/pulls") && (!init?.method || init.method === "GET")) {
        return {
          status: 200,
          body: [{ html_url: "https://github.com/owner/repo/pull/99", number: 99 }],
        };
      }
      return defaultRoute(url, init);
    });
    const result = await openDirectoryPrHandler(
      { provider_entries: [{ slug: "test-provider", provider_json: fakeProviderJson }] },
      deps,
    );
    assert.equal(result.pr_url, "https://github.com/owner/repo/pull/99");
  });

  it("throws when provider_entries is empty", async () => {
    const deps = makeDeps(defaultRoute);
    await assert.rejects(
      openDirectoryPrHandler({ provider_entries: [] }, deps),
      /at least one/,
    );
  });

  it("throws on invalid slug (Phase B rejects, not warns)", async () => {
    const deps = makeDeps(defaultRoute);
    await assert.rejects(
      openDirectoryPrHandler(
        { provider_entries: [{ slug: "Bad Slug!", provider_json: fakeProviderJson }] },
        deps,
      ),
      /invalid/,
    );
  });

  it("throws when branch_name matches the default branch", async () => {
    const deps = makeDeps(defaultRoute);
    await assert.rejects(
      openDirectoryPrHandler(
        {
          provider_entries: [{ slug: "test-provider", provider_json: fakeProviderJson }],
          branch_name: "main",
        },
        deps,
      ),
      /default branch/,
    );
  });

  it("throws when provider_json.slug does not match entry.slug", async () => {
    const deps = makeDeps(defaultRoute);
    await assert.rejects(
      openDirectoryPrHandler(
        {
          provider_entries: [
            {
              slug: "test-provider",
              provider_json: { ...fakeProviderJson, slug: "different-slug" },
            },
          ],
        },
        deps,
      ),
      /does not match/,
    );
  });
});
