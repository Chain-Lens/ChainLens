import { connectDaemon, DaemonRpcError } from "../daemon/client.js";
import { socketPath } from "../paths.js";

export async function runLock(): Promise<void> {
  const sock = socketPath();
  let client;
  try {
    client = await connectDaemon(sock);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("ECONNREFUSED")) {
      process.stdout.write(`No daemon running at ${sock}.\n`);
      return;
    }
    throw err;
  }

  try {
    await client.lock();
    process.stdout.write(`Locked daemon at ${sock}.\n`);
  } catch (err) {
    if (err instanceof DaemonRpcError && err.code === "connection_closed") {
      // Daemon shut the socket before we read the response — that is success.
      process.stdout.write(`Locked daemon at ${sock}.\n`);
      return;
    }
    throw err;
  } finally {
    client.close();
  }
}
