import type { AuthStrategy } from "./auth/types";
import type { ActivepiecesPiece } from "./services/adapt/activepieces/framework";
import type { RemoteMcpConfig } from "./transports/remote";
import type { SpawnConfig } from "./transports/types";

/**
 * A connectable third-party service. Every service is fully declared by a
 * single entry in `core/services.ts`: an auth strategy + an execution
 * descriptor — `spawn` (local subprocess), `remote` (hosted MCP), or
 * `activepieces` (in-process action dispatch via the AP shim).
 */
export interface Service {
  /** URL-safe slug used as the connection key (e.g. "linear", "github"). */
  id: string;

  /** Human-readable name shown in CLI/UI (e.g. "Linear", "GitHub"). */
  displayName: string;

  /** How to authenticate. Composable strategy: OAuth DCR / static / PAT / API key. */
  auth: AuthStrategy;

  /**
   * Local subprocess execution — vendorDir + command + envInject +
   * forgeAuthData. Mutually exclusive with `remote` / `activepieces`.
   */
  spawn?: SpawnConfig;

  /**
   * Hosted-MCP execution — connect a Streamable HTTP MCP client straight
   * to the vendor's URL with our stored token as a Bearer header. No local
   * subprocess. Mutually exclusive with `spawn` / `activepieces`.
   */
  remote?: RemoteMcpConfig;

  /**
   * Activepieces in-process dispatch. The piece's `createAction({ run })`
   * fires directly inside the tensor-mcp process — no subprocess, no
   * outbound MCP. Mutually exclusive with `spawn` / `remote`.
   */
  activepieces?: ActivepiecesConfig;
}

export interface ActivepiecesConfig {
  /** The piece object returned by `createPiece({...})` in the lifted source. */
  piece: ActivepiecesPiece;
}

/**
 * Identity helper for service files — provides type inference and a single
 * import surface in `core/services.ts`. Enforces exactly-one of
 * `spawn` / `remote` / `activepieces` at runtime (TypeScript can't model
 * "exclusive or" cleanly without inflating the call site).
 */
export function defineService(s: Service): Service {
  const transports = [s.spawn, s.remote, s.activepieces].filter(
    (t) => t != null,
  ).length;
  if (transports !== 1) {
    throw new Error(
      `defineService('${s.id}'): exactly one of 'spawn' / 'remote' / 'activepieces' must be set (got ${transports})`,
    );
  }
  return s;
}
