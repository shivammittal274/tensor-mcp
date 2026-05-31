import type { TokenBundle } from "../stores/types";

/**
 * Per-service in-memory mutex around `strategy.refresh()`.
 *
 * Why this exists: vendors like Microsoft Entra and Dropbox issue
 * single-use refresh tokens that get invalidated the moment a new pair is
 * minted. When `tensor-mcp serve` handles two parallel tool calls that
 * both see an expired bundle, both POST the same refresh_token grant —
 * the first wins, the second hits `invalid_grant`.
 *
 * The coalescer ensures only one refresh runs per service at a time;
 * concurrent callers piggyback on the in-flight promise and receive the
 * same fresh bundle. In-memory only — cross-process coordination isn't
 * needed because a user runs one `serve` instance at a time.
 */
const inFlight = new Map<string, Promise<TokenBundle>>();

export function withRefreshLock(
  serviceId: string,
  refresh: () => Promise<TokenBundle>,
): Promise<TokenBundle> {
  const existing = inFlight.get(serviceId);
  if (existing) return existing;
  const p = refresh().finally(() => {
    inFlight.delete(serviceId);
  });
  inFlight.set(serviceId, p);
  return p;
}
