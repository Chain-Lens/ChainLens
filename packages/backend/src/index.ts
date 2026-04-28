import app from "./app.js";
import { env } from "./config/env.js";
import { startMarketListener } from "./services/market-listener.service.js";
import { logger } from "./utils/logger.js";

async function main() {
  const port = Number(env.PORT);

  app.listen(port, () => {
    logger.info(`API Market Gateway listening on port ${port}`);
  });

  // v3 ChainLensMarket listener — mirrors ListingRegistered events into
  // the ApiListing table so the admin approval gate has rows to gate on.
  // Health probe at /api/health will report "unstarted" if this fails.
  try {
    startMarketListener();
  } catch (error) {
    logger.warn(
      { error },
      "market listener failed to start (ChainLensMarket may not be deployed for this chain)",
    );
  }
}

main().catch((err) => {
  logger.error(err, "Fatal error");
  process.exit(1);
});
