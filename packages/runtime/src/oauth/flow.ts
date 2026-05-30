import type { TokenBlob } from "../vault";
import { startCallbackServer } from "./callback";
import { registerClient } from "./dcr";
import { generatePKCE } from "./pkce";

const DEFAULT_WELL_KNOWN = "https://mcp.linear.app/.well-known/oauth-authorization-server";
const DEFAULT_SCOPE = "read write";
const DEFAULT_TIMEOUT_MS = 300_000;

export interface LinearOAuthConfig {
  wellKnownUrl?: string;
  scope?: string;
  timeoutMs?: number;
  openBrowser?: (url: string) => Promise<void>;
  registrationMetadataExtras?: { client_name?: string };
}

export interface ConnectLinearResult {
  blob: TokenBlob;
  client_id: string;
}

interface WellKnownConfig {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

async function defaultOpenBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  await Bun.spawn([cmd, url]).exited;
}

function randomState(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
}

export async function connectLinear(
  config: LinearOAuthConfig = {},
): Promise<ConnectLinearResult> {
  const wellKnownUrl = config.wellKnownUrl ?? DEFAULT_WELL_KNOWN;
  const scope = config.scope ?? DEFAULT_SCOPE;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const openBrowser = config.openBrowser ?? defaultOpenBrowser;

  const wkRes = await fetch(wellKnownUrl);
  if (!wkRes.ok) {
    throw new Error(`well-known fetch failed: HTTP ${wkRes.status}`);
  }
  const wk = (await wkRes.json()) as WellKnownConfig;
  if (!wk.registration_endpoint) {
    throw new Error("no registration_endpoint in well-known");
  }

  const pkce = await generatePKCE();
  const state = randomState();

  const callback = await startCallbackServer({ expectedState: state, timeoutMs });

  try {
    const reg = await registerClient(wk.registration_endpoint, {
      client_name: config.registrationMetadataExtras?.client_name ?? "tensor-mcp",
      redirect_uris: [callback.redirectUri],
      token_endpoint_auth_method: "none",
      scope,
    });

    const authorizeUrl = new URL(wk.authorization_endpoint);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", reg.client_id);
    authorizeUrl.searchParams.set("redirect_uri", callback.redirectUri);
    authorizeUrl.searchParams.set("code_challenge", pkce.challenge);
    authorizeUrl.searchParams.set("code_challenge_method", pkce.method);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("scope", scope);
    await openBrowser(authorizeUrl.toString());

    const { code } = await callback.awaitCode;

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callback.redirectUri,
      client_id: reg.client_id,
      code_verifier: pkce.verifier,
    });
    const tokRes = await fetch(wk.token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: tokenBody.toString(),
    });
    if (!tokRes.ok) {
      let errText = "";
      try {
        errText = await tokRes.text();
      } catch {
        // body unreadable; status alone is enough
      }
      throw new Error(
        `token exchange failed: HTTP ${tokRes.status} ${errText.slice(0, 200)}`,
      );
    }
    const tok = (await tokRes.json()) as TokenResponse;
    if (!tok.access_token) {
      throw new Error("token response missing access_token");
    }

    const blob: TokenBlob = {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: tok.expires_in ? Date.now() + tok.expires_in * 1000 : undefined,
      scopes: tok.scope ? tok.scope.split(/\s+/) : undefined,
    };
    return { blob, client_id: reg.client_id };
  } finally {
    callback.close();
  }
}
