/**
 * Activepieces `@activepieces/pieces-common` shim.
 *
 * The lifted Slack code uses `httpClient.sendRequest({...})` (axios-shaped)
 * and `HttpMethod`. We map it onto `fetch` so the binary doesn't drag axios
 * in. AuthenticationType + propsValidation are also re-exported because
 * some lifted actions reach for them.
 */

import { z } from "zod";

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PATCH = "PATCH",
  PUT = "PUT",
  DELETE = "DELETE",
  HEAD = "HEAD",
}

export enum AuthenticationType {
  BEARER_TOKEN = "BEARER_TOKEN",
  BASIC = "BASIC",
}

export type HttpHeaders = Record<string, string | string[] | undefined>;
export type QueryParams = Record<string, string | string[] | undefined>;

export type Authentication =
  | { type: AuthenticationType.BEARER_TOKEN; token: string }
  | { type: AuthenticationType.BASIC; username: string; password: string };

export interface HttpRequest<B = unknown> {
  method: HttpMethod;
  url: string;
  body?: B;
  headers?: HttpHeaders;
  authentication?: Authentication;
  queryParams?: QueryParams;
  timeout?: number;
  retries?: number;
  responseType?: "arraybuffer" | "json" | "blob" | "text";
  followRedirects?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: matches upstream axios shape
export interface HttpResponse<B = any> {
  status: number;
  headers?: HttpHeaders;
  body: B;
}

export class HttpError extends Error {
  constructor(
    public readonly request: HttpRequest,
    public readonly response: HttpResponse,
  ) {
    super(`HTTP ${response.status} ${request.method} ${request.url}`);
    this.name = "HttpError";
  }
  errorMessage(): string {
    try {
      return JSON.stringify(this.response.body);
    } catch {
      return String(this.response.body);
    }
  }
}

function buildUrl(url: string, queryParams?: QueryParams): string {
  if (!queryParams) return url;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const vi of v) usp.append(k, vi);
    } else {
      usp.append(k, String(v));
    }
  }
  const qs = usp.toString();
  if (!qs) return url;
  return url + (url.includes("?") ? "&" : "?") + qs;
}

function applyAuth(
  headers: Record<string, string>,
  auth?: Authentication,
): void {
  if (!auth) return;
  if (auth.type === AuthenticationType.BEARER_TOKEN) {
    headers.Authorization = `Bearer ${auth.token}`;
  } else if (auth.type === AuthenticationType.BASIC) {
    const enc = Buffer.from(`${auth.username}:${auth.password}`).toString(
      "base64",
    );
    headers.Authorization = `Basic ${enc}`;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: default mirrors axios's `any`
async function sendRequest<R = any>(
  req: HttpRequest,
): Promise<HttpResponse<R>> {
  const url = buildUrl(req.url, req.queryParams);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    if (v == null) continue;
    headers[k] = Array.isArray(v) ? v.join(",") : v;
  }
  applyAuth(headers, req.authentication);

  let body: BodyInit | undefined;
  if (req.body !== undefined && req.method !== HttpMethod.GET) {
    if (
      typeof req.body === "string" ||
      req.body instanceof Uint8Array ||
      req.body instanceof ArrayBuffer ||
      (typeof FormData !== "undefined" && req.body instanceof FormData) ||
      (typeof URLSearchParams !== "undefined" &&
        req.body instanceof URLSearchParams)
    ) {
      body = req.body as BodyInit;
    } else {
      body = JSON.stringify(req.body);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  const controller = new AbortController();
  const timeoutId = req.timeout
    ? setTimeout(() => controller.abort(), req.timeout)
    : undefined;
  try {
    const res = await fetch(url, {
      method: req.method,
      headers,
      body,
      redirect: req.followRedirects === false ? "manual" : "follow",
      signal: controller.signal,
    });
    const responseHeaders: HttpHeaders = {};
    res.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });
    let parsedBody: unknown;
    if (req.responseType === "arraybuffer") {
      parsedBody = await res.arrayBuffer();
    } else if (req.responseType === "blob") {
      parsedBody = await res.blob();
    } else if (req.responseType === "text") {
      parsedBody = await res.text();
    } else {
      const text = await res.text();
      try {
        parsedBody = text ? JSON.parse(text) : "";
      } catch {
        parsedBody = text;
      }
    }
    const response: HttpResponse = {
      status: res.status,
      headers: responseHeaders,
      body: parsedBody,
    };
    if (res.status >= 400) {
      throw new HttpError(req, response);
    }
    return response as HttpResponse<R>;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export const httpClient = { sendRequest };

export const propsValidation = {
  async validateZod<T extends Record<string, unknown>>(
    props: T,
    schema: Partial<Record<keyof T, z.ZodTypeAny>>,
  ): Promise<void> {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [k, v] of Object.entries(schema)) {
      if (v) shape[k] = v as z.ZodTypeAny;
    }
    const obj = z.object(shape);
    try {
      await obj.parseAsync(props);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        for (const i of err.issues) {
          errors[i.path.join(".")] = i.message;
        }
        throw new Error(JSON.stringify({ errors }, null, 2));
      }
      throw err;
    }
  },
};

// `createCustomApiCallAction` is referenced from the slack index.ts. We
// stub it to a tagged action so the piece still constructs; it's not
// exposed because the orchestrator skips actions whose name is
// `custom_api_call` (low-value, leaks raw HTTP).
import {
  createAction,
  type ActivepiecesAction,
  Property,
} from "./framework";

export function createCustomApiCallAction(_args: {
  // biome-ignore lint/suspicious/noExplicitAny: free-form passthrough
  baseUrl: (auth?: any) => string;
  auth?: unknown;
  // biome-ignore lint/suspicious/noExplicitAny: callback signature mirrors upstream
  authMapping?: (auth: any, propsValue: any) => Promise<HttpHeaders>;
  description?: string | null;
  displayName?: string | null;
  name?: string | null;
  // biome-ignore lint/suspicious/noExplicitAny: free-form passthrough
  props?: Record<string, any>;
  // biome-ignore lint/suspicious/noExplicitAny: free-form passthrough
  extraProps?: Record<string, any>;
  authLocation?: "headers" | "queryParams";
}): ActivepiecesAction {
  return createAction({
    name: _args.name ?? "custom_api_call",
    displayName: _args.displayName ?? "Custom API Call",
    description: _args.description ?? "Make a custom API call.",
    auth: _args.auth,
    props: { url: Property.ShortText({ displayName: "URL", required: true }) },
    async run() {
      throw new Error("custom_api_call is not exposed in tensor-mcp");
    },
  });
}
