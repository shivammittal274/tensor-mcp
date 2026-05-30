import { ConnectionsIndex, type ConnectionRecord } from "@tensor-mcp/runtime";

export interface RunListOptions {
  indexPath?: string;
}

export async function runList(_args: string[], opts: RunListOptions = {}): Promise<number> {
  const index = new ConnectionsIndex({ path: opts.indexPath });
  let records: ConnectionRecord[];
  try {
    records = await index.list();
  } catch (err) {
    process.stderr.write(`tensor-mcp list: ${(err as Error).message}\n`);
    return 1;
  }

  if (records.length === 0) {
    process.stdout.write(
      "No services connected. Run `tensor-mcp connect <service>` to add one.\n",
    );
    return 0;
  }

  const headers = ["SERVICE", "CONNECTION", "CONNECTED", "LAST USED"];
  const rows = records.map(r => [
    r.service,
    r.connectionId,
    relativeTime(r.connectedAt),
    r.lastUsedAt ? relativeTime(r.lastUsedAt) : "—",
  ]);

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(row => row[i].length)),
  );

  const fmt = (cols: string[]) =>
    cols.map((c, i) => c.padEnd(widths[i])).join("  ");

  process.stdout.write(`${fmt(headers)}\n`);
  for (const row of rows) process.stdout.write(`${fmt(row)}\n`);
  return 0;
}

function relativeTime(ms: number): string {
  const delta = Date.now() - ms;
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} week${wk === 1 ? "" : "s"} ago`;
  return new Date(ms).toISOString().slice(0, 10);
}
