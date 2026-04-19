import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractDeploymentUrl, readDeployState, runDeploy, type DeployDeps, type SpawnResult } from "./deploy.js";

test("extractDeploymentUrl: finds vercel URL in mixed output", () => {
  const out = [
    "Vercel CLI 34.0.0",
    "🔍  Inspect: https://vercel.com/jane/my-seller/ABC",
    "✅  Production: https://my-seller-xyz.vercel.app [10s]",
    "",
  ].join("\n");
  assert.equal(extractDeploymentUrl(out), "https://my-seller-xyz.vercel.app");
});

test("extractDeploymentUrl: returns null on non-match", () => {
  assert.equal(extractDeploymentUrl("no urls here"), null);
});

function fakeDeps(overrides: Partial<DeployDeps> & { cwd: string }): DeployDeps {
  const writes: Array<{ path: string; content: string }> = [];
  const base: DeployDeps = {
    cwd: overrides.cwd,
    runCommand: overrides.runCommand ?? (async () => ({ code: 0, stdout: "", stderr: "" })),
    writeFile: overrides.writeFile ?? (async (path, content) => {
      writes.push({ path, content });
    }),
    readFile: overrides.readFile ?? (async () => `{"name":"x"}`),
    stdout: overrides.stdout ?? (() => {}),
    stderr: overrides.stderr ?? (() => {}),
  };
  // expose writes for assertions via a non-enumerable attachment
  (base as unknown as { _writes: typeof writes })._writes = writes;
  return base;
}

test("runDeploy: writes state file with extracted URL on success", async () => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const deps = fakeDeps({
    cwd: "/tmp/fake-seller",
    runCommand: async (cmd, args): Promise<SpawnResult> => {
      calls.push({ cmd, args });
      if (args[0] === "--version") return { code: 0, stdout: "34.0.0\n", stderr: "" };
      return {
        code: 0,
        stdout: "Production: https://my-seller-abc.vercel.app\n",
        stderr: "",
      };
    },
  });

  const result = await runDeploy(deps);
  assert.equal(result.url, "https://my-seller-abc.vercel.app");
  assert.equal(result.statePath, "/tmp/fake-seller/.chainlens-deploy.json");

  assert.deepEqual(calls[0], { cmd: "vercel", args: ["--version"] });
  assert.deepEqual(calls[1], { cmd: "vercel", args: ["--prod", "--yes"] });

  const writes = (deps as unknown as { _writes: Array<{ path: string; content: string }> })._writes;
  assert.equal(writes.length, 1);
  assert.match(writes[0].content, /"url": "https:\/\/my-seller-abc.vercel.app"/);
  assert.match(writes[0].content, /"deployedAt":/);
});

test("runDeploy: throws if vercel CLI missing", async () => {
  const deps = fakeDeps({
    cwd: "/tmp/fake-seller",
    runCommand: async () => {
      throw new Error("ENOENT");
    },
  });
  await assert.rejects(runDeploy(deps), /vercel CLI not found/);
});

test("runDeploy: throws if not in a project", async () => {
  const deps = fakeDeps({
    cwd: "/tmp/fake-seller",
    runCommand: async (_cmd, args) =>
      args[0] === "--version" ? { code: 0, stdout: "34\n", stderr: "" } : { code: 0, stdout: "", stderr: "" },
    readFile: async () => {
      throw new Error("ENOENT");
    },
  });
  await assert.rejects(runDeploy(deps), /must be run inside a seller project/);
});

test("runDeploy: throws if vercel exits non-zero", async () => {
  const deps = fakeDeps({
    cwd: "/tmp/fake-seller",
    runCommand: async (_cmd, args): Promise<SpawnResult> => {
      if (args[0] === "--version") return { code: 0, stdout: "34\n", stderr: "" };
      return { code: 1, stdout: "", stderr: "Not logged in" };
    },
  });
  await assert.rejects(runDeploy(deps), /vercel exited with code 1/);
});

test("runDeploy: throws if URL not parseable from output", async () => {
  const deps = fakeDeps({
    cwd: "/tmp/fake-seller",
    runCommand: async (_cmd, args): Promise<SpawnResult> => {
      if (args[0] === "--version") return { code: 0, stdout: "34\n", stderr: "" };
      return { code: 0, stdout: "weird success\n", stderr: "" };
    },
  });
  await assert.rejects(runDeploy(deps), /Could not find a deployment URL/);
});

test("readDeployState: round-trips through a real file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "deploy-state-"));
  try {
    await writeFile(
      join(dir, ".chainlens-deploy.json"),
      JSON.stringify({ url: "https://x.vercel.app", deployedAt: "2026-04-19T00:00:00Z" }),
    );
    const state = await readDeployState(dir);
    assert.equal(state?.url, "https://x.vercel.app");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readDeployState: returns null when file is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "deploy-state-"));
  try {
    assert.equal(await readDeployState(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readDeployState: returns null when file is malformed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "deploy-state-"));
  try {
    await writeFile(join(dir, ".chainlens-deploy.json"), "not json");
    assert.equal(await readDeployState(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
