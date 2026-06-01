import type { TokenBundle } from "../stores/types";
import type {
  AuthStrategy,
  ConnectOptions,
  FieldSpec,
} from "./types";

/**
 * Auth strategy for services that issue user-pasteable credentials —
 * either a Personal Access Token (GitHub-style) or a long-lived API key
 * (Cal.com-style). The mechanism is identical; only the framing differs.
 *
 * Some vendors need more than a single token to make a request — PostHog
 * also needs the `instance_url`, Supabase needs the project `subdomain`.
 * Those go through `extraFields`. The primary credential is stored at
 * `bundle.access_token` (so existing services keep working unchanged) and
 * each extra at `bundle.metadata[key]`.
 *
 * Refresh is a no-op: paste credentials don't have a refresh-token grant.
 * On expiry / revocation the user re-pastes via `tensor-mcp connect`.
 */

export interface PasteTokenConfig {
  /** Where the user generates the credential (URL shown in CLI instructions). */
  generationUrl: string;
  /** Human-readable scope/permissions hint shown before the prompt. */
  description: string;
  /**
   * Optional non-secret config fields the vendor needs alongside the
   * primary credential — e.g. PostHog instance URL, Supabase subdomain.
   * Order is the CLI prompt order.
   */
  extraFields?: readonly FieldSpec[];
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
        fields: config.extraFields,
      };
    },
    async connect(opts: ConnectOptions): Promise<TokenBundle> {
      const promptFn = opts.io?.promptUser ?? defaultPrompt;

      // Pre-filled path: MCP `connect_app` (no TTY) or CLI `connect <app> <token>`.
      // Trust the caller — they collected the credentials some other way.
      if (opts.prefilled) {
        const bundle = bundleFrom(opts.prefilled.access_token, opts.prefilled.metadata, config.extraFields);
        await opts.tokenStore.set(opts.serviceId, bundle);
        return bundle;
      }

      // Interactive path: prompt for the primary, then each extra.
      process.stderr.write(
        `\nGenerate a ${noun} at: ${config.generationUrl}\n${config.description}\n\n`,
      );
      const token = (await promptFn(`Paste your ${noun}: `)).trim();
      if (!token) throw new Error(`Empty ${noun}`);

      const metadata: Record<string, string> = {};
      for (const field of config.extraFields ?? []) {
        const label = field.default
          ? `${field.label} [${field.default}]: `
          : `${field.label}: `;
        const raw = (await promptFn(label)).trim();
        const value = raw || field.default || "";
        if (!value) throw new Error(`Empty ${field.label}`);
        metadata[field.key] = value;
      }

      const bundle = bundleFrom(token, metadata, config.extraFields);
      await opts.tokenStore.set(opts.serviceId, bundle);
      return bundle;
    },
    async refresh(bundle: TokenBundle): Promise<TokenBundle> {
      return bundle;
    },
  };
}

function bundleFrom(
  accessToken: string,
  rawMetadata: Record<string, string> | undefined,
  extraFields: readonly FieldSpec[] | undefined,
): TokenBundle {
  if (!extraFields || extraFields.length === 0) {
    return { access_token: accessToken };
  }
  const metadata: Record<string, string> = {};
  for (const field of extraFields) {
    const provided = rawMetadata?.[field.key];
    const value = (provided && provided.trim()) || field.default || "";
    if (!value) throw new Error(`Missing required field: ${field.label}`);
    metadata[field.key] = value;
  }
  return { access_token: accessToken, metadata };
}

async function defaultPrompt(message: string): Promise<string> {
  const result = prompt(message);
  if (result === null) throw new Error("Prompt cancelled");
  return result;
}

// Public factories — same shape as before, plus optional `extraFields`.

export interface PatAuthConfig {
  tokenUrl: string;
  description: string;
  extraFields?: readonly FieldSpec[];
}

export function patAuth(config: PatAuthConfig): AuthStrategy {
  return pasteTokenAuth(
    {
      generationUrl: config.tokenUrl,
      description: config.description,
      extraFields: config.extraFields,
    },
    "pat",
    "Personal Access Token",
  );
}

export interface ApiKeyAuthConfig {
  signupUrl: string;
  description: string;
  extraFields?: readonly FieldSpec[];
}

export function apiKeyAuth(config: ApiKeyAuthConfig): AuthStrategy {
  return pasteTokenAuth(
    {
      generationUrl: config.signupUrl,
      description: config.description,
      extraFields: config.extraFields,
    },
    "api-key",
    "API key",
  );
}
