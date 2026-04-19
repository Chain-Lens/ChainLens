#!/usr/bin/env node
import { startSellerServer } from "../lib/server.js";
import { DEFAULT_DEFILLAMA_BASE, makeTvlHandler } from "./handler.js";

const deps = {
  fetch: globalThis.fetch.bind(globalThis),
  baseUrl: process.env.DEFILLAMA_BASE_URL ?? DEFAULT_DEFILLAMA_BASE,
};

startSellerServer(
  {
    name: "defillama-wrapper",
    handlers: {
      defillama_tvl: makeTvlHandler(deps),
    },
  },
  Number(process.env.PORT ?? 8082),
);
