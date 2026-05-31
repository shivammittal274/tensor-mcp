import { ConnectionsStore } from "@tensor-mcp/core";

export interface ShowCmdOpts {
  /** Emit records as JSON instead of the human table. */
  json?: boolean;
}

export async function showCmd(opts: ShowCmdOpts = {}): Promise<number> {
  const connections = new ConnectionsStore({});
  const records = (await connections.list()).map((r) => r.value);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    return 0;
  }

  if (records.length === 0) {
    process.stdout.write(
      "No services connected. Run 'tensor-mcp connect <service>' to add one.\n",
    );
    return 0;
  }

  const headers = ["SERVICE", "CONNECTION", "CONNECTED"];
  const rows = records.map((r) => [
    r.service,
    r.connectionId,
    relTime(r.connectedAt),
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length)),
  );
  const fmt = (cols: string[]) =>
    cols.map((c, i) => c.padEnd(widths[i])).join("  ");
  process.stdout.write(`${fmt(headers)}\n`);
  for (const row of rows) process.stdout.write(`${fmt(row)}\n`);
  return 0;
}

function relTime(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}
