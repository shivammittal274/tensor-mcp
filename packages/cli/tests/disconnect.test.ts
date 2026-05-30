import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault, ConnectionsIndex } from "@tensor-mcp/runtime";

const TEST_VAULT_SERVICE = "com.tensormcp.cli.test.disconnect";

function captureStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((s: any) => { stdout.push(String(s)); return true; }) as any;
  process.stderr.write = ((s: any) => { stderr.push(String(s)); return true; }) as any;
  return {
    restore: () => { process.stdout.write = origOut; process.stderr.write = origErr; },
    stdout: () => stdout.join(""),
    stderr: () => stderr.join(""),
  };
}

describe("disconnect command", () => {
  let tempDir: string;
  let indexPath: string;
  let vault: Vault;
  let index: ConnectionsIndex;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-disconnect-"));
    indexPath = join(tempDir, "connections.json");
    vault = new Vault({ service: TEST_VAULT_SERVICE });
    index = new ConnectionsIndex({ path: indexPath });
    await vault.delete("linear:default").catch(() => {});
    await vault.delete("slack:default").catch(() => {});
  });

  afterEach(async () => {
    rmSync(tempDir, { recursive: true, force: true });
    await vault.delete("linear:default").catch(() => {});
    await vault.delete("slack:default").catch(() => {});
  });

  it("returns 1 and prints usage when no service arg given", async () => {
    const cap = captureStreams();
    try {
      const { runDisconnect } = await import("../src/commands/disconnect");
      const code = await runDisconnect([], { vaultService: TEST_VAULT_SERVICE, indexPath });
      expect(code).toBe(1);
      expect(cap.stderr()).toMatch(/missing service argument/);
    } finally { cap.restore(); }
  });

  it("returns 1 when service is not connected", async () => {
    const cap = captureStreams();
    try {
      const { runDisconnect } = await import("../src/commands/disconnect");
      const code = await runDisconnect(["linear"], { vaultService: TEST_VAULT_SERVICE, indexPath });
      expect(code).toBe(1);
      expect(cap.stderr()).toMatch(/not connected/);
    } finally { cap.restore(); }
  });

  it("removes both keychain entry and index record on success", async () => {
    await vault.set("linear:default", { access_token: "tok123" });
    await index.upsert({
      service: "linear",
      connectionId: "linear:default",
      connectedAt: Date.now(),
    });

    const cap = captureStreams();
    try {
      const { runDisconnect } = await import("../src/commands/disconnect");
      const code = await runDisconnect(["linear"], { vaultService: TEST_VAULT_SERVICE, indexPath });
      expect(code).toBe(0);
      expect(cap.stdout()).toMatch(/Disconnected 'linear'/);
    } finally { cap.restore(); }

    expect(await vault.get("linear:default")).toBeNull();
    expect(await index.get("linear:default")).toBeNull();
  });

  it("does not affect other connections", async () => {
    await vault.set("linear:default", { access_token: "linear_tok" });
    await vault.set("slack:default", { access_token: "slack_tok" });
    await index.upsert({ service: "linear", connectionId: "linear:default", connectedAt: 1 });
    await index.upsert({ service: "slack", connectionId: "slack:default", connectedAt: 2 });

    const cap = captureStreams();
    try {
      const { runDisconnect } = await import("../src/commands/disconnect");
      const code = await runDisconnect(["linear"], { vaultService: TEST_VAULT_SERVICE, indexPath });
      expect(code).toBe(0);
    } finally { cap.restore(); }

    expect(await vault.get("linear:default")).toBeNull();
    expect(await vault.get("slack:default")).not.toBeNull();
    expect(await index.get("slack:default")).not.toBeNull();
  });

  it("handles partial state (keychain has token but index missing)", async () => {
    await vault.set("linear:default", { access_token: "orphan" });

    const cap = captureStreams();
    try {
      const { runDisconnect } = await import("../src/commands/disconnect");
      const code = await runDisconnect(["linear"], { vaultService: TEST_VAULT_SERVICE, indexPath });
      expect(code).toBe(1);
      expect(cap.stderr()).toMatch(/not connected/);
    } finally { cap.restore(); }
  });
});
