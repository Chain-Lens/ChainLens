#!/usr/bin/env node
// Copy src/templates → dist/templates after tsc (tsc itself skips non-ts files).
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src", "templates");
const dst = join(here, "..", "dist", "templates");

await rm(dst, { recursive: true, force: true });
await cp(src, dst, { recursive: true });
// eslint-disable-next-line no-console
console.log(`copied templates: ${src} -> ${dst}`);
