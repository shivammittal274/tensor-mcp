import type { TokenBlob } from "../vault";

interface AuthDataPayload {
  access_token: string;
}

function buildPayload(service: string, blob: TokenBlob): AuthDataPayload {
  // All Phase 1 services use the same shape.
  // Switch on service name preserves a seam for Phase 2 (e.g. slack bot+user split).
  switch (service) {
    case "linear":
    case "gmail":
    case "notion":
    case "github":
    case "slack":
    default:
      return { access_token: blob.access_token };
  }
}

/**
 * Forge the `x-auth-data` header / `AUTH_DATA` env var value for a vendored
 * Klavis MCP server. Returns the base64-encoded JSON string the server expects.
 */
export function forgeAuthData(service: string, blob: TokenBlob): string {
  const payload = buildPayload(service, blob);
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/** Inverse for tests / debugging: decode the value back to JSON. */
export function decodeAuthData(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}
