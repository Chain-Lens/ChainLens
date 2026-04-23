/**
 * One-shot script: rollup CallLog rows older than DEFAULT_RETAIN_DAYS into
 * CallLogDailyRollup, then delete the raw rows.
 *
 * Run manually or via cron:
 *   pnpm rollup-call-logs
 *
 * Cron example (daily at 02:00 UTC, from repo root):
 *   0 2 * * * cd /path/to/ChainLens/packages/backend && pnpm rollup-call-logs >> /var/log/chainlens-rollup.log 2>&1
 *
 * Requires DATABASE_URL in the environment (reads from .env via dotenv).
 */

import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import { rollupAndPruneCallLogs, DEFAULT_RETAIN_DAYS } from "../services/call-log.service.js";
import { logger } from "../utils/logger.js";

const retainDays = process.env.CALL_LOG_RETAIN_DAYS
  ? Number(process.env.CALL_LOG_RETAIN_DAYS)
  : DEFAULT_RETAIN_DAYS;

logger.info({ retainDays }, "call-log rollup starting");

rollupAndPruneCallLogs(retainDays)
  .then(({ rolledUp, pruned }) => {
    logger.info({ rolledUp, pruned }, "call-log rollup complete");
    process.exit(0);
  })
  .catch((err: unknown) => {
    logger.error({ err: String(err) }, "call-log rollup failed");
    process.exit(1);
  });
