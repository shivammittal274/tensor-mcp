/**
 * Typed errors thrown by auth strategies. Lets callers branch on `instanceof`
 * instead of string-matching error messages (which kept biting us — see the
 * old `instructions.includes("not configured")` filter in
 * `services/index.ts`).
 *
 * Conventions:
 *   - `AuthNotConfiguredError`  — strategy can't run because vendor-specific
 *     config (e.g. a client_id env var) is missing. Recoverable: user sets
 *     the env var and re-runs. Surfaces as `status: "not_configured"` in
 *     `connectApp`.
 *   - `AuthRefreshFailedError`  — `refresh()` was called and the vendor
 *     rejected the refresh_token (rotation collision, revoked grant, …).
 *     Caller surfaces a "re-run connect" prompt — never re-opens a browser
 *     from a non-interactive context.
 */

export class AuthNotConfiguredError extends Error {
  readonly name = "AuthNotConfiguredError";
  readonly serviceId: string;
  /** Human-readable hint about what to set (env var, register-app URL, …). */
  readonly hint: string;
  constructor(serviceId: string, hint: string) {
    super(`auth not configured for '${serviceId}': ${hint}`);
    this.serviceId = serviceId;
    this.hint = hint;
  }
}

export class AuthRefreshFailedError extends Error {
  readonly name = "AuthRefreshFailedError";
  readonly serviceId: string;
  readonly underlying?: unknown;
  constructor(serviceId: string, message: string, underlying?: unknown) {
    super(`refresh failed for '${serviceId}': ${message}`);
    this.serviceId = serviceId;
    this.underlying = underlying;
  }
}
