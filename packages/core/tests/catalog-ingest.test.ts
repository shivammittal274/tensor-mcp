import { afterEach, beforeEach, describe, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Catalog } from "../src/catalog/catalog";

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

  // Live ingestion against vendored/linear is exercised by the smoke flow,
  // not the unit suite — it requires `uv` + network. Kept as a todo so the
  // intent is visible in test output.
  //   const n = await ingestService(catalog, {
  //     service: "linear",
  //     spawn: klavisPython("vendored/linear"),
  //     tensorMcpRoot: TENSOR_MCP_ROOT,
  //     readinessTimeoutMs: 60_000,
  //   });
  //   expect(n).toBeGreaterThan(15);
  it.todo("ingests Linear server's tools into the catalog (real subprocess smoke)", () => {});
});
