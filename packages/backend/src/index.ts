import app from "./app.js";
import { env } from "./config/env.js";
import { publicClient } from "./config/viem.js";
import { startEventListener } from "./services/event-listener.service.js";
import { startV2EventListener } from "./services/v2-event-listener.service.js";
import { startMarketListener } from "./services/market-listener.service.js";
import { prismaEvidenceStore } from "./services/evidence-store.js";
import { logger } from "./utils/logger.js";
import { CONTRACT_ADDRESSES_V2 } from "@chain-lens/shared";

async function main() {
  const port = Number(env.PORT);

  app.listen(port, () => {
    logger.info(`API Market Gateway listening on port ${port}`);
  });

  try {
    await startEventListener();
  } catch (error) {
    logger.warn(
      { error },
      "v1 event listener failed to start (contract may not be deployed yet)"
    );
  }

  try {
    const chainId = publicClient.chain?.id;
    if (chainId === undefined) throw new Error("publicClient.chain not configured");
    const escrowAddress = CONTRACT_ADDRESSES_V2[chainId];
    if (!escrowAddress || escrowAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error(`ApiMarketEscrowV2 not deployed for chainId=${chainId}`);
    }
    startV2EventListener({
      chainId,
      publicClient,
      deps: {
        store: prismaEvidenceStore,
        platformUrl: env.PLATFORM_URL,
        escrowAddress,
        logger,
      },
    });
  } catch (error) {
    logger.warn(
      { error },
      "v2 event listener failed to start (contracts may not be deployed yet)"
    );
  }

  // v3 ChainLensMarket listener — mirrors ListingRegistered events into
  // the ApiListing table so the admin approval gate has rows to gate on.
  // Health probe at /api/health will report "unstarted" if this fails.
  try {
    startMarketListener();
  } catch (error) {
    logger.warn(
      { error },
      "market listener failed to start (ChainLensMarket may not be deployed for this chain)"
    );
  }
}

main().catch((err) => {
  logger.error(err, "Fatal error");
  process.exit(1);
});
