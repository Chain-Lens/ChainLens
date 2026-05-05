import { homedir } from "node:os";
import { join } from "node:path";
import type { BudgetConfig } from "./types.js";

const DEFAULTS: BudgetConfig = {
  perCallMaxUsdc: 1,
  dailyMaxUsdc: 50,
  monthlyMaxUsdc: 500,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MONTH = 30 * MS_PER_DAY;

interface SpendRecord {
  ts: number;
  amount: number;
  idempotencyKey?: string;
}

/**
 * Off-chain rolling-window budget controller.
 *
 * Persists spend records to LevelDB under ~/.chainlens/budget/<wallet>/.
 * Falls back to in-memory when LevelDB is unavailable (browser / ephemeral).
 */
export class BudgetController {
  private readonly cfg: BudgetConfig;
  private db: BudgetDB | null = null;
  private readonly walletAddress: string;
  private initPromise: Promise<void> | null = null;

  constructor(walletAddress: string, cfg: Partial<BudgetConfig> = {}) {
    this.walletAddress = walletAddress;
    this.cfg = { ...DEFAULTS, ...cfg };
  }

  private async getDb(): Promise<BudgetDB> {
    if (this.db) return this.db;
    if (!this.initPromise) {
      this.initPromise = this.openDb();
    }
    await this.initPromise;
    return this.db!;
  }

  private async openDb(): Promise<void> {
    try {
      const { Level } = await import("level");
      const dbPath = join(
        homedir(),
        ".chainlens",
        "budget",
        sanitizeAddress(this.walletAddress),
      );
      const level = new Level<string, string>(dbPath, { valueEncoding: "json" });
      await level.open();
      this.db = new LevelDB(level);
    } catch {
      // LevelDB unavailable (browser/ephemeral) — use in-memory
      process.stderr.write(
        "chain-lens SDK: LevelDB unavailable, using in-memory budget storage.\n",
      );
      this.db = new InMemoryDB();
    }
  }

  async canSpend(amount: number): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (amount > this.cfg.perCallMaxUsdc) {
      return { ok: false, reason: `per-call cap: $${amount} > $${this.cfg.perCallMaxUsdc}` };
    }

    const db = await this.getDb();
    const now = Date.now();
    const records = await db.readAll();
    const alive = records.filter((r) => now - r.ts < MS_PER_MONTH);

    const dailySpend = alive
      .filter((r) => now - r.ts < MS_PER_DAY)
      .reduce((s, r) => s + r.amount, 0);

    const monthlySpend = alive.reduce((s, r) => s + r.amount, 0);

    if (dailySpend + amount > this.cfg.dailyMaxUsdc) {
      return {
        ok: false,
        reason: `daily cap: $${(dailySpend + amount).toFixed(4)} > $${this.cfg.dailyMaxUsdc}`,
      };
    }
    if (monthlySpend + amount > this.cfg.monthlyMaxUsdc) {
      return {
        ok: false,
        reason: `monthly cap: $${(monthlySpend + amount).toFixed(4)} > $${this.cfg.monthlyMaxUsdc}`,
      };
    }
    return { ok: true };
  }

  async debit(amount: number, idempotencyKey?: string): Promise<void> {
    const db = await this.getDb();
    if (idempotencyKey) {
      const existing = await db.readAll();
      if (existing.some((r) => r.idempotencyKey === idempotencyKey)) return;
    }
    await db.append({ ts: Date.now(), amount, idempotencyKey });
    // Evict records older than 30 days
    await db.evictBefore(Date.now() - MS_PER_MONTH);
  }

  async currentSpend(): Promise<{ dailyUsdc: number; monthlyUsdc: number }> {
    const db = await this.getDb();
    const now = Date.now();
    const records = await db.readAll();
    const dailyUsdc = records
      .filter((r) => now - r.ts < MS_PER_DAY)
      .reduce((s, r) => s + r.amount, 0);
    const monthlyUsdc = records
      .filter((r) => now - r.ts < MS_PER_MONTH)
      .reduce((s, r) => s + r.amount, 0);
    return { dailyUsdc, monthlyUsdc };
  }
}

// ─── storage backends ─────────────────────────────────────────────────

interface BudgetDB {
  readAll(): Promise<SpendRecord[]>;
  append(record: SpendRecord): Promise<void>;
  evictBefore(ts: number): Promise<void>;
}

class InMemoryDB implements BudgetDB {
  private records: SpendRecord[] = [];

  async readAll() { return [...this.records]; }

  async append(record: SpendRecord) { this.records.push(record); }

  async evictBefore(ts: number) {
    this.records = this.records.filter((r) => r.ts >= ts);
  }
}

class LevelDB implements BudgetDB {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly level: any,
  ) {}

  async readAll(): Promise<SpendRecord[]> {
    const records: SpendRecord[] = [];
    for await (const value of this.level.values()) {
      try {
        records.push(JSON.parse(value) as SpendRecord);
      } catch {
        // skip corrupt entries
      }
    }
    return records;
  }

  async append(record: SpendRecord): Promise<void> {
    const key = `${record.ts}-${Math.random().toString(36).slice(2)}`;
    await this.level.put(key, JSON.stringify(record));
  }

  async evictBefore(ts: number): Promise<void> {
    const batch = this.level.batch();
    for await (const [key, value] of this.level.iterator()) {
      try {
        const record = JSON.parse(value) as SpendRecord;
        if (record.ts < ts) batch.del(key);
      } catch {
        batch.del(key);
      }
    }
    await batch.write();
  }
}

function sanitizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/[^a-f0-9x]/g, "").slice(0, 42);
}
