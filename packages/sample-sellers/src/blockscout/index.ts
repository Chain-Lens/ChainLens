#!/usr/bin/env node
import { startSellerServer } from "../lib/server.js";
import {
  DEFAULT_BLOCKSCOUT_BASES,
  makeContractSourceHandler,
  makeTxInfoHandler,
} from "./handler.js";

const deps = {
  fetch: globalThis.fetch.bind(globalThis),
  baseUrlFor: (chainId: number) => DEFAULT_BLOCKSCOUT_BASES[chainId],
};

startSellerServer(
  {
    name: "blockscout-wrapper",
    handlers: {
      blockscout_contract_source: makeContractSourceHandler(deps),
      blockscout_tx_info: makeTxInfoHandler(deps),
    },
  },
  Number(process.env.PORT ?? 8081),
);
