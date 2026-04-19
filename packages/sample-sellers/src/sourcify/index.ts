#!/usr/bin/env node
import { startSellerServer } from "../lib/server.js";
import { DEFAULT_SOURCIFY_BASE, makeVerifyHandler } from "./handler.js";

const deps = {
  fetch: globalThis.fetch.bind(globalThis),
  baseUrl: process.env.SOURCIFY_BASE_URL ?? DEFAULT_SOURCIFY_BASE,
};

startSellerServer(
  {
    name: "sourcify-wrapper",
    handlers: {
      sourcify_verify: makeVerifyHandler(deps),
    },
  },
  Number(process.env.PORT ?? 8083),
);
