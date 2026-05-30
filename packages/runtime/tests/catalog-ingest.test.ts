import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Catalog } from "../src/catalog/catalog";
import { ingestService } from "../src/catalog/ingest";

const TENSOR_MCP_ROOT = join(import.meta.dir, "..", "..", "..");
const LINEAR_CWD = join(TENSOR_MCP_ROOT, "vendored", "linear");

describe("ingestService", () => {
  let tempDir: string;
  let catalog: Catalog;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-ingest-"));
    catalog = new Catalog({ path: join(tempDir, "catalog.sqlite") });
    await catalog.open();
  });

  afterEach(() => {
    catalog.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("ingests Linear server's tools into the catalog", async () => {
    const n = await ingestService(catalog, {
      service: "linear",
      cwd: LINEAR_CWD,
      command: [
        "uv",
        "run",
        "--with-requirements",
        "requirements.txt",
        "python",
        "server.py",
        "--port",
        "{{PORT}}",
      ],
      readinessTimeoutMs: 60_000,
    });
    expect(n).toBeGreaterThan(15);
    const rows = await catalog.listByService("linear");
    expect(rows.length).toBe(n);
    expect(rows.every((r) => r.versionHash.length === 16)).toBe(true);
    expect(rows.some((r) => /issue/i.test(r.toolName))).toBe(true);
    expect(rows.some((r) => /team/i.test(r.toolName))).toBe(true);
  }, 120_000);
});
