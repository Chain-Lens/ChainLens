import {
  usdcToAtomic,
  atomicToUsdc,
  signReceiveWithAuthorization,
  CHAIN_LENS_MARKET_ADDRESSES,
} from "./eip3009.js";
import type { ChainLensConfig, CallOptions, CallResult, ListingInfo } from "./types.js";
import type { BudgetController } from "./budget.js";
import type { TelemetryRecorder } from "./telemetry.js";
import { hashParams } from "./telemetry.js";
import {
  ChainLensResolveError,
  BudgetExceededError,
  ChainLensSignError,
  ChainLensGatewayError,
  ChainLensCallError,
} from "./errors.js";

export async function fetchListingInfo(
  gatewayUrl: string,
  listingId: number,
): Promise<ListingInfo> {
  const res = await fetch(`${gatewayUrl}/v1/listings/${listingId}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ChainLensResolveError(
      `Failed to fetch listing ${listingId}: ${res.status} ${body}`,
    );
  }
  return res.json() as Promise<ListingInfo>;
}

export async function executeCall(
  cfg: ChainLensConfig & { gatewayUrl: string },
  budget: BudgetController,
  telemetry: TelemetryRecorder,
  listingId: number,
  params: unknown,
  options: CallOptions = {},
): Promise<CallResult> {
  const t0 = Date.now();

  // Step 1+2: Resolve listing and fetch pricing
  let listing: ListingInfo;
  try {
    listing = await fetchListingInfo(cfg.gatewayUrl, listingId);
  } catch (err) {
    throw err instanceof ChainLensResolveError
      ? err
      : new ChainLensResolveError(String(err));
  }

  const priceUsdc = listing.priceAtomic ? atomicToUsdc(listing.priceAtomic) : 0;
  const effectiveMaxUsdc = options.maxUsdc ?? priceUsdc;

  // Step 3+4: Budget checks — must happen before signing
  const budgetCheck = await budget.canSpend(effectiveMaxUsdc);
  if (!budgetCheck.ok) {
    throw new BudgetExceededError(budgetCheck.reason);
  }

  // Step 5: Sign EIP-3009 authorization
  const marketAddress = CHAIN_LENS_MARKET_ADDRESSES[cfg.chainId];
  if (!marketAddress) throw new ChainLensResolveError(`No market address for chainId=${cfg.chainId}`);
  const amountAtomic = usdcToAtomic(effectiveMaxUsdc);

  let auth: Awaited<ReturnType<typeof signReceiveWithAuthorization>>;
  try {
    auth = await signReceiveWithAuthorization({
      wallet: cfg.wallet,
      chainId: cfg.chainId,
      amount: amountAtomic,
      to: marketAddress,
      signal: options.signal,
    });
  } catch (err) {
    throw new ChainLensSignError(String(err), err);
  }

  // Step 6: POST /v1/call
  let res: Response;
  try {
    res = await fetch(`${cfg.gatewayUrl}/v1/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        listingId,
        params,
        auth: {
          buyer: auth.from,
          amount: auth.amount,
          validAfter: auth.validAfter,
          validBefore: auth.validBefore,
          nonce: auth.nonce,
          v: auth.v,
          r: auth.r,
          s: auth.s,
        },
      }),
    });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    await telemetry.record({
      ts: t0,
      listingId,
      amountUsdc: effectiveMaxUsdc,
      latencyMs,
      ok: false,
      failure: { kind: "unknown", hint: String(err) },
      paramsHash: hashParams(params),
    });
    throw new ChainLensGatewayError(`Network error: ${String(err)}`, 0, err);
  }

  const latencyMs = Date.now() - t0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await res.json().catch(() => null)) as any;

  // Step 8: On failure, record telemetry and throw typed error
  if (!res.ok || !body?.ok) {
    const failure = body?.failure ?? { kind: "unknown", hint: `HTTP ${res.status}` };
    await telemetry.record({
      ts: t0,
      listingId,
      amountUsdc: effectiveMaxUsdc,
      latencyMs,
      ok: false,
      failure,
      paramsHash: hashParams(params),
    });
    throw new ChainLensCallError(failure);
  }

  // Step 7: On success, debit budget and record telemetry
  const amountUsdc = body.amount ? atomicToUsdc(body.amount) : effectiveMaxUsdc;
  const feeUsdc = body.fee ? atomicToUsdc(body.fee) : 0;
  const netUsdc = body.net ? atomicToUsdc(body.net) : amountUsdc - feeUsdc;

  await budget.debit(amountUsdc, options.idempotencyKey);

  await telemetry.record({
    ts: t0,
    listingId,
    amountUsdc,
    latencyMs,
    ok: true,
    txHash: body.settlement?.txHash,
    paramsHash: hashParams(params),
  });

  return {
    ok: true,
    data: body.response,
    listingId,
    amountUsdc,
    feeUsdc,
    netUsdc,
    settlement: body.settlement,
    latencyMs,
    attemptIndex: 0,
  };
}
