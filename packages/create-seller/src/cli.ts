import { initCommand } from "./commands/init.js";
import { deployCommand } from "./commands/deploy.js";
import { registerCommand } from "./commands/register.js";
import { statusCommand } from "./commands/status.js";

const HELP = `chain-lens-seller <command> [options]

Commands:
  init <name>        Scaffold a new seller project from a template.
  deploy             Deploy the current seller to Vercel (wraps \`vercel\`).
  register           Register the deployed seller with the ChainLens gateway.
  status [--seller]  Show on-chain reputation / job counters for this seller.

Run \`chain-lens-seller <command> --help\` for command-specific flags.
`;

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(HELP);
    return;
  }

  switch (command) {
    case "init":
      await initCommand(rest);
      return;
    case "deploy":
      await deployCommand(rest);
      return;
    case "register":
      await registerCommand(rest);
      return;
    case "status":
      await statusCommand(rest);
      return;
    default:
      throw new Error(`unknown command: ${command}\n\n${HELP}`);
  }
}
