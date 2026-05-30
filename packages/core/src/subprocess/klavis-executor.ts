import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TokenBundle } from "../stores/types";
import { spawnSubprocess } from "./spawn";
import type { Executor, SpawnOptions, SpawnedProcess } from "./types";

export type KlavisLang = "python" | "typescript";

export interface KlavisExecutorConfig {
  /** Relative path from tensor-mcp root, e.g. "vendored/linear". */
  vendorDir: string;
  /** Runtime language — determines the command template. */
  lang: KlavisLang;
  /**
   * Optional: forge the AUTH_DATA payload from a TokenBundle.
   * Default produces `{access_token: bundle.access_token}` (works for
   * Linear/Notion/Asana/Confluence/Gmail). Override for Slack (nested
   * authed_user) or Jira (with selected_cloud_id from metadata).
   */
  forgeAuthData?: (bundle: TokenBundle) => Record<string, unknown>;
  /** Optional: extra env vars to set (may contain {{PORT}}). */
  envInject?: Record<string, string>;
  /** Optional: override the spawn command entirely. */
  command?: string[];
}

export function klavisExecutor(config: KlavisExecutorConfig): Executor {
  return {
    async spawn(opts: SpawnOptions): Promise<SpawnedProcess> {
      const tensorMcpRoot = opts.tensorMcpRoot ?? findWorkspaceRoot();
      const cwd = isAbsolute(config.vendorDir)
        ? config.vendorDir
        : join(tensorMcpRoot, config.vendorDir);

      const envInject: Record<string, string> = { ...(config.envInject ?? {}) };
      let command: string[];

      if (config.command) {
        command = config.command;
      } else if (config.lang === "python") {
        command = [
          "uv",
          "run",
          "--with-requirements",
          "requirements.txt",
          "python",
          "server.py",
          "--port",
          "{{PORT}}",
        ];
      } else if (config.lang === "typescript") {
        command = ["bun", "run", "index.ts"];
        if (envInject.PORT === undefined) {
          envInject.PORT = "{{PORT}}";
        }
      } else {
        throw new Error(
          `klavisExecutor: unknown lang '${config.lang as string}'`,
        );
      }

      const forge = config.forgeAuthData ?? defaultForge;
      const payload = forge(opts.token);
      const authData = Buffer.from(JSON.stringify(payload)).toString("base64");

      return spawnSubprocess({
        service: "klavis",
        cwd,
        command,
        authData,
        envInject,
        port: opts.port,
        readinessTimeoutMs: opts.readinessTimeoutMs,
      });
    },
  };
}

function defaultForge(bundle: TokenBundle): Record<string, unknown> {
  return { access_token: bundle.access_token };
}

function findWorkspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const data = require(pkg);
        if (data?.name === "tensor-mcp") return dir;
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
