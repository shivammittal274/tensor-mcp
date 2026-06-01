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

  /**
   * Delete every row for `service`. Idempotent — no-op when nothing matches.
   * Used by `disconnectApp` to keep the catalog in sync with active
   * connections: only currently-connected services are visible to search.
   */
  async dropService(service: string): Promise<void> {
    const db = this.ensureOpen();
    db.run("DELETE FROM tools WHERE service = ?", [service]);
  }

  /**
   * Delete rows for any `service` not in `registeredIds`. Used by
   * `bootstrap` to nuke zombie rows after a service id rename or removal.
   * Returns the row count removed for logging.
   *
   * Refuses to run when the allow-list is empty — the semantic answer
   * ("delete everything") is almost always a wiring bug in the caller
   * (e.g. `listServices()` returned `[]` because of a registry import
   * failure). Use `dropService` per-id if you really do want to wipe.
   */
  async dropOrphans(registeredIds: readonly string[]): Promise<number> {
    if (registeredIds.length === 0) {
      throw new Error(
        "dropOrphans: refusing to delete all rows — pass at least one registered id",
      );
    }
    const db = this.ensureOpen();
    const placeholders = registeredIds.map(() => "?").join(",");
    const r = db
      .prepare(`DELETE FROM tools WHERE service NOT IN (${placeholders})`)
      .run(...registeredIds);
    return r.changes;
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

  async getMeta(key: string): Promise<string | null> {
    const db = this.ensureOpen();
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | null;
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    const db = this.ensureOpen();
    db.prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, value);
  }

  /** Drop all stored embeddings — forces a full re-embed on next connect. */
  async clearAllEmbeddings(): Promise<void> {
    const db = this.ensureOpen();
    db.run("UPDATE tools SET embedding = NULL");
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
