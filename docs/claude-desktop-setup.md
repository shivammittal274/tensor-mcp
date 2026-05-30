# tensor-mcp + Claude Desktop setup

This guide walks you through connecting your local-first `tensor-mcp` CLI to Claude Desktop so that Claude can use Linear, Slack, Gmail, etc. on your behalf — with OAuth tokens stored only in your macOS Keychain.

## Prerequisites

- macOS (Linux + Windows support coming)
- [Claude Desktop](https://claude.com/download) installed
- A built `tensor-mcp` binary at `/Users/.../tensor-mcp/dist/tensor-mcp`
- [`uv`](https://docs.astral.sh/uv/) installed and on `PATH` (`brew install uv`) — the vendored Python services run as subprocesses
- A Linear account (for the demo)

## Step 1: Build the binary

From the tensor-mcp repo root:

```bash
./scripts/build.sh
```

Verify:
```bash
./dist/tensor-mcp --help
```

## Step 2: Connect a service

```bash
./dist/tensor-mcp connect linear
```

A browser tab opens. Authorize tensor-mcp to access your Linear workspace. After authorization, the tab will say "tensor-mcp: authentication complete" and your terminal will report:

```
Connected linear (linear:default). Token stored in OS keychain.
Indexed 18 linear tools.
```

Verify the token is in Keychain:

```bash
security find-generic-password -s "com.tensormcp.cli" -a "linear:default"
```

(You'll see a Keychain record — the token itself is not printed unless you add `-w`.)

## Step 3: Register tensor-mcp with Claude Desktop

Edit (or create) `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tensor-mcp": {
      "command": "/Users/YOU/path/to/tensor-mcp/dist/tensor-mcp",
      "args": ["serve"]
    }
  }
}
```

Replace `YOU/path/to/tensor-mcp` with your actual path. Save.

## Step 4: Restart Claude Desktop

Quit Claude Desktop completely (Cmd+Q) and reopen it. Look for "tensor-mcp" in the MCP server list (usually visible under the chat input or in settings).

## Step 5: Try it

Ask Claude:

> Use tensor-mcp to list the teams in my Linear workspace.

Claude will:
1. Call `search_tools(query: "list teams")` — gets `linear_list_teams` ranked first
2. Call `call_tool(service: "linear", tool: "linear_list_teams")` — fetches teams via Linear's API
3. Show you the results

Your Linear OAuth token never leaves your machine.

## Troubleshooting

- **"tensor-mcp not found" in Claude Desktop**: check the path in `claude_desktop_config.json` is absolute and correct. Verify the binary runs: `/path/to/dist/tensor-mcp --help`.
- **"linear is not connected" in Claude's response**: run `./dist/tensor-mcp list` from a terminal. If empty, run `./dist/tensor-mcp connect linear` again.
- **Catalog empty**: run `./dist/tensor-mcp ingest linear` to re-populate.
- **Subprocess fails to spawn**: ensure `uv` is installed and in PATH (`brew install uv`).
