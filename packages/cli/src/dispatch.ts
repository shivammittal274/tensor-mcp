import { runConnect } from "./commands/connect";
import { runDevCall } from "./commands/dev-call";
import { runDisconnect } from "./commands/disconnect";
import { runIngest } from "./commands/ingest";
import { runList } from "./commands/list";
import { runServe } from "./commands/serve";

export type CommandHandler = (args: string[]) => Promise<number> | number;

const COMMANDS: Record<string, CommandHandler> = {
  serve: runServe,
  connect: runConnect,
  list: runList,
  disconnect: runDisconnect,
  ingest: runIngest,
  "dev:call": runDevCall,
};

const USAGE = `tensor-mcp — local-first MCP gateway

Usage:
  tensor-mcp serve                                   Start the MCP stdio server (for Claude Desktop)
  tensor-mcp connect <service>                       OAuth a third-party service
  tensor-mcp list                                    List connected services
  tensor-mcp disconnect <service>                    Remove a connection
  tensor-mcp ingest [service]                        Ingest a service's tool catalog (default: all known services)
  tensor-mcp dev:call <service> <tool> [json-args]   Dev-only: call a tool directly

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
