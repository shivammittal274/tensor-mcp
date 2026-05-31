import { describe, expect, it } from "bun:test";

// Smoke test: every cac-wired command resolves and exports the function the
// router calls. If a file gets renamed without updating index.ts the test
// load fails before any subcommand can break a user.

describe("CLI command exports", () => {
  it("apps command exports", async () => {
    const { appsCmd } = await import("../src/commands/apps.cmd");
    expect(typeof appsCmd).toBe("function");
  });

  it("connect command exports", async () => {
    const { connectCmd } = await import("../src/commands/connect.cmd");
    expect(typeof connectCmd).toBe("function");
  });

  it("disconnect command exports", async () => {
    const { disconnectCmd } = await import("../src/commands/disconnect.cmd");
    expect(typeof disconnectCmd).toBe("function");
  });

  it("search command exports", async () => {
    const { searchCmd } = await import("../src/commands/search.cmd");
    expect(typeof searchCmd).toBe("function");
  });

  it("execute command exports", async () => {
    const { executeCmd } = await import("../src/commands/execute.cmd");
    expect(typeof executeCmd).toBe("function");
  });

  it("serve command exports", async () => {
    const { serveCmd } = await import("../src/commands/serve.cmd");
    expect(typeof serveCmd).toBe("function");
  });

  it("tool command exports", async () => {
    const { toolAddCmd } = await import("../src/commands/tool.cmd");
    expect(typeof toolAddCmd).toBe("function");
  });
});
