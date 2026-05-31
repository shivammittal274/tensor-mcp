import { describe, expect, it } from "bun:test";
import { klavisPython, klavisTypescript } from "../src/transports/klavis";
import { buildSpawnArgs } from "../src/transports/stdio-spawn";
import type { SpawnConfig } from "../src/transports/types";

const TENSOR_MCP_ROOT = "/tmp/fake-tensor-mcp-root";

describe("klavisPython", () => {
  it("produces the standard python command", () => {
    const spawn = klavisPython("vendored/linear");
    expect(spawn.command).toEqual([
      "uv",
      "run",
      "--with-requirements",
      "requirements.txt",
      "python",
      "server.py",
      "--port",
      "{{PORT}}",
    ]);
    expect(spawn.vendorDir).toBe("vendored/linear");
  });

  it("passes through forgeAuthData", () => {
    const forge = (b: { access_token: string }) => ({ tok: b.access_token });
    const spawn = klavisPython("vendored/slack", { forgeAuthData: forge });
    expect(spawn.forgeAuthData).toBe(forge);
  });

  it("passes through envInject", () => {
    const spawn = klavisPython("vendored/x", {
      envInject: { LOG_LEVEL: "debug" },
    });
    expect(spawn.envInject).toEqual({ LOG_LEVEL: "debug" });
  });
});

describe("klavisTypescript", () => {
  it("produces the standard bun command + PORT env", () => {
    const spawn = klavisTypescript("vendored/jira");
    expect(spawn.command).toEqual(["bun", "run", "index.ts"]);
    expect(spawn.envInject?.PORT).toBe("{{PORT}}");
    expect(spawn.vendorDir).toBe("vendored/jira");
  });

  it("user envInject merges with PORT default", () => {
    const spawn = klavisTypescript("vendored/notion", {
      envInject: { LOG_LEVEL: "debug" },
    });
    expect(spawn.envInject).toEqual({
      PORT: "{{PORT}}",
      LOG_LEVEL: "debug",
    });
  });
});

describe("buildSpawnArgs", () => {
  it("joins relative vendorDir under tensorMcpRoot", () => {
    const args = buildSpawnArgs("linear", klavisPython("vendored/linear"), {
      token: { access_token: "abc" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    expect(args.cwd).toBe(`${TENSOR_MCP_ROOT}/vendored/linear`);
  });

  it("respects an absolute vendorDir (no join with root)", () => {
    const args = buildSpawnArgs("x", klavisPython("/abs/path/to/server"), {
      token: { access_token: "x" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    expect(args.cwd).toBe("/abs/path/to/server");
  });

  it("defaults AUTH_DATA to raw JSON {access_token}", () => {
    const args = buildSpawnArgs("linear", klavisPython("vendored/linear"), {
      token: { access_token: "tok-1" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    const decoded = JSON.parse(args.authData ?? "");
    expect(decoded).toEqual({ access_token: "tok-1" });
  });

  it("uses forgeAuthData override (Slack nested shape)", () => {
    const spawn = klavisPython("vendored/slack", {
      forgeAuthData: (bundle) => ({
        authed_user: { access_token: bundle.access_token },
      }),
    });
    const args = buildSpawnArgs("slack", spawn, {
      token: { access_token: "xoxb-test" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    const decoded = JSON.parse(args.authData ?? "");
    expect(decoded).toEqual({
      authed_user: { access_token: "xoxb-test" },
    });
  });

  it("forwards envInject", () => {
    const spawn = klavisTypescript("vendored/notion", {
      envInject: { LOG_LEVEL: "debug" },
    });
    const args = buildSpawnArgs("notion", spawn, {
      token: { access_token: "tok" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    expect(args.envInject?.LOG_LEVEL).toBe("debug");
    expect(args.envInject?.PORT).toBe("{{PORT}}");
  });

  it("forwards port + readinessTimeoutMs", () => {
    const args = buildSpawnArgs("linear", klavisPython("vendored/linear"), {
      token: { access_token: "x" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
      port: 5555,
      readinessTimeoutMs: 1234,
    });
    expect(args.port).toBe(5555);
    expect(args.readinessTimeoutMs).toBe(1234);
  });

  it("propagates the service name", () => {
    const args = buildSpawnArgs("notion", klavisPython("vendored/notion"), {
      token: { access_token: "x" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    expect(args.service).toBe("notion");
  });

  it("works with a literal SpawnConfig (no helper)", () => {
    const spawn: SpawnConfig = {
      vendorDir: "vendored/github",
      command: ["./bin/server"],
      envInject: { PORT: "{{PORT}}" },
    };
    const args = buildSpawnArgs("github", spawn, {
      token: { access_token: "ghp_x" },
      tensorMcpRoot: TENSOR_MCP_ROOT,
    });
    expect(args.command).toEqual(["./bin/server"]);
    expect(args.cwd).toBe(`${TENSOR_MCP_ROOT}/vendored/github`);
    expect(args.envInject?.PORT).toBe("{{PORT}}");
  });
});
