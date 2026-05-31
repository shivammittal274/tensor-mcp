import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type Host =
  | "claude-desktop"
  | "claude-code"
  | "cursor"
  | "vscode"
  | "gemini"
  | "codex";

const KNOWN_HOSTS: readonly Host[] = [
  "claude-desktop",
  "claude-code",
  "cursor",
  "vscode",
  "gemini",
  "codex",
];

interface McpServerConfig {
  command: string;
  args: string[];
}

const MCP_SERVER_NAME = "tensor-mcp";

/**
 * `tensor-mcp tool add <host>` — wires the running binary into the host
 * MCP-client's config so the agent picks tensor-mcp up on next restart.
 *
 * For hosts that ship a config-mutating CLI (Claude Code, Gemini, VSCode)
 * we shell out to it. For others (Claude Desktop, Cursor) we edit the
 * JSON file directly, preserving any existing mcpServers entries.
 */
export async function toolAddCmd(host: string): Promise<number> {
  if (!KNOWN_HOSTS.includes(host as Host)) {
    process.stderr.write(
      `tensor-mcp tool add: unknown host '${host}'.\n` +
        `Supported: ${KNOWN_HOSTS.join(", ")}\n`,
    );
    return 1;
  }

  const binaryPath = resolveBinaryPath();
  if (!binaryPath) {
    process.stderr.write(
      "tensor-mcp tool add: only supported on the compiled binary.\n" +
        "Run `bun run build` first, then `./dist/tensor-mcp tool add <host>`.\n",
    );
    return 1;
  }

  switch (host as Host) {
    case "claude-desktop":
      return upsertJsonConfig(claudeDesktopPath(), binaryPath);
    case "cursor":
      return upsertJsonConfig(cursorConfigPath(), binaryPath);
    case "claude-code":
      return shellOutClaudeCode(binaryPath);
    case "gemini":
      return shellOutGemini(binaryPath);
    case "vscode":
      return shellOutVscode(binaryPath);
    case "codex":
      return upsertCodexToml(binaryPath);
  }
}

/**
 * Compiled-binary path detection. `process.execPath` resolves to the
 * compiled tensor-mcp binary in production and to the bun executable
 * during dev (`bun src/index.ts`). We refuse the dev case because
 * there's no stable executable to point an MCP host at.
 */
function resolveBinaryPath(): string | null {
  const exe = process.execPath ?? "";
  if (!exe || !existsSync(exe)) return null;
  if (/[\\/](bun|bun\.exe)$/.test(exe)) return null;
  return exe;
}

function claudeDesktopPath(): string {
  if (process.platform === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json",
    );
  }
  return join(homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function cursorConfigPath(): string {
  return join(homedir(), ".cursor", "mcp.json");
}

function upsertJsonConfig(configPath: string, binaryPath: string): number {
  try {
    mkdirSync(dirname(configPath), { recursive: true });
    let data: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf8");
      if (raw.trim()) {
        try {
          data = JSON.parse(raw);
        } catch {
          const backup = `${configPath}.bak`;
          writeFileSync(backup, raw);
          process.stderr.write(
            `Warning: ${configPath} was not valid JSON. Backed up to ${backup} and starting fresh.\n`,
          );
        }
      }
    }
    if (!data.mcpServers || typeof data.mcpServers !== "object") {
      data.mcpServers = {};
    }
    const servers = data.mcpServers as Record<string, McpServerConfig>;
    servers[MCP_SERVER_NAME] = {
      command: binaryPath,
      args: ["serve"],
    };
    writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
    process.stdout.write(
      `Added '${MCP_SERVER_NAME}' to ${configPath}.\n` +
        "Restart the host to pick up the change.\n",
    );
    return 0;
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

async function shellOutClaudeCode(binaryPath: string): Promise<number> {
  const proc = Bun.spawnSync(
    [
      "claude",
      "mcp",
      "add",
      "--scope",
      "user",
      MCP_SERVER_NAME,
      binaryPath,
      "serve",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (proc.exitCode === 0) {
    process.stdout.write(
      `Added '${MCP_SERVER_NAME}' to Claude Code (user scope).\n`,
    );
    return 0;
  }
  process.stderr.write(
    "Failed via `claude mcp add`. Is the `claude` CLI installed? " +
      "See https://docs.claude.com/en/docs/claude-code\n",
  );
  return proc.exitCode ?? 1;
}

async function shellOutGemini(binaryPath: string): Promise<number> {
  const proc = Bun.spawnSync(
    [
      "gemini",
      "mcp",
      "add",
      "--scope",
      "user",
      MCP_SERVER_NAME,
      binaryPath,
      "serve",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (proc.exitCode === 0) {
    process.stdout.write(
      `Added '${MCP_SERVER_NAME}' to Gemini (user scope).\n`,
    );
    return 0;
  }
  process.stderr.write(
    "Failed via `gemini mcp add`. Is the `gemini` CLI installed?\n",
  );
  return proc.exitCode ?? 1;
}

/**
 * Codex CLI uses TOML at `~/.codex/config.toml`. We avoid pulling in a TOML
 * library by upserting one section with regex — `[mcp_servers.tensor-mcp]`
 * up to the next `[` or EOF.
 */
function upsertCodexToml(binaryPath: string): number {
  try {
    const configPath = join(homedir(), ".codex", "config.toml");
    mkdirSync(dirname(configPath), { recursive: true });
    const existing = existsSync(configPath)
      ? readFileSync(configPath, "utf8")
      : "";

    const section =
      `[mcp_servers.${MCP_SERVER_NAME}]\n` +
      `command = ${JSON.stringify(binaryPath)}\n` +
      `args = ["serve"]\n`;

    // Lazy match until next TOML section header (\n[) or EOF — keeps
    // bracketed array values like `args = ["serve"]` from terminating early.
    const re = new RegExp(
      `(^|\\n)\\[mcp_servers\\.${MCP_SERVER_NAME}\\][\\s\\S]*?(?=\\n\\[|$)`,
    );
    let next: string;
    if (re.test(existing)) {
      next = existing.replace(re, (_m, lead) => `${lead}${section.trimEnd()}`);
    } else {
      const sep = existing.length && !existing.endsWith("\n") ? "\n\n" : "\n";
      next = existing + sep + section;
    }
    if (!next.endsWith("\n")) next += "\n";
    writeFileSync(configPath, next);
    process.stdout.write(
      `Added '${MCP_SERVER_NAME}' to ${configPath}.\nRestart Codex to pick up the change.\n`,
    );
    return 0;
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

async function shellOutVscode(binaryPath: string): Promise<number> {
  const mcpJson = JSON.stringify({
    name: MCP_SERVER_NAME,
    command: binaryPath,
    args: ["serve"],
  });
  const proc = Bun.spawnSync(["code", "--add-mcp", mcpJson], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (proc.exitCode === 0) {
    process.stdout.write(`Added '${MCP_SERVER_NAME}' to VSCode.\n`);
    return 0;
  }
  process.stderr.write(
    "Failed via `code --add-mcp`. Is the VSCode `code` CLI on PATH? " +
      "In VSCode: Cmd+Shift+P → 'Shell Command: Install code command in PATH'.\n",
  );
  return proc.exitCode ?? 1;
}
