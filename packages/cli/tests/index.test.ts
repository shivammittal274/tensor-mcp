import { describe, expect, it } from "bun:test";

describe("CLI command exports", () => {
  it("connect command exports", async () => {
    const { connectCmd } = await import("../src/commands/connect");
    expect(typeof connectCmd).toBe("function");
  });

  it("disconnect command exports", async () => {
    const { disconnectCmd } = await import("../src/commands/disconnect");
    expect(typeof disconnectCmd).toBe("function");
  });

  it("show command exports", async () => {
    const { showCmd } = await import("../src/commands/show");
    expect(typeof showCmd).toBe("function");
  });

  it("search command exports", async () => {
    const { searchCmd } = await import("../src/commands/search");
    expect(typeof searchCmd).toBe("function");
  });

  it("call command exports", async () => {
    const { callCmd } = await import("../src/commands/call");
    expect(typeof callCmd).toBe("function");
  });

  it("serve command exports", async () => {
    const { serveCmd } = await import("../src/commands/serve");
    expect(typeof serveCmd).toBe("function");
  });
});
