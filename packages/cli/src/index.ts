#!/usr/bin/env bun
import { cac } from "cac";
import { appsCmd } from "./commands/apps.cmd";
import { connectCmd } from "./commands/connect.cmd";
import { disconnectCmd } from "./commands/disconnect.cmd";
import { executeCmd } from "./commands/execute.cmd";
import { searchCmd } from "./commands/search.cmd";
import { serveCmd } from "./commands/serve.cmd";
import { toolAddCmd } from "./commands/tool.cmd";
import { emitErr } from "./json";

const cli = cac("tensor-mcp");

// ─── 5 user verbs that the agent + the CLI surface uniformly ─────────────────

cli.command("apps", "List every registered app + connection status").action(
  async () => process.exit(await appsCmd()),
);

cli
  .command(
    "connect <app> [token]",
    "Authenticate with an app (OAuth opens browser; PAT/API-key reads the optional token arg)",
  )
  .action(async (app: string, token?: string) =>
    process.exit(await connectCmd(app, token)),
  );

cli
  .command("disconnect <app>", "Remove an app's stored credential")
  .action(async (app: string) => process.exit(await disconnectCmd(app)));

cli
  .command(
    "search <query>",
    "Search the tool catalog (BM25 + semantic fused via RRF; BM25-only when embeddings unavailable)",
  )
  .option("--top-k <n>", "Max hits to return (default 3, max 50)")
  .option("--threshold <score>", "Min score (default 0.02, 0 to disable)")
  .option("--apps <list>", "Comma-separated app slugs to restrict to")
  .option(
    "--include-unconnected",
    "Also show tools from apps you haven't connected",
  )
  .action(
    async (
      query: string,
      opts: {
        topK?: number | string;
        threshold?: number | string;
        apps?: string;
        includeUnconnected?: boolean;
      },
    ) => process.exit(await searchCmd(query, opts)),
  );

cli
  .command(
    "execute <app> <tool> [input-json]",
    "Execute a discovered tool (input-json defaults to '{}')",
  )
  .action(async (app: string, tool: string, input?: string) =>
    process.exit(await executeCmd(app, tool, input)),
  );

// ─── Support verbs ───────────────────────────────────────────────────────────

cli
  .command("serve", "Start the MCP stdio server (used by Claude Desktop etc.)")
  .action(async () => process.exit(await serveCmd()));

cli
  .command(
    "tool <action> <host>",
    "Wire tensor-mcp into a host MCP client (claude-desktop, claude-code, cursor, vscode, gemini, codex)",
  )
  .action(async (action: string, host: string) => {
    if (action !== "add") {
      process.exit(
        emitErr(`unknown tool action '${action}'. Supported: add`),
      );
    }
    process.exit(await toolAddCmd(host));
  });

cli.help();
cli.version("0.3.0");

// cac throws a `CACError` (sub-class of Error, name === "CACError") for
// malformed invocations — missing required args, unknown options, etc.
// Catch at the top level so a bare `tensor-mcp tool` emits one JSON error
// line instead of a Bun stack trace into the `/$bunfs/` virtual FS.
try {
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
} catch (err) {
  const e = err as Error;
  process.exit(emitErr(e.message ?? String(err)));
}
