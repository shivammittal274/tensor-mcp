import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import schemaDdl from "./schema.sql" with { type: "text" };

export interface CatalogTool {
  service: string;
  toolName: string;
  description: string;
  inputSchema: unknown;
  versionHash: string;
  indexedAt: number;
}

export interface CatalogOptions {
  path?: string;
}

interface ToolRow {
  service: string;
  tool_name: string;
  description: string;
  input_schema_json: string;
  version_hash: string;
  indexed_at: number;
}

const DEFAULT_PATH = join(homedir(), ".tensor-mcp", "catalog.sqlite");

function rowToTool(r: ToolRow): CatalogTool {
  return {
    service: r.service,
    toolName: r.tool_name,
    description: r.description,
    inputSchema: JSON.parse(r.input_schema_json),
    versionHash: r.version_hash,
    indexedAt: r.indexed_at,
  };
}

export class Catalog {
  private readonly path: string;
  private db: Database | null = null;

  constructor(opts: CatalogOptions = {}) {
    this.path = opts.path ?? DEFAULT_PATH;
  }

  async open(): Promise<void> {
    if (this.db) return;
    await mkdir(dirname(this.path), { recursive: true });
    const db = new Database(this.path);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(schemaDdl);
    this.db = db;
  }

  private ensureOpen(): Database {
    if (!this.db) throw new Error("Catalog not opened — call open() first");
    return this.db;
  }

  async upsertService(service: string, tools: CatalogTool[]): Promise<void> {
    const db = this.ensureOpen();
    const txn = db.transaction((rows: CatalogTool[]) => {
      db.run("DELETE FROM tools WHERE service = ?", [service]);
      const stmt = db.prepare(
        "INSERT INTO tools (service, tool_name, description, input_schema_json, version_hash, indexed_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const t of rows) {
        stmt.run(
          t.service,
          t.toolName,
          t.description,
          JSON.stringify(t.inputSchema),
          t.versionHash,
          t.indexedAt,
        );
      }
    });
    txn(tools);
  }

  async listAll(): Promise<CatalogTool[]> {
    const db = this.ensureOpen();
    const rows = db
      .prepare(
        "SELECT service, tool_name, description, input_schema_json, version_hash, indexed_at FROM tools ORDER BY service, tool_name",
      )
      .all() as ToolRow[];
    return rows.map(rowToTool);
  }

  async listByService(service: string): Promise<CatalogTool[]> {
    const db = this.ensureOpen();
    const rows = db
      .prepare(
        "SELECT service, tool_name, description, input_schema_json, version_hash, indexed_at FROM tools WHERE service = ? ORDER BY tool_name",
      )
      .all(service) as ToolRow[];
    return rows.map(rowToTool);
  }

  async get(service: string, toolName: string): Promise<CatalogTool | null> {
    const db = this.ensureOpen();
    const row = db
      .prepare(
        "SELECT service, tool_name, description, input_schema_json, version_hash, indexed_at FROM tools WHERE service = ? AND tool_name = ?",
      )
      .get(service, toolName) as ToolRow | null;
    if (!row) return null;
    return rowToTool(row);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
