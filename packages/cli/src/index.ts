#!/usr/bin/env bun
import { cac } from "cac";
import { callCmd } from "./commands/call";
import { connectCmd } from "./commands/connect";
import { disconnectCmd } from "./commands/disconnect";
import { searchCmd } from "./commands/search";
import { serveCmd } from "./commands/serve";
import { showCmd } from "./commands/show";
import { toolAddCmd } from "./commands/tool";

const cli = cac("tensor-mcp");

cli
  .command("connect <service>", "Authenticate with a third-party service")
  .action(async (service: string) => {
    process.exit(await connectCmd(service));
  });

cli
  .command("disconnect <service>", "Remove a connection")
  .action(async (service: string) => {
    process.exit(await disconnectCmd(service));
  });

cli.command("show", "List connected services").action(async () => {
  process.exit(await showCmd());
});

cli
  .command("search <query>", "Search the tool catalog")
  .option("--top-k <n>", "Number of results", { default: 8 })
  .option("--services <list>", "Comma-separated services to restrict to")
  .option("--schema", "Also print each hit's full JSON input schema")
  .option("--json", "Emit the full result as JSON (machine-readable)")
  .action(
    async (
      query: string,
      opts: {
        topK?: number;
        services?: string;
        schema?: boolean;
        json?: boolean;
      },
    ) => {
      process.exit(await searchCmd(query, opts));
    },
  );

cli
  .command("call <service> <tool> [args]", "Execute a tool")
  .action(async (service: string, tool: string, args?: string) => {
    process.exit(await callCmd(service, tool, args));
  });

cli
  .command("serve", "Start the MCP stdio server (for Claude Desktop)")
  .action(async () => {
    process.exit(await serveCmd());
  });

cli
  .command(
    "tool <action> <host>",
    "Add tensor-mcp to a host MCP client (claude-desktop, claude-code, cursor, vscode, gemini)",
  )
  .action(async (action: string, host: string) => {
    if (action !== "add") {
      process.stderr.write(
        `tensor-mcp tool: unknown action '${action}'. Supported: add\n`,
      );
      process.exit(1);
    }
    process.exit(await toolAddCmd(host));
  });

cli.help();
cli.version("0.2.0");
cli.parse();
