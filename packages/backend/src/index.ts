import app from "./app.js";
import { env } from "./config/env.js";
import { publicClient } from "./config/viem.js";
import { startEventListener } from "./services/event-listener.service.js";
import { startV2EventListener } from "./services/v2-event-listener.service.js";
import { prismaEvidenceStore } from "./services/evidence-store.js";
import { logger } from "./utils/logger.js";

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
    startV2EventListener({
      chainId,
      publicClient,
      deps: {
        store: prismaEvidenceStore,
        platformUrl: env.PLATFORM_URL,
        logger,
      },
    });
  } catch (error) {
    logger.warn(
      { error },
      "v2 event listener failed to start (contracts may not be deployed yet)"
    );
  }
}

main().catch((err) => {
  logger.error(err, "Fatal error");
  process.exit(1);
});
