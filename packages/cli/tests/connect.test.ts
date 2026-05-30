import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault, ConnectionsIndex, type TokenBlob } from "@tensor-mcp/runtime";

const TEST_VAULT_SERVICE = "com.tensormcp.cli.test.connect";

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

describe("connect command", () => {
  let tempDir: string;
  let indexPath: string;
  let vault: Vault;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-connect-"));
    indexPath = join(tempDir, "connections.json");
    vault = new Vault({ service: TEST_VAULT_SERVICE });
    await vault.delete("linear:default").catch(() => {});
  });

  afterEach(async () => {
    rmSync(tempDir, { recursive: true, force: true });
    await vault.delete("linear:default").catch(() => {});
  });

  it("returns 1 and prints usage when no service arg given", async () => {
    const cap = captureStreams();
    try {
      const { runConnect } = await import("../src/commands/connect");
      const code = await runConnect([], {
        vaultService: TEST_VAULT_SERVICE,
        indexPath,
        connectImpl: async () => {
          throw new Error("should not be called");
        },
      });
      expect(code).toBe(1);
      expect(cap.stderr()).toMatch(/missing service argument/);
    } finally {
      cap.restore();
    }
  });

  it("returns 1 for unsupported service", async () => {
    const cap = captureStreams();
    try {
      const { runConnect } = await import("../src/commands/connect");
      const code = await runConnect(["notion"], {
        vaultService: TEST_VAULT_SERVICE,
        indexPath,
        connectImpl: async () => {
          throw new Error("should not be called");
        },
      });
      expect(code).toBe(1);
      expect(cap.stderr()).toMatch(/not supported/);
      expect(cap.stderr()).toMatch(/linear/);
    } finally {
      cap.restore();
    }
  });

  it("stores token and index record on success", async () => {
    const fakeBlob: TokenBlob = {
      access_token: "test_linear_tok",
      refresh_token: "test_refresh",
      expires_at: Date.now() + 86400_000,
      scopes: ["read", "write"],
    };

    const cap = captureStreams();
    try {
      const { runConnect } = await import("../src/commands/connect");
      const code = await runConnect(["linear"], {
        vaultService: TEST_VAULT_SERVICE,
        indexPath,
        connectImpl: async (service) => {
          expect(service).toBe("linear");
          return { blob: fakeBlob, client_id: "dyn_xyz" };
        },
      });
      expect(code).toBe(0);
      expect(cap.stdout()).toMatch(/Connected linear/);
      expect(cap.stdout()).toMatch(/keychain/);
    } finally {
      cap.restore();
    }

    const stored = await vault.get("linear:default");
    expect(stored?.access_token).toBe("test_linear_tok");
    expect(stored?.scopes).toEqual(["read", "write"]);

    const index = new ConnectionsIndex({ path: indexPath });
    const record = await index.get("linear:default");
    expect(record?.service).toBe("linear");
    expect(record?.displayName).toBe("Linear");
    expect(record?.connectedAt).toBeGreaterThan(0);
  });

  it("returns 1 and prints error if OAuth fails", async () => {
    const cap = captureStreams();
    try {
      const { runConnect } = await import("../src/commands/connect");
      const code = await runConnect(["linear"], {
        vaultService: TEST_VAULT_SERVICE,
        indexPath,
        connectImpl: async () => {
          throw new Error("user cancelled OAuth");
        },
      });
      expect(code).toBe(1);
      expect(cap.stderr()).toMatch(/user cancelled/);
    } finally {
      cap.restore();
    }

    expect(await vault.get("linear:default")).toBeNull();
    const index = new ConnectionsIndex({ path: indexPath });
    expect(await index.get("linear:default")).toBeNull();
  });

  it("overwrites prior connection on re-connect", async () => {
    await vault.set("linear:default", { access_token: "old_token" });
    const index = new ConnectionsIndex({ path: indexPath });
    await index.upsert({
      service: "linear",
      connectionId: "linear:default",
      connectedAt: Date.now() - 10000,
    });

    const cap = captureStreams();
    try {
      const { runConnect } = await import("../src/commands/connect");
      const code = await runConnect(["linear"], {
        vaultService: TEST_VAULT_SERVICE,
        indexPath,
        connectImpl: async () => ({
          blob: { access_token: "new_token" },
          client_id: "new_cid",
        }),
      });
      expect(code).toBe(0);
    } finally {
      cap.restore();
    }

    expect((await vault.get("linear:default"))?.access_token).toBe("new_token");
    const records = await new ConnectionsIndex({ path: indexPath }).list();
    expect(records).toHaveLength(1);
  });
});
