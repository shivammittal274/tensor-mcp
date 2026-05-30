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

  // Wires up real Linear klavisExecutor once Component C lands the
  // klavis-executor module. Until then the import path
  // `../src/subprocess/klavis-executor` does not exist. Day 2 task is to
  // un-todo this and replace with:
  //   const executor = klavisExecutor({ lang: "python", vendorDir: "vendored/linear" });
  //   const n = await ingestService(catalog, { service: "linear", executor,
  //     tensorMcpRoot: TENSOR_MCP_ROOT, readinessTimeoutMs: 60_000 });
  //   expect(n).toBeGreaterThan(15);
  it.todo(
    "ingests Linear server's tools into the catalog (wire klavisExecutor in Day 2)",
    () => {},
  );
});
