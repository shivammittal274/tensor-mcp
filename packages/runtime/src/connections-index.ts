import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

export interface ConnectionRecord {
  service: string;
  connectionId: string;
  displayName?: string;
  connectedAt: number;
  lastUsedAt?: number;
}

export interface ConnectionsIndexOptions {
  path?: string;
}

interface IndexFile {
  version: 1;
  records: ConnectionRecord[];
}

const DEFAULT_PATH = join(homedir(), ".tensor-mcp", "connections.json");

export class ConnectionsIndex {
  private readonly path: string;

  constructor(opts: ConnectionsIndexOptions = {}) {
    this.path = opts.path ?? DEFAULT_PATH;
  }

  private async load(): Promise<IndexFile> {
    const file = Bun.file(this.path);
    if (!(await file.exists())) return { version: 1, records: [] };
    let raw: string;
    try {
      raw = await file.text();
    } catch (err) {
      throw new Error(`ConnectionsIndex: read failed at ${this.path}: ${err}`);
    }
    if (raw.trim() === "") return { version: 1, records: [] };
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.records)) {
        throw new Error("malformed");
      }
      return parsed as IndexFile;
    } catch {
      throw new Error(`ConnectionsIndex: corrupted at ${this.path}`);
    }
  }

  private async save(data: IndexFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await Bun.write(this.path, JSON.stringify(data, null, 2));
  }

  async list(): Promise<ConnectionRecord[]> {
    const data = await this.load();
    return [...data.records].sort((a, b) => b.connectedAt - a.connectedAt);
  }

  async get(connectionId: string): Promise<ConnectionRecord | null> {
    const data = await this.load();
    return data.records.find(r => r.connectionId === connectionId) ?? null;
  }

  async upsert(record: ConnectionRecord): Promise<void> {
    const data = await this.load();
    const idx = data.records.findIndex(r => r.connectionId === record.connectionId);
    if (idx >= 0) data.records[idx] = record;
    else data.records.push(record);
    await this.save(data);
  }

  async remove(connectionId: string): Promise<void> {
    const data = await this.load();
    const filtered = data.records.filter(r => r.connectionId !== connectionId);
    if (filtered.length === data.records.length) return;
    data.records = filtered;
    await this.save(data);
  }
}
