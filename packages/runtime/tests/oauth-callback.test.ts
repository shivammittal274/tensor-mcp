import { describe, expect, it } from "bun:test";
import { startCallbackServer } from "../src/oauth/callback";

describe("startCallbackServer", () => {
  it("returns a redirectUri pointing at the local ephemeral port", async () => {
    const { redirectUri, port, close } = await startCallbackServer({ expectedState: "abc" });
    try {
      expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
      expect(redirectUri).toContain(String(port));
      expect(port).toBeGreaterThan(0);
    } finally {
      close();
    }
  });

  it("resolves awaitCode with code on valid callback", async () => {
    const { redirectUri, awaitCode, close } = await startCallbackServer({ expectedState: "state123" });
    try {
      const url = `${redirectUri}?code=AUTHCODE&state=state123`;
      const fetchPromise = fetch(url);
      const result = await awaitCode;
      expect(result.code).toBe("AUTHCODE");
      expect(result.redirectUri).toBe(redirectUri);
      await fetchPromise;
    } finally {
      close();
    }
  });

  it("rejects on state mismatch", async () => {
    const { redirectUri, awaitCode, close } = await startCallbackServer({ expectedState: "expected" });
    try {
      const url = `${redirectUri}?code=AUTHCODE&state=different`;
      fetch(url).catch(() => {});
      await expect(awaitCode).rejects.toThrow(/state mismatch/);
    } finally {
      close();
    }
  });

  it("rejects on provider error", async () => {
    const { redirectUri, awaitCode, close } = await startCallbackServer({ expectedState: "abc" });
    try {
      const url = `${redirectUri}?error=access_denied&error_description=User+rejected`;
      fetch(url).catch(() => {});
      await expect(awaitCode).rejects.toThrow(/User rejected|access_denied/);
    } finally {
      close();
    }
  });

  it("returns success HTML to the browser on valid callback", async () => {
    const { redirectUri, awaitCode, close } = await startCallbackServer({ expectedState: "abc" });
    try {
      const url = `${redirectUri}?code=C&state=abc`;
      const [response] = await Promise.all([fetch(url), awaitCode]);
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).toContain("tensor-mcp");
      expect(body.toLowerCase()).toContain("close this tab");
    } finally {
      close();
    }
  });

  it("rejects with timeout error after timeoutMs", async () => {
    const { awaitCode, close } = await startCallbackServer({ expectedState: "abc", timeoutMs: 100 });
    try {
      await expect(awaitCode).rejects.toThrow(/timeout/i);
    } finally {
      close();
    }
  });

  it("close() shuts down the server", async () => {
    const { redirectUri, port, close } = await startCallbackServer({ expectedState: "abc" });
    close();
    await new Promise((r) => setTimeout(r, 50));
    let connected = false;
    try {
      await fetch(`${redirectUri}?code=x&state=abc`, { signal: AbortSignal.timeout(200) });
      connected = true;
    } catch {
      // expected — server is closed
    }
    expect(connected).toBe(false);
    expect(port).toBeGreaterThan(0);
  });
});
