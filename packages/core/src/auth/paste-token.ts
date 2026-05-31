import type { TokenBundle } from "../stores/types";
import type { AuthStrategy, ConnectOptions } from "./types";

/**
 * Auth strategy for services that issue user-pasteable credentials —
 * either a Personal Access Token (GitHub-style) or a long-lived API key
 * (Cal.com-style). The mechanism is identical; only the framing differs.
 *
 * Refresh is a no-op: paste credentials don't have a refresh-token grant.
 * On expiry / revocation the user re-pastes via `tensor-mcp connect`.
 */

export interface PasteTokenConfig {
  /** Where the user generates the credential (URL shown in CLI instructions). */
  generationUrl: string;
  /** Human-readable scope/permissions hint shown before the prompt. */
  description: string;
}

function pasteTokenAuth(
  config: PasteTokenConfig,
  method: "pat" | "api-key",
  noun: "Personal Access Token" | "API key",
): AuthStrategy {
  return {
    method,
    isConfigured() {
      return { ok: true };
    },
    describe() {
      return {
        instructions: `Generate a ${noun} at: ${config.generationUrl}\n${config.description}`,
      };
    },
    async connect(opts: ConnectOptions): Promise<TokenBundle> {
      const promptFn = opts.io?.promptUser ?? defaultPrompt;
      process.stderr.write(
        `\nGenerate a ${noun} at: ${config.generationUrl}\n${config.description}\n\n`,
      );
      const token = await promptFn(`Paste your ${noun}: `);
      const trimmed = token.trim();
      if (!trimmed) throw new Error(`Empty ${noun}`);
      const bundle: TokenBundle = { access_token: trimmed };
      await opts.tokenStore.set(opts.serviceId, bundle);
      return bundle;
    },
    async refresh(bundle: TokenBundle): Promise<TokenBundle> {
      return bundle;
    },
  };
}

async function defaultPrompt(message: string): Promise<string> {
  const result = prompt(message);
  if (result === null) throw new Error("Prompt cancelled");
  return result;
}

// Public factories — same shape as before, just sharing the impl above.

export interface PatAuthConfig {
  tokenUrl: string;
  description: string;
}

export function patAuth(config: PatAuthConfig): AuthStrategy {
  return pasteTokenAuth(
    { generationUrl: config.tokenUrl, description: config.description },
    "pat",
    "Personal Access Token",
  );
}

export interface ApiKeyAuthConfig {
  signupUrl: string;
  description: string;
}

export function apiKeyAuth(config: ApiKeyAuthConfig): AuthStrategy {
  return pasteTokenAuth(
    { generationUrl: config.signupUrl, description: config.description },
    "api-key",
    "API key",
  );
}
