import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { SpawnSubprocessOptions } from "../src/subprocess/spawn";
import type { SpawnedProcess } from "../src/subprocess/types";

interface Captured {
  args: SpawnSubprocessOptions;
}

const captured: { last: Captured | null } = { last: null };

const fakeHandle = (): SpawnedProcess => ({
  service: "klavis",
  port: 4242,
  pid: 99,
  mcpUrl: "http://127.0.0.1:4242/mcp",
  exited: new Promise<number>(() => {}),
  async kill() {},
});

mock.module("../src/subprocess/spawn", () => ({
  spawnSubprocess: async (
    opts: SpawnSubprocessOptions,
  ): Promise<SpawnedProcess> => {
    captured.last = { args: opts };
    return fakeHandle();
  },
}));

// Import AFTER the module mock so klavisExecutor binds to the fake.
const { klavisExecutor } = await import("../src/subprocess/klavis-executor");
const TENSOR_MCP_ROOT = "/tmp/fake-tensor-mcp-root";

beforeEach(() => {
  captured.last = null;
});

describe("klavisExecutor", () => {
  it("generates the python command and joins vendorDir under tensorMcpRoot", async () => {
    const exec = klavisExecutor({
      lang: "python",
      vendorDir: "vendored/linear",
    });
    await exec.spawn({
      token: { access_token: "abc" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });

    const args = captured.last?.args;
    expect(args).toBeTruthy();
    expect(args?.command).toEqual([
      "uv",
      "run",
      "--with-requirements",
      "requirements.txt",
      "python",
      "server.py",
      "--port",
      "{{PORT}}",
    ]);
    expect(args?.cwd).toBe(`${TENSOR_MCP_ROOT}/vendored/linear`);
  });

  it("generates the typescript command and injects PORT={{PORT}} via env", async () => {
    const exec = klavisExecutor({
      lang: "typescript",
      vendorDir: "vendored/jira",
    });
    await exec.spawn({
      token: { access_token: "abc" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });

    const args = captured.last?.args;
    expect(args?.command).toEqual(["bun", "run", "index.ts"]);
    expect(args?.envInject?.PORT).toBe("{{PORT}}");
    expect(args?.cwd).toBe(`${TENSOR_MCP_ROOT}/vendored/jira`);
  });

  it("defaults AUTH_DATA to base64({access_token})", async () => {
    const exec = klavisExecutor({
      lang: "python",
      vendorDir: "vendored/linear",
    });
    await exec.spawn({
      token: { access_token: "tok-1" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    const authB64 = captured.last?.args.authData ?? "";
    const decoded = JSON.parse(Buffer.from(authB64, "base64").toString("utf8"));
    expect(decoded).toEqual({ access_token: "tok-1" });
  });

  it("forgeAuthData override is respected (e.g. Slack nested shape)", async () => {
    const exec = klavisExecutor({
      lang: "python",
      vendorDir: "vendored/slack",
      forgeAuthData: (bundle) => ({
        authed_user: { access_token: bundle.access_token },
      }),
    });
    await exec.spawn({
      token: { access_token: "xoxb-test" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    const authB64 = captured.last?.args.authData ?? "";
    const decoded = JSON.parse(Buffer.from(authB64, "base64").toString("utf8"));
    expect(decoded).toEqual({
      authed_user: { access_token: "xoxb-test" },
    });
  });

  it("propagates user envInject and merges with PORT for typescript", async () => {
    const exec = klavisExecutor({
      lang: "typescript",
      vendorDir: "vendored/notion",
      envInject: { LOG_LEVEL: "debug" },
    });
    await exec.spawn({
      token: { access_token: "tok" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    const env = captured.last?.args.envInject ?? {};
    expect(env.LOG_LEVEL).toBe("debug");
    expect(env.PORT).toBe("{{PORT}}");
  });

  it("respects an absolute vendorDir (no join with root)", async () => {
    const exec = klavisExecutor({
      lang: "python",
      vendorDir: "/abs/path/to/server",
    });
    await exec.spawn({
      token: { access_token: "x" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    expect(captured.last?.args.cwd).toBe("/abs/path/to/server");
  });

  it("passes through readinessTimeoutMs and port", async () => {
    const exec = klavisExecutor({
      lang: "python",
      vendorDir: "vendored/linear",
    });
    await exec.spawn({
      token: { access_token: "x" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
      port: 5555,
      readinessTimeoutMs: 1234,
    });
    expect(captured.last?.args.port).toBe(5555);
    expect(captured.last?.args.readinessTimeoutMs).toBe(1234);
  });
});
