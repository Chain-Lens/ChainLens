import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseInitArgs, renderTemplate, scaffold, templateDir } from "./init.js";

test("parseInitArgs: defaults", () => {
  const o = parseInitArgs(["my-seller"]);
  assert.equal(o.name, "my-seller");
  assert.equal(o.taskType, "defillama_tvl");
  assert.equal(o.port, 3000);
  assert.equal(o.force, false);
});

test("parseInitArgs: flags", () => {
  const o = parseInitArgs(["xy","--task-type", "blockscout_tx_info", "--port", "8082", "--force"]);
  assert.equal(o.taskType, "blockscout_tx_info");
  assert.equal(o.port, 8082);
  assert.equal(o.force, true);
});

test("parseInitArgs: rejects missing name", () => {
  assert.throws(() => parseInitArgs([]), /<name> is required/);
});

test("parseInitArgs: rejects bad name", () => {
  assert.throws(() => parseInitArgs(["Bad Name"]), /name "Bad Name" is invalid/);
  assert.throws(() => parseInitArgs(["1seller"]), /invalid/);
});

test("parseInitArgs: rejects unknown task type", () => {
  assert.throws(() => parseInitArgs(["xy","--task-type", "bogus"]), /task-type must be one of/);
});

test("parseInitArgs: rejects bad port", () => {
  assert.throws(() => parseInitArgs(["xy","--port", "70000"]), /--port must be an integer/);
  assert.throws(() => parseInitArgs(["xy","--port", "abc"]), /--port must be an integer/);
});

test("renderTemplate: replaces all placeholders", () => {
  const tpl = "name={{SELLER_NAME}} type={{TASK_TYPE}} port={{PORT}} repeat={{SELLER_NAME}}";
  const out = renderTemplate(tpl, {
    name: "foo",
    taskType: "defillama_tvl",
    port: 8080,
    targetDir: "",
    force: false,
  });
  assert.equal(out, "name=foo type=defillama_tvl port=8080 repeat=foo");
});

test("scaffold: writes tree with placeholders replaced and strips .tmpl", async () => {
  const dir = await mkdtemp(join(tmpdir(), "create-seller-"));
  try {
    const target = join(dir, "my-seller");
    const files = await scaffold(
      {
        name: "my-seller",
        taskType: "defillama_tvl",
        port: 9999,
        targetDir: target,
        force: false,
      },
      templateDir(),
    );

    assert.ok(files.includes("package.json"), "package.json should exist (tmpl stripped)");
    assert.ok(files.includes("src/handler.ts"), "src/handler.ts should exist");
    assert.ok(files.includes("src/errors.ts"), "src/errors.ts should exist (not a template)");
    assert.ok(files.includes("src/server.ts"), "src/server.ts should exist (Vercel entry)");
    assert.ok(files.includes("src/dev.ts"), "src/dev.ts should exist (local dev entry)");

    const pkg = await readFile(join(target, "package.json"), "utf8");
    assert.match(pkg, /"name": "my-seller"/);
    assert.match(pkg, /ChainLens seller for defillama_tvl/);

    const dev = await readFile(join(target, "src/dev.ts"), "utf8");
    assert.match(dev, /process\.env\.PORT \?\? 9999/);
    assert.match(dev, /\[my-seller\] listening/);

    const server = await readFile(join(target, "src/server.ts"), "utf8");
    assert.match(server, /export default app/);

    const handler = await readFile(join(target, "src/handler.ts"), "utf8");
    assert.match(handler, /task_type: "defillama_tvl"/);
    assert.doesNotMatch(handler, /\{\{/, "all placeholders should be substituted");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scaffold: refuses to overwrite without --force", async () => {
  const dir = await mkdtemp(join(tmpdir(), "create-seller-"));
  try {
    const target = join(dir, "my-seller");
    await scaffold(
      { name: "my-seller", taskType: "defillama_tvl", port: 3000, targetDir: target, force: false },
      templateDir(),
    );
    await assert.rejects(
      scaffold(
        { name: "my-seller", taskType: "defillama_tvl", port: 3000, targetDir: target, force: false },
        templateDir(),
      ),
      /already exists/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
