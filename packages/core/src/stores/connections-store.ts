import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { KeyValueStore } from "./types";

export interface ConnectionRecord {
  service: string;
  connectionId: string;
  displayName?: string;
  connectedAt: number;
  lastUsedAt?: number;
}

export interface ConnectionsStoreOptions {
  path?: string;
}

interface IndexFile {
  version: 1;
  records: ConnectionRecord[];
}

const DEFAULT_PATH = join(homedir(), ".tensor-mcp", "connections.json");

/**
 * JSON-file-backed `KeyValueStore<ConnectionRecord>`. Non-secret
 * connection metadata only — secret material lives in `TokenStore`.
 * `list()` returns records sorted by `connectedAt` descending; `delete()`
 * is idempotent; the parent directory is created lazily on first write.
 */
export class ConnectionsStore implements KeyValueStore<ConnectionRecord> {
  private readonly path: string;

  constructor(opts: ConnectionsStoreOptions = {}) {
    this.path = opts.path ?? DEFAULT_PATH;
  }

  private async load(): Promise<IndexFile> {
    const file = Bun.file(this.path);
    if (!(await file.exists())) return { version: 1, records: [] };
    let raw: string;
    try {
      raw = await file.text();
    } catch (err) {
      throw new Error(`ConnectionsStore: read failed at ${this.path}: ${err}`);
    }
    if (raw.trim() === "") return { version: 1, records: [] };
    try {
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray((parsed as { records?: unknown }).records)
      ) {
        throw new Error("malformed");
      }
      return parsed as IndexFile;
    } catch {
      throw new Error(`ConnectionsStore: corrupted at ${this.path}`);
    }
  }

  private async save(data: IndexFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await Bun.write(this.path, JSON.stringify(data, null, 2));
  }

  async get(key: string): Promise<ConnectionRecord | null> {
    const data = await this.load();
    return data.records.find((r) => r.connectionId === key) ?? null;
  }

  async set(key: string, value: ConnectionRecord): Promise<void> {
    if (value.connectionId !== key) {
      throw new Error(
        `ConnectionsStore: key (${key}) must match value.connectionId (${value.connectionId})`,
      );
    }
    const data = await this.load();
    const idx = data.records.findIndex((r) => r.connectionId === key);
    if (idx >= 0) data.records[idx] = value;
    else data.records.push(value);
    await this.save(data);
  }

  async delete(key: string): Promise<void> {
    const data = await this.load();
    const filtered = data.records.filter((r) => r.connectionId !== key);
    if (filtered.length === data.records.length) return;
    data.records = filtered;
    await this.save(data);
  }

  async list(): Promise<Array<{ key: string; value: ConnectionRecord }>> {
    const data = await this.load();
    return [...data.records]
      .sort((a, b) => b.connectedAt - a.connectedAt)
      .map((value) => ({ key: value.connectionId, value }));
  }
}
