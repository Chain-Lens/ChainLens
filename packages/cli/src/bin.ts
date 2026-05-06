import { Command } from "commander";
import {
  ChainLens,
  atomicToUsdc,
  BudgetExceededError,
  ChainLensCallError,
  ProviderClient,
  type RankedListing,
} from "@chain-lens/sdk";
import { resolveWallet, resolveChainId } from "./wallet.js";
import { loadTelemetry, printReport } from "./report.js";
import { buildDebugSummary } from "./debug.js";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("chainlens")
  .description("ChainLens CLI — pay-and-call AI data APIs on Base")
  .version(VERSION);

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Print setup instructions for ChainLens CLI")
  .action(() => {
    console.log(`
ChainLens CLI Setup
═══════════════════

1. Set your wallet private key (local dev only):

   export WALLET_PRIVATE_KEY=0x<your-private-key>

   WARNING: Never commit or expose your private key.
   For production use, hardware wallet support is coming soon.

2. Set the target chain (optional, defaults to Base Sepolia):

   export CHAIN_ID=84532    # Base Sepolia (default)
   export CHAIN_ID=8453     # Base Mainnet

3. Set the gateway URL (optional):

   export CHAINLENS_GATEWAY=https://chainlens.pelicanlab.dev

4. Test your setup:

   chainlens estimate <listingId>

Wallet modes:
  ✓ env private key   — WALLET_PRIVATE_KEY (dev only)
  ○ keystore          — coming soon
  ○ injected wallet   — coming soon
`.trim());
  });

// ─── version ──────────────────────────────────────────────────────────────────

program
  .command("version")
  .description("Print CLI and SDK version")
  .action(() => {
    console.log(`chainlens ${VERSION}`);
  });

// ─── estimate ─────────────────────────────────────────────────────────────────

program
  .command("estimate <listingId>")
  .description("Fetch pricing and stats for a listing")
  .option("--gateway <url>", "Gateway URL")
  .action(async (listingIdStr: string, opts: { gateway?: string }) => {
    const listingId = Number(listingIdStr);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      console.error("Error: listingId must be a positive integer.");
      process.exit(1);
    }

    const gatewayUrl =
      opts.gateway ?? process.env["CHAINLENS_GATEWAY"] ?? "https://chainlens.pelicanlab.dev";

    try {
      const res = await fetch(`${gatewayUrl}/v1/listings/${listingId}`);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`Error: ${res.status} ${body}`);
        process.exit(1);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = (await res.json()) as any;
      const priceUsdc = info.priceAtomic ? atomicToUsdc(info.priceAtomic) : null;

      console.log(`Listing #${listingId}`);
      console.log(`  Name:        ${info.name ?? "(unnamed)"}`);
      console.log(`  Category:    ${info.taskCategory ?? "general"}`);
      console.log(
        `  Price:       ${priceUsdc != null ? `$${priceUsdc.toFixed(6)} USDC` : "(free/not set)"}`,
      );
      console.log(`  Max latency: ${info.maxLatencyMs ?? 5000} ms`);
      console.log(`  Active:      ${info.active}`);
    } catch (err) {
      console.error(`Error: ${String(err)}`);
      process.exit(1);
    }
  });

// ─── call ─────────────────────────────────────────────────────────────────────

program
  .command("call <listingId> [paramsJson]")
  .description("Call a listing and pay with USDC via EIP-3009")
  .option("--gateway <url>", "Gateway URL")
  .option("--max-usdc <amount>", "Per-call USDC cap override")
  .option("--idempotency-key <key>", "Idempotency key for dedup")
  .option("--json", "Output raw JSON response")
  .action(
    async (
      listingIdStr: string,
      paramsJsonStr: string | undefined,
      opts: {
        gateway?: string;
        maxUsdc?: string;
        idempotencyKey?: string;
        json?: boolean;
      },
    ) => {
      const listingId = Number(listingIdStr);
      if (!Number.isInteger(listingId) || listingId <= 0) {
        console.error("Error: listingId must be a positive integer.");
        process.exit(1);
      }

      let params: unknown = {};
      if (paramsJsonStr) {
        try {
          params = JSON.parse(paramsJsonStr);
        } catch {
          console.error("Error: paramsJson must be valid JSON.");
          process.exit(1);
        }
      }

      const chainId = resolveChainId();
      const wallet = resolveWallet(chainId);
      const gatewayUrl =
        opts.gateway ?? process.env["CHAINLENS_GATEWAY"] ?? "https://chainlens.pelicanlab.dev";

      const client = new ChainLens({
        gatewayUrl,
        wallet,
        chainId,
        telemetry: { enabled: true, upload: false },
        fallback: { enabled: false },
      });

      try {
        const result = await client.call(listingId, params, {
          maxUsdc: opts.maxUsdc ? Number(opts.maxUsdc) : undefined,
          idempotencyKey: opts.idempotencyKey,
        });

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(`✓ Call succeeded (${result.latencyMs} ms)`);
          console.log(`  Amount: $${result.amountUsdc.toFixed(6)} USDC`);
          console.log(`  Fee:    $${result.feeUsdc.toFixed(6)} USDC`);
          console.log(`  Net:    $${result.netUsdc.toFixed(6)} USDC`);
          console.log(`  TxHash: ${result.settlement.txHash}`);
          console.log(`\nResponse:`);
          console.log(JSON.stringify(result.data, null, 2));
        }
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          console.error(`Budget exceeded: ${err.reason}`);
        } else if (err instanceof ChainLensCallError) {
          console.error(`Call failed: ${err.failure.kind} — ${err.failure.hint}`);
        } else {
          console.error(`Error: ${String(err)}`);
        }
        process.exit(1);
      }
    },
  );

// ─── report ───────────────────────────────────────────────────────────────────

program
  .command("report")
  .description("Show local telemetry report")
  .option("--gateway <url>", "Gateway URL (for resolving wallet address)")
  .action(async () => {
    const chainId = resolveChainId();
    let walletAddress: string;
    try {
      const wallet = resolveWallet(chainId);
      walletAddress = await wallet.address();
    } catch {
      console.log("No telemetry recorded yet. (No wallet configured.)");
      process.exit(0);
    }

    const entries = await loadTelemetry(walletAddress);
    printReport(entries);
  });

// ─── recommend ────────────────────────────────────────────────────────────────

program
  .command("recommend <task>")
  .description("Get ranked provider recommendations for a task")
  .option("--gateway <url>", "Gateway URL")
  .option("--max <n>", "Max results (default: 5)", "5")
  .action(async (task: string, opts: { gateway?: string; max: string }) => {
    const gatewayUrl =
      opts.gateway ?? process.env["CHAINLENS_GATEWAY"] ?? "https://chainlens.pelicanlab.dev";
    const maxResults = Math.max(1, Math.min(20, Number(opts.max) || 5));

    try {
      const res = await fetch(`${gatewayUrl}/v1/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, maxResults }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`Error: ${res.status} ${body}`);
        process.exit(1);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      const listings: RankedListing[] = data.listings ?? [];

      if (listings.length === 0) {
        console.log("No providers found for that task.");
        process.exit(0);
      }

      console.log("Recommended providers\n");
      for (let i = 0; i < listings.length; i++) {
        const l = listings[i]!;
        const costStr =
          l.stats.avgCostUsdc > 0 ? `$${l.stats.avgCostUsdc.toFixed(6)}` : "free";
        const idLabel = l.listingId === null ? "external" : `#${l.listingId}`;
        const sourceLabel =
          l.source === "chainlens"
            ? "ChainLens verified"
            : l.source === "coinbase_bazaar"
              ? "Coinbase Bazaar"
              : "fixture fallback";
        console.log(`${i + 1}. ${idLabel} ${l.name ?? "(unnamed)"}`);
        console.log(`   source:   ${sourceLabel}`);
        console.log(`   verified: ${l.verifiedByChainLens ? "yes" : "not yet"}`);
        console.log(`   score:    ${l.score.toFixed(2)}`);
        console.log(`   success:  ${(l.stats.successRate * 100).toFixed(1)}%`);
        console.log(`   p50:      ${l.stats.p50LatencyMs} ms`);
        console.log(`   avg cost: ${costStr}`);
        if (l.resource) console.log(`   resource: ${l.resource}`);
        if (l.network) console.log(`   network:  ${l.network}`);
        if (l.reasons.length > 0) {
          console.log(`   why:      ${l.reasons[0]}`);
          for (const r of l.reasons.slice(1)) console.log(`             ${r}`);
        }
        console.log();
      }
    } catch (err) {
      console.error(`Error: ${String(err)}`);
      process.exit(1);
    }
  });

// ─── claim ────────────────────────────────────────────────────────────────────

program
  .command("claim")
  .description("Claim accumulated USDC earnings as a provider")
  .option("--gateway <url>", "Gateway URL")
  .action(async (opts: { gateway?: string }) => {
    const chainId = resolveChainId();
    const wallet = resolveWallet(chainId);
    const gatewayUrl =
      opts.gateway ?? process.env["CHAINLENS_GATEWAY"] ?? "https://chainlens.pelicanlab.dev";

    const provider = new ProviderClient(gatewayUrl, wallet);

    try {
      const result = await provider.claim();
      if ("skipped" in result) {
        console.log("Nothing to claim — balance is zero.");
        process.exit(0);
      }
      console.log(`✓ Claimed. TxHash: ${result.txHash}`);
    } catch (err) {
      console.error(`Error: ${String(err)}`);
      process.exit(1);
    }
  });

// ─── listing ──────────────────────────────────────────────────────────────────

program
  .command("listing <listingId>")
  .description("Show dashboard for a listing you own")
  .option("--gateway <url>", "Gateway URL")
  .action(async (listingIdStr: string, opts: { gateway?: string }) => {
    const listingId = Number(listingIdStr);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      console.error("Error: listingId must be a positive integer.");
      process.exit(1);
    }

    const chainId = resolveChainId();
    const wallet = resolveWallet(chainId);
    const gatewayUrl =
      opts.gateway ?? process.env["CHAINLENS_GATEWAY"] ?? "https://chainlens.pelicanlab.dev";

    const provider = new ProviderClient(gatewayUrl, wallet);

    try {
      const dashboard = await provider.listingDashboard(listingId);
      console.log(`Listing #${dashboard.listingId} — ${dashboard.name ?? "(unnamed)"}`);
      console.log(`  Total earned:  $${dashboard.totalEarnedUsdc.toFixed(6)} USDC`);
      console.log(`  Claimable:     $${dashboard.claimableUsdc.toFixed(6)} USDC`);
      console.log(`  Calls:         ${dashboard.callCount}`);
      console.log(`  Success rate:  ${(dashboard.successRate * 100).toFixed(1)}%`);
      console.log(`  p50 latency:   ${dashboard.p50LatencyMs} ms`);
    } catch (err) {
      console.error(`Error: ${String(err)}`);
      process.exit(1);
    }
  });

// ─── debug ────────────────────────────────────────────────────────────────────

program
  .command("debug")
  .description("Show a debug trace from local telemetry")
  .option("--listing <id>", "Filter by listing ID")
  .action(async (opts: { listing?: string }) => {
    const chainId = resolveChainId();
    let walletAddress: string;
    try {
      const wallet = resolveWallet(chainId);
      walletAddress = await wallet.address();
    } catch {
      console.log("No telemetry recorded yet. (No wallet configured.)");
      process.exit(0);
    }

    const listingFilter = opts.listing != null ? Number(opts.listing) : undefined;
    const entries = await loadTelemetry(walletAddress);
    const summary = buildDebugSummary(entries, listingFilter);
    console.log(summary);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(String(err));
  process.exit(1);
});
