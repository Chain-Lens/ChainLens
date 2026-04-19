import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSellerApp } from "./server.js";
import { BadInputError, UpstreamError } from "./types.js";

async function post(app: ReturnType<typeof createSellerApp>, body: unknown) {
  const { default: http } = await import("node:http");
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}

describe("createSellerApp", () => {
  it("returns 400 when task_type is missing", async () => {
    const app = createSellerApp({ name: "test", handlers: { foo: async () => ({}) } });
    const { status, body } = await post(app, { inputs: {} });
    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, "missing_task_type");
  });

  it("returns 400 for unsupported task_type", async () => {
    const app = createSellerApp({ name: "test", handlers: {} });
    const { status, body } = await post(app, { task_type: "nope" });
    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, "unsupported_task_type");
  });

  it("dispatches to the right handler and returns JSON", async () => {
    const app = createSellerApp({
      name: "test",
      handlers: {
        echo: async (inputs) => ({ echoed: inputs }),
      },
    });
    const { status, body } = await post(app, {
      task_type: "echo",
      inputs: { hello: "world" },
    });
    assert.equal(status, 200);
    assert.deepEqual((body as { echoed: unknown }).echoed, { hello: "world" });
  });

  it("maps BadInputError to 400", async () => {
    const app = createSellerApp({
      name: "test",
      handlers: {
        bad: async () => {
          throw new BadInputError("missing x");
        },
      },
    });
    const { status, body } = await post(app, { task_type: "bad", inputs: {} });
    assert.equal(status, 400);
    assert.equal((body as { error: string }).error, "bad_input");
  });

  it("maps UpstreamError to its statusCode", async () => {
    const app = createSellerApp({
      name: "test",
      handlers: {
        fail: async () => {
          throw new UpstreamError("upstream dead", 503);
        },
      },
    });
    const { status, body } = await post(app, { task_type: "fail", inputs: {} });
    assert.equal(status, 503);
    assert.equal((body as { error: string }).error, "upstream_error");
  });
});
