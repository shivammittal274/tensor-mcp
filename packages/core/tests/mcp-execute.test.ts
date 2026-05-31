import { describe, expect, it } from "bun:test";
import { type ExecuteToolDeps, executeTool } from "../src/mcp/execute";
import type { KeyValueStore, TokenBundle } from "../src/stores/types";
import type {
  McpClientHandle,
  McpToolResult,
  RemoteMcpConfig,
} from "../src/transports/remote";

class FakeTokenStore implements Pick<KeyValueStore<TokenBundle>, "get"> {
  private readonly map = new Map<string, TokenBundle>();

  constructor(entries: Record<string, TokenBundle> = {}) {
    for (const [k, v] of Object.entries(entries)) this.map.set(k, v);
  }
  async get(key: string): Promise<TokenBundle | null> {
    return this.map.get(key) ?? null;
  }
}

interface ClientLog {
  closed: boolean;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
}

function fakeRemote(url = "https://fake.example.com/mcp"): RemoteMcpConfig {
  return { mcpUrl: url };
}

function fakeConnect(
  result: McpToolResult | (() => Promise<McpToolResult>),
  log: ClientLog,
): ExecuteToolDeps["connectClient"] {
  return async (_url: string): Promise<McpClientHandle> => ({
    async listTools() {
      return [];
    },
    async callTool(name: string, args: Record<string, unknown>) {
      log.calls.push({ name, args });
      return typeof result === "function" ? await result() : result;
    },
    async close() {
      log.closed = true;
    },
  });
}

describe("executeTool", () => {
  it("throws on unknown app", async () => {
    const log: ClientLog = { closed: false, calls: [] };
    const deps: ExecuteToolDeps = {
      tokenStore: new FakeTokenStore(),
      getRemote: () => undefined,
      connectClient: fakeConnect({ content: [] }, log),
    };
    await expect(
      executeTool({ app: "unknown", tool: "x" }, deps),
    ).rejects.toThrow(/unknown app 'unknown'/);
  });

  it("throws on not-connected (missing token)", async () => {
    const log: ClientLog = { closed: false, calls: [] };
    const deps: ExecuteToolDeps = {
      tokenStore: new FakeTokenStore(),
      getRemote: (a) => (a === "linear" ? fakeRemote() : undefined),
      connectClient: fakeConnect({ content: [] }, log),
    };
    await expect(
      executeTool({ app: "linear", tool: "linear_create_issue" }, deps),
    ).rejects.toThrow(/'linear' is not connected/);
  });

  it("happy path: returns MCP content and closes client", async () => {
    const log: ClientLog = { closed: false, calls: [] };
    const expected: McpToolResult = {
      content: [{ type: "text", text: '{"ok":true}' }],
    };
    const deps: ExecuteToolDeps = {
      tokenStore: new FakeTokenStore({
        "linear:default": { access_token: "tok-abc" },
      }),
      getRemote: (a) => (a === "linear" ? fakeRemote() : undefined),
      connectClient: fakeConnect(expected, log),
    };
    const result = await executeTool(
      { app: "linear", tool: "linear_create_issue", input: { title: "Hello" } },
      deps,
    );
    expect(result.content).toEqual(expected.content);
    expect(log.calls).toHaveLength(1);
    expect(log.calls[0]?.name).toBe("linear_create_issue");
    expect(log.calls[0]?.args).toEqual({ title: "Hello" });
    expect(log.closed).toBe(true);
  });

  it("propagates isError flag from the underlying tool", async () => {
    const log: ClientLog = { closed: false, calls: [] };
    const expected: McpToolResult = {
      content: [{ type: "text", text: "boom" }],
      isError: true,
    };
    const deps: ExecuteToolDeps = {
      tokenStore: new FakeTokenStore({
        "slack:default": { access_token: "xoxb-1" },
      }),
      getRemote: (a) => (a === "slack" ? fakeRemote() : undefined),
      connectClient: fakeConnect(expected, log),
    };
    const result = await executeTool(
      { app: "slack", tool: "slack_send_message", input: {} },
      deps,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("boom");
    expect(log.closed).toBe(true);
  });

  it("propagates errors thrown by the client and still closes it", async () => {
    const log: ClientLog = { closed: false, calls: [] };
    const failing = async (): Promise<McpToolResult> => {
      throw new Error("network down");
    };
    const deps: ExecuteToolDeps = {
      tokenStore: new FakeTokenStore({
        "jira:default": { access_token: "pat-xyz" },
      }),
      getRemote: (a) => (a === "jira" ? fakeRemote() : undefined),
      connectClient: fakeConnect(failing, log),
    };
    await expect(
      executeTool({ app: "jira", tool: "jira_create_ticket" }, deps),
    ).rejects.toThrow(/network down/);
    expect(log.closed).toBe(true);
  });

  it("rejects when required args are missing", async () => {
    const log: ClientLog = { closed: false, calls: [] };
    const deps: ExecuteToolDeps = {
      tokenStore: new FakeTokenStore(),
      getRemote: (a) => (a === "linear" ? fakeRemote() : undefined),
      connectClient: fakeConnect({ content: [] }, log),
    };
    await expect(
      executeTool(
        { app: "", tool: "x" } as unknown as Parameters<typeof executeTool>[0],
        deps,
      ),
    ).rejects.toThrow(/requires `app` and `tool`/);
    await expect(
      executeTool(
        { app: "linear", tool: "" } as unknown as Parameters<
          typeof executeTool
        >[0],
        deps,
      ),
    ).rejects.toThrow(/requires `app` and `tool`/);
  });
});
