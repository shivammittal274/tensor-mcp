import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// Capture the REAL handlers before mock.module installs the spy proxies.
// Bun's mock.module is hoisted, so a static `import { runX } from ...` would
// resolve to the mocked version. Top-level dynamic import runs synchronously
// here BEFORE the mock.module calls below, so we get the genuine exports.
const realServe = (await import("../src/commands/serve")).runServe;
const realConnect = (await import("../src/commands/connect")).runConnect;
const realList = (await import("../src/commands/list")).runList;
const realDisconnect = (await import("../src/commands/disconnect")).runDisconnect;

let mocksActive = true;
// biome-ignore lint/suspicious/noExplicitAny: spy holders for module mocks
let serveSpy: any;
// biome-ignore lint/suspicious/noExplicitAny: spy holders for module mocks
let connectSpy: any;
// biome-ignore lint/suspicious/noExplicitAny: spy holders for module mocks
let listSpy: any;
// biome-ignore lint/suspicious/noExplicitAny: spy holders for module mocks
let disconnectSpy: any;

// biome-ignore lint/suspicious/noExplicitAny: rest-args proxy must accept any signature
mock.module("../src/commands/serve", () => ({
  runServe: (...args: any[]) => (mocksActive ? serveSpy(args[0]) : (realServe as any)(...args)),
}));
// biome-ignore lint/suspicious/noExplicitAny: rest-args proxy must accept any signature
mock.module("../src/commands/connect", () => ({
  runConnect: (...args: any[]) =>
    mocksActive ? connectSpy(args[0]) : (realConnect as any)(...args),
}));
// biome-ignore lint/suspicious/noExplicitAny: rest-args proxy must accept any signature
mock.module("../src/commands/list", () => ({
  runList: (...args: any[]) => (mocksActive ? listSpy(args[0]) : (realList as any)(...args)),
}));
// biome-ignore lint/suspicious/noExplicitAny: rest-args proxy must accept any signature
mock.module("../src/commands/disconnect", () => ({
  runDisconnect: (...args: any[]) =>
    mocksActive ? disconnectSpy(args[0]) : (realDisconnect as any)(...args),
}));

describe("dispatch", () => {
  let stdoutBuf: string[];
  let stderrBuf: string[];
  let origStdout: typeof process.stdout.write;
  let origStderr: typeof process.stderr.write;

  beforeEach(() => {
    mocksActive = true;
    stdoutBuf = [];
    stderrBuf = [];
    origStdout = process.stdout.write.bind(process.stdout);
    origStderr = process.stderr.write.bind(process.stderr);
    // biome-ignore lint/suspicious/noExplicitAny: test stream stubs
    process.stdout.write = ((s: any) => {
      stdoutBuf.push(String(s));
      return true;
      // biome-ignore lint/suspicious/noExplicitAny: matches Node signature
    }) as any;
    // biome-ignore lint/suspicious/noExplicitAny: test stream stubs
    process.stderr.write = ((s: any) => {
      stderrBuf.push(String(s));
      return true;
      // biome-ignore lint/suspicious/noExplicitAny: matches Node signature
    }) as any;

    serveSpy = mock(async () => 42);
    connectSpy = mock(async () => 42);
    listSpy = mock(async () => 42);
    disconnectSpy = mock(async () => 42);
  });

  afterEach(() => {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
  });

  afterAll(() => {
    // Hand control back to the real handlers so sibling test files
    // in the same Bun process see genuine implementations.
    mocksActive = false;
  });

  it("prints usage and returns 1 on empty argv", async () => {
    const { dispatch } = await import("../src/dispatch");
    const code = await dispatch([]);
    expect(code).toBe(1);
    expect(stdoutBuf.join("")).toContain("Usage:");
    expect(serveSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
    expect(listSpy).not.toHaveBeenCalled();
    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it("prints usage and returns 0 on --help", async () => {
    const { dispatch } = await import("../src/dispatch");
    const code = await dispatch(["--help"]);
    expect(code).toBe(0);
    expect(stdoutBuf.join("")).toContain("Usage:");
  });

  it("prints usage and returns 0 on -h", async () => {
    const { dispatch } = await import("../src/dispatch");
    const code = await dispatch(["-h"]);
    expect(code).toBe(0);
    expect(stdoutBuf.join("")).toContain("Usage:");
  });

  it("returns 1 and writes to stderr on unknown command", async () => {
    const { dispatch } = await import("../src/dispatch");
    const code = await dispatch(["whatevs"]);
    expect(code).toBe(1);
    expect(stderrBuf.join("")).toContain("unknown command 'whatevs'");
    expect(serveSpy).not.toHaveBeenCalled();
  });

  it("dispatches serve with remaining args", async () => {
    const { dispatch } = await import("../src/dispatch");
    const code = await dispatch(["serve", "--foo", "bar"]);
    expect(code).toBe(42);
    expect(serveSpy).toHaveBeenCalledTimes(1);
    expect(serveSpy).toHaveBeenCalledWith(["--foo", "bar"]);
  });

  it("dispatches connect with remaining args", async () => {
    const { dispatch } = await import("../src/dispatch");
    const code = await dispatch(["connect", "linear"]);
    expect(code).toBe(42);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledWith(["linear"]);
  });

  it("dispatches list with remaining args", async () => {
    const { dispatch } = await import("../src/dispatch");
    const code = await dispatch(["list"]);
    expect(code).toBe(42);
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(listSpy).toHaveBeenCalledWith([]);
  });

  it("dispatches disconnect with remaining args", async () => {
    const { dispatch } = await import("../src/dispatch");
    const code = await dispatch(["disconnect", "linear"]);
    expect(code).toBe(42);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledWith(["linear"]);
  });

  it("propagates handler return value as exit code", async () => {
    serveSpy = mock(async () => 7);
    const { dispatch } = await import("../src/dispatch");
    const code = await dispatch(["serve"]);
    expect(code).toBe(7);
  });

  it("dispatches each command to exactly one handler (no cross-firing)", async () => {
    const { dispatch } = await import("../src/dispatch");
    await dispatch(["list"]);
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(serveSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
    expect(disconnectSpy).not.toHaveBeenCalled();
  });
});
