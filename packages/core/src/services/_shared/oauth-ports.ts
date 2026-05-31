/**
 * Fixed loopback ports for OAuth vendors that require an exact-match
 * redirect URI (no wildcards). Each entry corresponds to a registered
 * `http://127.0.0.1:<port>/callback` on the vendor's OAuth app config.
 *
 * Single source of truth — picking the same port twice would silently
 * break one of the vendors at runtime. Add new ports here, not inline
 * in service files.
 *
 * Range 33418-33499 is reserved for tensor-mcp; well above the typical
 * dev-server range (3000-9000) but still inside the IANA dynamic/
 * private-port band (49152-65535 is the strict private range; 1024-49151
 * is the registered/dynamic mixed band where collisions are unlikely).
 */
export const OAUTH_PORTS = {
  slack: 33418,
  github: 33419,
  notion: 33420,
  discord: 33421,
  microsoft: 33422,
  hubspot: 33423,
  dropbox: 33424,
} as const;

export type OAuthPortVendor = keyof typeof OAUTH_PORTS;
