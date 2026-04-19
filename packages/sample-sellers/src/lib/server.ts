import express, { type Express, type Request, type Response } from "express";
import type { TaskHandlerMap } from "./types.js";
import { BadInputError, UpstreamError } from "./types.js";

export interface SellerServerConfig {
  /** Human-readable seller id used in health + logs. */
  name: string;
  /** Task type → handler. The `/` endpoint dispatches by `task_type` in the body. */
  handlers: TaskHandlerMap;
}

export function createSellerApp(config: SellerServerConfig): Express {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      seller: config.name,
      capabilities: Object.keys(config.handlers),
    });
  });

  app.post("/", async (req: Request, res: Response) => {
    const body = req.body as { task_type?: unknown; inputs?: unknown } | undefined;
    const taskType = typeof body?.task_type === "string" ? body.task_type : null;
    if (!taskType) {
      res.status(400).json({ error: "missing_task_type" });
      return;
    }
    const handler = config.handlers[taskType];
    if (!handler) {
      res.status(400).json({ error: "unsupported_task_type", task_type: taskType });
      return;
    }
    const inputs =
      body?.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs)
        ? (body.inputs as Record<string, unknown>)
        : {};
    try {
      const result = await handler(inputs);
      res.json(result);
    } catch (err) {
      if (err instanceof BadInputError) {
        res.status(400).json({ error: "bad_input", message: err.message });
        return;
      }
      if (err instanceof UpstreamError) {
        res.status(err.statusCode).json({ error: "upstream_error", message: err.message });
        return;
      }
      res.status(500).json({
        error: "internal_error",
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  });

  return app;
}

export function startSellerServer(config: SellerServerConfig, port = 8080): void {
  const app = createSellerApp(config);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[${config.name}] listening on :${port} (capabilities: ${Object.keys(config.handlers).join(", ")})`);
  });
}
