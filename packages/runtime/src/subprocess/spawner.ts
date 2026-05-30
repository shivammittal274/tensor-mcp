import { createServer, type Server } from "node:net";

export interface ServiceConfig {
  service: string;
  cwd: string;
  command: string[];
  envInject?: Record<string, string>;
  authData: string;
  port?: number;
  readinessTimeoutMs?: number;
}

export interface SpawnedService {
  service: string;
  port: number;
  pid: number;
  mcpUrl: string;
  exited: Promise<number>;
  kill: () => Promise<void>;
}

function findEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s: Server = createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("could not get ephemeral port"));
        return;
      }
      const port = addr.port;
      s.close(() => resolve(port));
    });
  });
}

async function probePort(port: number): Promise<boolean> {
  try {
    const conn = await Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        data() {},
        open(s) {
          s.end();
        },
      },
    });
    conn.end();
    return true;
  } catch {
    return false;
  }
}

async function waitForPortBound(
  port: number,
  timeoutMs: number,
  subprocessExit: Promise<number>,
): Promise<void> {
  const start = Date.now();
  let exitedEarly: number | null = null;
  subprocessExit
    .then((code) => {
      exitedEarly = code;
    })
    .catch(() => {
      exitedEarly = -1;
    });

  while (Date.now() - start < timeoutMs) {
    if (exitedEarly !== null) {
      throw new Error(
        `subprocess exited before binding port ${port} (exit code ${exitedEarly})`,
      );
    }
    if (await probePort(port)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`port ${port} did not bind within ${timeoutMs}ms`);
}

export async function spawnService(
  config: ServiceConfig,
): Promise<SpawnedService> {
  const port = config.port ?? (await findEphemeralPort());

  const portStr = String(port);
  const args = config.command.map((s) => s.replace("{{PORT}}", portStr));
  const cmd = args[0];
  if (!cmd) throw new Error("spawnService: empty command");
  const cmdArgs = args.slice(1);

  const substitutedEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.envInject ?? {})) {
    substitutedEnv[key] = value.replace("{{PORT}}", portStr);
  }

  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([cmd, ...cmdArgs], {
      cwd: config.cwd,
      env: {
        ...process.env,
        AUTH_DATA: config.authData,
        ...substitutedEnv,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    throw new Error(
      `spawnService: failed to spawn ${cmd}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const exited = proc.exited;

  let killed = false;
  const kill = async () => {
    if (killed) return;
    killed = true;
    try {
      proc.kill();
      const winner = await Promise.race([
        exited.then(() => "exited" as const),
        new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 2000)),
      ]);
      if (winner === "timeout") {
        try {
          proc.kill(9);
        } catch {
          /* swallow */
        }
      }
    } catch {
      /* swallow */
    }
  };

  try {
    await waitForPortBound(
      port,
      config.readinessTimeoutMs ?? 30_000,
      exited,
    );
  } catch (err) {
    await kill();
    throw err;
  }

  return {
    service: config.service,
    port,
    pid: proc.pid,
    mcpUrl: `http://127.0.0.1:${port}/mcp`,
    exited: exited as Promise<number>,
    kill,
  };
}
