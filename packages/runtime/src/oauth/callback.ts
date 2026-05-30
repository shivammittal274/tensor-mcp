import type { Server } from "bun";

type AnyServer = Server<unknown>;

const DEFAULT_TIMEOUT_MS = 300_000;

const SUCCESS_HTML = `<!doctype html><html><body>
<h1>tensor-mcp: authentication complete</h1>
<p>You can close this tab.</p>
</body></html>`;

export interface CallbackResult {
  code: string;
  port: number;
  redirectUri: string;
}

export interface CallbackOptions {
  expectedState: string;
  timeoutMs?: number;
}

export interface CallbackHandle {
  redirectUri: string;
  port: number;
  awaitCode: Promise<CallbackResult>;
  close: () => void;
}

export async function startCallbackServer(opts: CallbackOptions): Promise<CallbackHandle> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let resolveCode!: (r: CallbackResult) => void;
  let rejectCode!: (e: Error) => void;
  let settled = false;
  const awaitCode = new Promise<CallbackResult>((res, rej) => {
    resolveCode = (r) => {
      if (settled) return;
      settled = true;
      res(r);
    };
    rejectCode = (e) => {
      if (settled) return;
      settled = true;
      rej(e);
    };
  });

  let server: AnyServer | null = null;
  const close = () => {
    if (server) {
      server.stop(true);
      server = null;
    }
  };

  const timer = setTimeout(() => {
    rejectCode(new Error("OAuth callback timeout"));
    close();
  }, timeoutMs);

  awaitCode.finally(() => clearTimeout(timer)).catch(() => {});

  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== "/callback") {
        return new Response("Not found", { status: 404 });
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errDesc = url.searchParams.get("error_description");

      if (error) {
        rejectCode(new Error(`provider error: ${errDesc ?? error}`));
        return new Response(`OAuth error: ${error}`, { status: 400 });
      }
      if (!code || !state) {
        rejectCode(new Error("missing code or state"));
        return new Response("missing code or state", { status: 400 });
      }
      if (state !== opts.expectedState) {
        rejectCode(new Error("state mismatch"));
        return new Response("state mismatch", { status: 400 });
      }

      const port = server?.port ?? 0;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      resolveCode({ code, port, redirectUri });
      return new Response(SUCCESS_HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });

  const boundPort = server.port ?? 0;
  const redirectUri = `http://127.0.0.1:${boundPort}/callback`;

  return {
    redirectUri,
    port: boundPort,
    awaitCode,
    close,
  };
}
