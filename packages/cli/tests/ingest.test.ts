import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Catalog } from "@tensor-mcp/runtime";

function captureStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((s: unknown) => {
    stdout.push(String(s));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((s: unknown) => {
    stderr.push(String(s));
    return true;
  }) as typeof process.stderr.write;
  return {
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
    stdout: () => stdout.join(""),
    stderr: () => stderr.join(""),
  };
}

const TENSOR_MCP_ROOT = join(import.meta.dir, "..", "..", "..");

describe("ingest command", () => {
  let tempDir: string;
  let catalogPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-ingest-"));
    catalogPath = join(tempDir, "catalog.sqlite");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns 1 for unknown service", async () => {
    const cap = captureStreams();
    try {
      const { runIngest } = await import("../src/commands/ingest");
      const code = await runIngest(["nope"], {
        catalogPath,
        registry: {},
      });
      expect(code).toBe(1);
      expect(cap.stderr()).toMatch(/unknown service/);
    } finally {
      cap.restore();
    }
  });

  it("ingests Linear when invoked with linear arg", async () => {
    const cap = captureStreams();
    try {
      const { runIngest } = await import("../src/commands/ingest");
      const code = await runIngest(["linear"], {
        catalogPath,
        tensorMcpRoot: TENSOR_MCP_ROOT,
      });
      expect(code).toBe(0);
      expect(cap.stdout()).toMatch(/linear: \d+ tools/);
    } finally {
      cap.restore();
    }

    const catalog = new Catalog({ path: catalogPath });
    await catalog.open();
    try {
      const rows = await catalog.listByService("linear");
      expect(rows.length).toBeGreaterThan(0);
    } finally {
      catalog.close();
    }
  }, 120_000);
});
