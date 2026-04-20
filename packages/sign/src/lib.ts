// Library entry — programmatic API for other packages (mcp-tool, tests).
// CLI lives at dist/index.js and runs immediately on import; never import it.
export { connectDaemon, DaemonRpcError } from "./daemon/client.js";
export type { DaemonClient } from "./daemon/client.js";
export { daemonAccount } from "./daemon/account.js";
export { socketPath } from "./paths.js";
