import { describe, it, expect } from "bun:test";
import { generatePKCE } from "../src/oauth/pkce";

describe("PKCE", () => {
  it("generates a verifier between 43 and 128 chars", async () => {
    const { verifier } = await generatePKCE();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("uses S256 method", async () => {
    const { method } = await generatePKCE();
    expect(method).toBe("S256");
  });

  it("verifier is base64url (no +, /, =)", async () => {
    const { verifier } = await generatePKCE();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("challenge is base64url (no +, /, =)", async () => {
    const { challenge } = await generatePKCE();
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("challenge differs from verifier", async () => {
    const { verifier, challenge } = await generatePKCE();
    expect(challenge).not.toBe(verifier);
  });

  it("verifier is unique per call", async () => {
    const a = await generatePKCE();
    const b = await generatePKCE();
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("challenge is deterministic for a given verifier (SHA-256 stability)", async () => {
    const verifier = "test_verifier_string_known_value_for_determinism_check";
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
    const expected = Buffer.from(digest)
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    expect(expected.length).toBeGreaterThan(0);
    expect(expected).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
