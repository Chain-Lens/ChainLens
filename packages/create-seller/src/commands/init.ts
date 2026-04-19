import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface InitOptions {
  name: string;
  taskType: string;
  port: number;
  targetDir: string;
  force: boolean;
}

const VALID_TASK_TYPES = new Set([
  "blockscout_contract_source",
  "blockscout_tx_info",
  "defillama_tvl",
  "sourcify_verify",
  "chainlink_price_feed",
]);

const VALID_NAME = /^[a-z][a-z0-9-]{1,62}$/;

export function parseInitArgs(argv: string[]): InitOptions {
  let name: string | null = null;
  let taskType = "defillama_tvl";
  let port = 3000;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--task-type") {
      taskType = argv[++i] ?? "";
    } else if (arg === "--port") {
      port = Number(argv[++i] ?? "");
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(INIT_HELP);
    } else if (!arg.startsWith("-") && name === null) {
      name = arg;
    } else {
      throw new Error(`init: unexpected argument "${arg}"\n\n${INIT_HELP}`);
    }
  }

  if (!name) throw new Error(`init: <name> is required\n\n${INIT_HELP}`);
  if (!VALID_NAME.test(name)) {
    throw new Error(
      `init: name "${name}" is invalid — must be lowercase, start with a letter, 2-63 chars, [a-z0-9-]`,
    );
  }
  if (!VALID_TASK_TYPES.has(taskType)) {
    throw new Error(
      `init: --task-type must be one of:\n  ${[...VALID_TASK_TYPES].join("\n  ")}`,
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`init: --port must be an integer in [1, 65535]`);
  }

  return { name, taskType, port, targetDir: join(process.cwd(), name), force };
}

const INIT_HELP = `chainlens-seller init <name> [options]

Scaffolds a new seller project in ./<name>/.

Options:
  --task-type <id>   Task type the seller serves (default: defillama_tvl).
  --port <number>    Local dev port (default: 3000).
  --force            Overwrite existing directory.

Valid task types:
  blockscout_contract_source, blockscout_tx_info, defillama_tvl,
  sourcify_verify, chainlink_price_feed
`;

export function templateDir(): string {
  // Resolves to dist/templates/basic/ in published package, or src/templates/basic/ in dev.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "templates", "basic");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function renderTemplate(content: string, opts: InitOptions): string {
  return content
    .replaceAll("{{SELLER_NAME}}", opts.name)
    .replaceAll("{{TASK_TYPE}}", opts.taskType)
    .replaceAll("{{PORT}}", String(opts.port));
}

export async function scaffold(opts: InitOptions, source: string): Promise<string[]> {
  if (!opts.force && (await exists(opts.targetDir))) {
    throw new Error(
      `init: ${opts.targetDir} already exists — pass --force to overwrite`,
    );
  }
  await mkdir(opts.targetDir, { recursive: true });

  const written: string[] = [];
  await copyTree(source, opts.targetDir, opts, written);
  return written.sort();
}

async function copyTree(
  src: string,
  dst: string,
  opts: InitOptions,
  written: string[],
): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const dstName = entry.name.endsWith(".tmpl")
      ? entry.name.slice(0, -".tmpl".length)
      : entry.name;
    const dstPath = join(dst, dstName);

    if (entry.isDirectory()) {
      await mkdir(dstPath, { recursive: true });
      await copyTree(srcPath, dstPath, opts, written);
    } else {
      const raw = await readFile(srcPath, "utf8");
      const content = entry.name.endsWith(".tmpl") ? renderTemplate(raw, opts) : raw;
      await writeFile(dstPath, content, "utf8");
      written.push(relative(opts.targetDir, dstPath));
    }
  }
}

export async function initCommand(args: string[]): Promise<void> {
  const opts = parseInitArgs(args);
  const source = templateDir();
  if (!(await exists(source))) {
    throw new Error(`init: template not found at ${source} (run \`pnpm build\` first?)`);
  }

  process.stdout.write(
    `Scaffolding ${opts.name} (task_type=${opts.taskType}, port=${opts.port})\n`,
  );
  const files = await scaffold(opts, source);
  for (const f of files) process.stdout.write(`  + ${f}\n`);

  process.stdout.write(
    `\nDone. Next steps:\n` +
      `  cd ${opts.name}\n` +
      `  pnpm install\n` +
      `  pnpm dev            # local server on :${opts.port}\n` +
      `  # edit src/handler.ts\n` +
      `  npx @chainlens/create-seller deploy\n`,
  );
}
