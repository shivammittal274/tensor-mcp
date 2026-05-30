import type { TokenBundle } from "../stores/types";
import type { AuthStrategy, ConnectOptions } from "./types";

export interface PatAuthConfig {
  tokenUrl: string;
  description: string;
}

export function patAuth(config: PatAuthConfig): AuthStrategy {
  return {
    method: "pat",
    describe() {
      return {
        instructions: `Generate a Personal Access Token at: ${config.tokenUrl}\n${config.description}`,
      };
    },
    async connect(opts: ConnectOptions): Promise<TokenBundle> {
      const promptFn = opts.io?.promptUser ?? defaultPrompt;
      process.stderr.write(
        `\nGenerate a token at: ${config.tokenUrl}\n${config.description}\n\n`,
      );
      const token = await promptFn("Paste your token: ");
      const trimmed = token.trim();
      if (!trimmed) throw new Error("Empty token");
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
