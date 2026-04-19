import { spawn } from "node:child_process";
import { writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface DeployDeps {
  cwd: string;
  runCommand: (cmd: string, args: string[], opts: { cwd: string }) => Promise<SpawnResult>;
  writeFile: (path: string, content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  stderr: (msg: string) => void;
  stdout: (msg: string) => void;
}

export interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface DeployResult {
  url: string;
  statePath: string;
}

const STATE_FILE = ".chain-lens-deploy.json";

const URL_RE = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app/i;

export function extractDeploymentUrl(output: string): string | null {
  const match = output.match(URL_RE);
  return match ? match[0] : null;
}

export async function runDeploy(deps: DeployDeps): Promise<DeployResult> {
  await assertVercelPresent(deps);
  await assertVercelLoggedIn(deps);
  await assertInsideProject(deps);

  deps.stdout("Deploying to Vercel (production)…\n");
  const result = await deps.runCommand("vercel", ["--prod", "--yes"], { cwd: deps.cwd });
  if (result.code !== 0) {
    throw new Error(
      `vercel exited with code ${result.code}.\n${result.stderr || result.stdout}`,
    );
  }

  const url = extractDeploymentUrl(result.stdout) ?? extractDeploymentUrl(result.stderr);
  if (!url) {
    throw new Error(
      `Could not find a deployment URL in vercel output.\n${result.stdout}\n${result.stderr}`,
    );
  }

  const statePath = join(deps.cwd, STATE_FILE);
  const payload = JSON.stringify({ url, deployedAt: new Date().toISOString() }, null, 2) + "\n";
  await deps.writeFile(statePath, payload);

  deps.stdout(`\nDeployed: ${url}\n`);
  deps.stdout(`Saved to ${STATE_FILE}. Next: \`chain-lens-seller register ...\`\n`);
  return { url, statePath };
}

async function assertVercelPresent(deps: DeployDeps): Promise<void> {
  try {
    const r = await deps.runCommand("vercel", ["--version"], { cwd: deps.cwd });
    if (r.code !== 0) throw new Error("non-zero exit");
  } catch {
    throw new Error(
      `vercel CLI not found. Install with \`npm i -g vercel\` and run \`vercel login\`, then retry.`,
    );
  }
}

async function assertVercelLoggedIn(deps: DeployDeps): Promise<void> {
  const r = await deps.runCommand("vercel", ["whoami"], { cwd: deps.cwd });
  if (r.code !== 0) {
    throw new Error(
      `vercel is not logged in. Run \`vercel login\` in this shell, then retry \`chain-lens-seller deploy\`.`,
    );
  }
}

async function assertInsideProject(deps: DeployDeps): Promise<void> {
  try {
    const pkgJson = await deps.readFile(join(deps.cwd, "package.json"));
    JSON.parse(pkgJson);
  } catch {
    throw new Error(
      `deploy must be run inside a seller project (package.json not found in ${deps.cwd}).`,
    );
  }
}

export function spawnAsync(
  cmd: string,
  args: string[],
  opts: { cwd: string },
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      const s = chunk.toString();
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr?.on("data", (chunk) => {
      const s = chunk.toString();
      stderr += s;
      process.stderr.write(s);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

export async function deployCommand(args: string[]): Promise<void> {
  for (const a of args) {
    if (a === "--help" || a === "-h") {
      process.stdout.write(
        `chain-lens-seller deploy\n\nDeploys the current seller project to Vercel (production).\nWraps \`vercel --prod --yes\`. Requires \`vercel login\` once.\n`,
      );
      return;
    }
  }
  await runDeploy({
    cwd: process.cwd(),
    runCommand: spawnAsync,
    writeFile: (path, content) => writeFile(path, content, "utf8"),
    readFile: (path) => readFile(path, "utf8"),
    stdout: (m) => process.stdout.write(m),
    stderr: (m) => process.stderr.write(m),
  });
}

// Helper to check deploy state from other commands (register/status).
export async function readDeployState(cwd: string): Promise<{ url: string } | null> {
  const path = join(cwd, STATE_FILE);
  try {
    await stat(path);
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as { url?: unknown };
    return typeof parsed.url === "string" ? { url: parsed.url } : null;
  } catch {
    return null;
  }
}
