import { runConnect } from "./commands/connect";
import { runDisconnect } from "./commands/disconnect";
import { runList } from "./commands/list";
import { runServe } from "./commands/serve";

export type CommandHandler = (args: string[]) => Promise<number> | number;

const COMMANDS: Record<string, CommandHandler> = {
  serve: runServe,
  connect: runConnect,
  list: runList,
  disconnect: runDisconnect,
};

const USAGE = `tensor-mcp — local-first MCP gateway

Usage:
  tensor-mcp serve                        Start the MCP stdio server (for Claude Desktop)
  tensor-mcp connect <service>            OAuth a third-party service
  tensor-mcp list                         List connected services
  tensor-mcp disconnect <service>         Remove a connection

Run any command with -h or --help for details.
`;

export async function dispatch(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(USAGE);
    return argv.length === 0 ? 1 : 0;
  }

  const [cmd, ...rest] = argv;
  const handler = COMMANDS[cmd];
  if (!handler) {
    process.stderr.write(`tensor-mcp: unknown command '${cmd}'\n\n${USAGE}`);
    return 1;
  }
  return await handler(rest);
}
