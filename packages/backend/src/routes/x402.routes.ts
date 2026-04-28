import { Router, Request, Response, NextFunction } from "express";
import { parseSignature, getAddress } from "viem";
import prisma from "../config/prisma.js";
import { handlePaidListingCall, parsePayment, type PaymentAuth } from "./market.routes.js";
import {
  marketAddress,
  readListing,
  resolveMetadata,
  usdcAddress,
} from "../services/market-chain.service.js";
import { publicClient } from "../config/viem.js";

const router = Router();

const X_PAYMENT_HEADER = "x-payment";

function decodeHeaderJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);

  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function coercePayment(raw: unknown): PaymentAuth {
  if (!raw || typeof raw !== "object") return parsePayment(raw);
  const obj = raw as Record<string, unknown>;

  if ("payment" in obj) return parsePayment(obj["payment"]);
  if ("buyer" in obj) return parsePayment(obj);

  const payload = obj["payload"];
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const authorization = p["authorization"];
    const signature = p["signature"];
    if (authorization && typeof authorization === "object") {
      const auth = authorization as Record<string, unknown>;
      const sig =
        typeof signature === "string"
          ? parseSignature(signature as `0x${string}`)
          : signature && typeof signature === "object"
            ? (signature as { v?: unknown; r?: unknown; s?: unknown })
            : null;

      if (sig) {
        return parsePayment({
          buyer: auth["from"],
          amount: auth["value"],
          validAfter: auth["validAfter"],
          validBefore: auth["validBefore"],
          nonce: auth["nonce"],
          v:
            typeof sig.v === "bigint"
              ? Number(sig.v)
              : typeof sig.v === "number"
                ? sig.v
                : undefined,
          r: sig.r,
          s: sig.s,
        });
      }
    }
  }

  return parsePayment(raw);
}

function queryInputs(req: Request): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "payment" || key === "x402") continue;
    if (typeof value === "string") {
      inputs[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      inputs[key] = value[0];
    }
  }
  return inputs;
}

async function paymentRequirements(listingId: bigint) {
  const approval = await prisma.apiListing.findUnique({
    where: {
      contractVersion_onChainId: {
        contractVersion: "V3",
        onChainId: Number(listingId),
      },
    },
    select: { status: true },
  });
  if (!approval || approval.status !== "APPROVED") {
    return {
      status: 403,
      body: {
        error: "listing not approved for execution",
        adminStatus: approval?.status ?? "UNLISTED",
      },
    } as const;
  }

  const listing = await readListing(listingId);
  if (!listing.active) {
    return {
      status: 410,
      body: { error: "listing inactive" },
    } as const;
  }

  const metadata = await resolveMetadata(listing.metadataURI);
  const amount =
    typeof metadata.pricing?.amount === "string" && /^\d+$/.test(metadata.pricing.amount)
      ? metadata.pricing.amount
      : "0";
  const chainId = publicClient.chain?.id ?? 84532;
  const market = marketAddress();
  const usdc = usdcAddress();

  return {
    status: 402,
    body: {
      x402Version: 1,
      error: "payment required",
      accepts: [
        {
          scheme: "exact",
          network: chainId === 8453 ? "base" : "base-sepolia",
          resource: `/api/x402/${listingId.toString()}`,
          payTo: market,
          asset: usdc,
          maxAmountRequired: amount,
          mimeType: "application/json",
          extra: {
            name: "ChainLens v3 x402",
            listingId: listingId.toString(),
            seller: getAddress(listing.owner),
            description: metadata.description ?? metadata.name ?? "ChainLens listing",
            eip712: {
              domain: {
                name: "USDC",
                version: "2",
                chainId,
                verifyingContract: usdc,
              },
              primaryType: "ReceiveWithAuthorization",
              message: {
                to: market,
                value: amount,
                validAfter: "0",
                validBefore: "<unix timestamp>",
                nonce: "<32-byte hex>",
              },
            },
          },
        },
      ],
    },
  } as const;
}

router.get("/:listingId", async (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  const listingIdStr = req.params["listingId"] as string;
  if (!/^\d+$/.test(listingIdStr)) {
    res.status(400).json({ error: "listingId must be decimal" });
    return;
  }

  const header = req.header(X_PAYMENT_HEADER);
  if (!header) {
    try {
      const requirements = await paymentRequirements(BigInt(listingIdStr));
      res.status(requirements.status).json(requirements.body);
    } catch (err) {
      next(err);
    }
    return;
  }

  let payment: PaymentAuth;
  try {
    payment = coercePayment(decodeHeaderJson(header));
  } catch (err) {
    res.status(400).json({
      error: "invalid x-payment header",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  await handlePaidListingCall({
    listingIdStr,
    inputs: queryInputs(req),
    payment,
    res,
    next,
    startedAt,
  });
});

export default router;
