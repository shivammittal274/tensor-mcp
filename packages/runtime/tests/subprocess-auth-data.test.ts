import { describe, it, expect } from "bun:test";
import { forgeAuthData, decodeAuthData } from "../src/subprocess/auth_data";
import type { TokenBlob } from "../src/vault";

const SAMPLE_BLOB: TokenBlob = {
  access_token: "linear_bearer_xyz",
  refresh_token: "linear_refresh_abc",
  expires_at: 1700000000000,
  scopes: ["read", "write"],
};

describe("forgeAuthData", () => {
  it("forges base64-encoded JSON with access_token for linear", () => {
    const value = forgeAuthData("linear", SAMPLE_BLOB);
    const decoded = decodeAuthData(value) as Record<string, unknown>;
    expect(decoded.access_token).toBe("linear_bearer_xyz");
  });

  it("forges the same shape for gmail", () => {
    const value = forgeAuthData("gmail", { access_token: "google_token" });
    const decoded = decodeAuthData(value) as Record<string, unknown>;
    expect(decoded.access_token).toBe("google_token");
  });

  it("forges the same shape for slack (Phase 1)", () => {
    const value = forgeAuthData("slack", { access_token: "xoxb-test" });
    const decoded = decodeAuthData(value) as Record<string, unknown>;
    expect(decoded.access_token).toBe("xoxb-test");
  });

  it("forges the same shape for unknown services (default branch)", () => {
    const value = forgeAuthData("future-service", { access_token: "tok" });
    const decoded = decodeAuthData(value) as Record<string, unknown>;
    expect(decoded.access_token).toBe("tok");
  });

  it("returns a value parseable as base64 -> JSON -> object", () => {
    const value = forgeAuthData("linear", SAMPLE_BLOB);
    const json = Buffer.from(value, "base64").toString("utf8");
    const obj = JSON.parse(json);
    expect(typeof obj).toBe("object");
    expect(obj.access_token).toBe("linear_bearer_xyz");
  });

  it("does NOT include refresh_token, expires_at, or scopes in the auth data", () => {
    const value = forgeAuthData("linear", SAMPLE_BLOB);
    const decoded = decodeAuthData(value) as Record<string, unknown>;
    expect(decoded.refresh_token).toBeUndefined();
    expect(decoded.expires_at).toBeUndefined();
    expect(decoded.scopes).toBeUndefined();
  });

  it("decodes a round-trip correctly", () => {
    const value = forgeAuthData("linear", SAMPLE_BLOB);
    const decoded = decodeAuthData(value);
    expect(decoded).toEqual({ access_token: "linear_bearer_xyz" });
  });
});
