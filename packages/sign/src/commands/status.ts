import { connectDaemon } from "../daemon/client.js";
import { socketPath } from "../paths.js";

export async function runStatus(): Promise<void> {
  const sock = socketPath();
  let client;
  try {
    client = await connectDaemon(sock);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("ECONNREFUSED")) {
      process.stdout.write(`Locked. No daemon running at ${sock}.\n`);
      return;
    }
    throw err;
  }

  try {
    const status = await client.status();
    process.stdout.write(
      `Unlocked: ${status.address}\n` +
        `Socket:   ${sock}\n` +
        `TTL left: ${formatDuration(status.ttlRemainingMs)}\n`,
    );
  } finally {
    client.close();
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
