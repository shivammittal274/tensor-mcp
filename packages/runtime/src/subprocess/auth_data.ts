import type { TokenBlob } from "../vault";
import { getService } from "../services";

/**
 * Forge the `x-auth-data` header / `AUTH_DATA` env var value for a vendored
 * Klavis MCP server. Returns the base64-encoded JSON string the server expects.
 */
export function forgeAuthData(service: string, blob: TokenBlob): string {
  const def = getService(service);
  const payload = def ? def.authShape(blob) : { access_token: blob.access_token };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/** Inverse for tests / debugging: decode the value back to JSON. */
export function decodeAuthData(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}
