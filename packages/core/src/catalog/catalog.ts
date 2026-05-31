import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tools (
    service TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    input_schema_json TEXT NOT NULL DEFAULT '{}',
    version_hash TEXT NOT NULL,
    indexed_at INTEGER NOT NULL,
    embedding BLOB,
    PRIMARY KEY (service, tool_name)
  );

  CREATE INDEX IF NOT EXISTS idx_tools_service ON tools(service);
  CREATE INDEX IF NOT EXISTS idx_tools_indexed_at ON tools(indexed_at);

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// Migration for catalogs created before the embedding column existed.
const ADD_EMBEDDING_IF_MISSING = `
  ALTER TABLE tools ADD COLUMN embedding BLOB;
`;

export interface CatalogTool {
  service: string;
  toolName: string;
  description: string;
  inputSchema: unknown;
  versionHash: string;
  indexedAt: number;
  /** L2-normalized embedding (Float32). Optional — set by ingest after BM25. */
  embedding?: Float32Array;
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
  embedding: Uint8Array | null;
}

const DEFAULT_PATH = join(homedir(), ".tensor-mcp", "catalog.sqlite");

function rowToTool(r: ToolRow): CatalogTool {
  const out: CatalogTool = {
    service: r.service,
    toolName: r.tool_name,
    description: r.description,
    inputSchema: JSON.parse(r.input_schema_json),
    versionHash: r.version_hash,
    indexedAt: r.indexed_at,
  };
  if (r.embedding && r.embedding.byteLength > 0) {
    // SQLite gives Uint8Array; we want the same bytes as Float32Array view.
    out.embedding = new Float32Array(
      r.embedding.buffer.slice(
        r.embedding.byteOffset,
        r.embedding.byteOffset + r.embedding.byteLength,
      ),
    );
  }
  return out;
}

function embeddingToBlob(v: Float32Array | undefined): Uint8Array | null {
  if (!v) return null;
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
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
    db.exec(SCHEMA);
    // Best-effort migration for older catalogs missing the `embedding` column.
    try {
      db.exec(ADD_EMBEDDING_IF_MISSING);
    } catch (err) {
      // "duplicate column name: embedding" — already migrated, fine.
      if (!(err as Error).message.includes("duplicate column")) throw err;
    }
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
        "INSERT INTO tools (service, tool_name, description, input_schema_json, version_hash, indexed_at, embedding) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const t of rows) {
        stmt.run(
          t.service,
          t.toolName,
          t.description,
          JSON.stringify(t.inputSchema),
          t.versionHash,
          t.indexedAt,
          embeddingToBlob(t.embedding),
        );
      }
    });
    txn(tools);
  }

  /** Bulk-update only the embedding column. Cheap on top of a prior ingest. */
  async updateEmbeddings(
    rows: Array<{ service: string; toolName: string; embedding: Float32Array }>,
  ): Promise<void> {
    const db = this.ensureOpen();
    const txn = db.transaction(() => {
      const stmt = db.prepare(
        "UPDATE tools SET embedding = ? WHERE service = ? AND tool_name = ?",
      );
      for (const r of rows) {
        stmt.run(embeddingToBlob(r.embedding), r.service, r.toolName);
      }
    });
    txn();
  }

  async listAll(): Promise<CatalogTool[]> {
    const db = this.ensureOpen();
    const rows = db
      .prepare(
        "SELECT service, tool_name, description, input_schema_json, version_hash, indexed_at, embedding FROM tools ORDER BY service, tool_name",
      )
      .all() as ToolRow[];
    return rows.map(rowToTool);
  }

  async listByService(service: string): Promise<CatalogTool[]> {
    const db = this.ensureOpen();
    const rows = db
      .prepare(
        "SELECT service, tool_name, description, input_schema_json, version_hash, indexed_at, embedding FROM tools WHERE service = ? ORDER BY tool_name",
      )
      .all(service) as ToolRow[];
    return rows.map(rowToTool);
  }

  async get(service: string, toolName: string): Promise<CatalogTool | null> {
    const db = this.ensureOpen();
    const row = db
      .prepare(
        "SELECT service, tool_name, description, input_schema_json, version_hash, indexed_at, embedding FROM tools WHERE service = ? AND tool_name = ?",
      )
      .get(service, toolName) as ToolRow | null;
    if (!row) return null;
    return rowToTool(row);
  }

  /** Tools missing an embedding (for backfill on first semantic search). */
  async listNeedingEmbedding(): Promise<CatalogTool[]> {
    const db = this.ensureOpen();
    const rows = db
      .prepare(
        "SELECT service, tool_name, description, input_schema_json, version_hash, indexed_at, embedding FROM tools WHERE embedding IS NULL",
      )
      .all() as ToolRow[];
    return rows.map(rowToTool);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
