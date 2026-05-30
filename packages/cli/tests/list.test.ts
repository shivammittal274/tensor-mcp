import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConnectionsIndex } from "@tensor-mcp/runtime";

function captureStdout(): { restore: () => void; output: () => string } {
  const orig = process.stdout.write.bind(process.stdout);
  const buf: string[] = [];
  process.stdout.write = ((s: unknown) => {
    buf.push(String(s));
    return true;
  }) as typeof process.stdout.write;
  return {
    restore: () => {
      process.stdout.write = orig;
    },
    output: () => buf.join(""),
  };
}

describe("list command", () => {
  let tempDir: string;
  let indexPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-list-"));
    indexPath = join(tempDir, "connections.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("prints empty-state message when no connections", async () => {
    const cap = captureStdout();
    try {
      const { runList } = await import("../src/commands/list");
      const code = await runList([], { indexPath });
      expect(code).toBe(0);
      expect(cap.output()).toMatch(/no services connected/i);
    } finally {
      cap.restore();
    }
  });

  it("prints table when connections exist", async () => {
    const idx = new ConnectionsIndex({ path: indexPath });
    await idx.upsert({
      service: "linear",
      connectionId: "linear:default",
      connectedAt: Date.now() - 2 * 3600 * 1000,
      lastUsedAt: Date.now() - 5 * 60 * 1000,
    });

    const cap = captureStdout();
    try {
      const { runList } = await import("../src/commands/list");
      const code = await runList([], { indexPath });
      expect(code).toBe(0);
      const out = cap.output();
      expect(out).toContain("SERVICE");
      expect(out).toContain("linear");
      expect(out).toContain("linear:default");
    } finally {
      cap.restore();
    }
  });
});
