import type { TokenBundle } from "../stores/types";
import type { AuthStrategy, ConnectOptions } from "./types";

export interface ApiKeyAuthConfig {
  signupUrl: string;
  description: string;
}

export function apiKeyAuth(config: ApiKeyAuthConfig): AuthStrategy {
  return {
    method: "api-key",
    describe() {
      return {
        instructions: `Generate an API key at: ${config.signupUrl}\n${config.description}`,
      };
    },
    async connect(opts: ConnectOptions): Promise<TokenBundle> {
      const promptFn = opts.io?.promptUser ?? defaultPrompt;
      process.stderr.write(
        `\nGenerate an API key at: ${config.signupUrl}\n${config.description}\n\n`,
      );
      const key = await promptFn("Paste your API key: ");
      const trimmed = key.trim();
      if (!trimmed) throw new Error("Empty API key");
      const bundle: TokenBundle = { access_token: trimmed };
      await opts.tokenStore.set(opts.serviceId, bundle);
      return bundle;
    },
  };
}

async function defaultPrompt(message: string): Promise<string> {
  const result = prompt(message);
  if (result === null) throw new Error("Prompt cancelled");
  return result;
}
