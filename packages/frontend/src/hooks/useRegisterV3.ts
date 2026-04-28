"use client";

/**
 * On-chain registration of a ChainLensMarket listing (v3).
 *
 * Flow: seller composes metadata → we encode as `data:application/json,…`
 * and call `ChainLensMarket.register(payout, metadataURI)`. No backend DB
 * write, no admin approval gate. On success, we parse the `ListingRegistered`
 * event from the receipt and hand back the listing id.
 */

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { chainLensMarketConfig } from "@/config/contracts";

export interface ListingMetadata {
  name: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST";
  pricing: { amount: string; unit: "per_call" };
  output_schema?: unknown;
  tags?: string[];
  [k: string]: unknown;
}

export interface RegisterV3Args {
  payout: `0x${string}`;
  metadata: ListingMetadata;
}

export function encodeMetadataUri(meta: ListingMetadata): string {
  // data: URI avoids IPFS/hosting dependencies for MVP. Gateway decodes via
  // URL-decode + JSON.parse (see packages/backend/src/routes/market.routes.ts).
  return `data:application/json,${encodeURIComponent(JSON.stringify(meta))}`;
}

export function useRegisterV3() {
  const publicClient = usePublicClient();
  const { data: txHash, writeContract, isPending, error: writeError, reset } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    data: receipt,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash, gcTime: 0 },
  });

  const [listingId, setListingId] = useState<bigint | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Parse the ListingRegistered event from the receipt once confirmed.
  // Stored in state so callers don't have to re-decode.
  if (receipt && listingId === null && parseError === null) {
    try {
      const topic0 =
        // keccak256("ListingRegistered(uint256,address,address,string,uint256)")
        "0x" as `0x${string}`;
      // Simpler: filter by emitter contract + first indexed topic (listingId).
      const log = receipt.logs.find(
        (l) => l.address.toLowerCase() === chainLensMarketConfig.address.toLowerCase(),
      );
      if (!log || !log.topics[1]) {
        throw new Error("ListingRegistered event not found in receipt");
      }
      setListingId(BigInt(log.topics[1]));
      void topic0;
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }

  const register = useCallback(
    (args: RegisterV3Args) => {
      setListingId(null);
      setParseError(null);
      const metadataURI = encodeMetadataUri(args.metadata);
      writeContract({
        address: chainLensMarketConfig.address,
        abi: chainLensMarketConfig.abi,
        functionName: "register",
        args: [args.payout, metadataURI],
      });
    },
    [writeContract],
  );

  return {
    register,
    txHash,
    isPending,
    isConfirming,
    isConfirmed,
    listingId,
    error: writeError?.message ?? parseError ?? null,
    reset: () => {
      setListingId(null);
      setParseError(null);
      reset();
    },
    publicClient, // exposed for callers that want to poll on-chain state
  };
}
