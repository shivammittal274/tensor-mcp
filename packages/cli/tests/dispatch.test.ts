import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { dispatch } from "../src/dispatch";

describe("dispatch", () => {
  let stdoutBuf: string[] = [];
  let stderrBuf: string[] = [];
  let origStdout: typeof process.stdout.write;
  let origStderr: typeof process.stderr.write;

  beforeEach(() => {
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
  });

  afterEach(() => {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
  });

  it("prints usage and returns 1 on empty argv", async () => {
    const code = await dispatch([]);
    expect(code).toBe(1);
    expect(stdoutBuf.join("")).toContain("Usage:");
  });

  it("prints usage and returns 0 on --help", async () => {
    const code = await dispatch(["--help"]);
    expect(code).toBe(0);
    expect(stdoutBuf.join("")).toContain("Usage:");
  });

  it("returns 1 and writes to stderr on unknown command", async () => {
    const code = await dispatch(["whatevs"]);
    expect(code).toBe(1);
    expect(stderrBuf.join("")).toContain("unknown command 'whatevs'");
  });

  it("invokes serve stub", async () => {
    const code = await dispatch(["serve"]);
    expect(code).toBe(2);
    expect(stderrBuf.join("")).toContain("not implemented yet (Task 5.3)");
  });

  it("invokes connect stub", async () => {
    const code = await dispatch(["connect", "linear"]);
    expect(code).toBe(2);
    expect(stderrBuf.join("")).toContain("not implemented yet (Task 3.2)");
  });

  it("invokes list stub", async () => {
    const code = await dispatch(["list"]);
    expect(code).toBe(2);
    expect(stderrBuf.join("")).toContain("not implemented yet (Task 3.3)");
  });

  it("invokes disconnect stub", async () => {
    const code = await dispatch(["disconnect", "linear"]);
    expect(code).toBe(2);
    expect(stderrBuf.join("")).toContain("not implemented yet (Task 3.4)");
  });
});
