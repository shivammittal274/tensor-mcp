/**
 * Pipedream adapter — runs upstream `components/<vendor>` action modules
 * unchanged inside tensor-mcp. The per-service cost after this shim is just
 * a `defineService({ pipedream: { app, actions: [...] } })` entry.
 *
 * See `services.ts` (slack) for a worked example.
 */
export { listPipedreamTools, toolNameForAction } from "./listTools";
export type { PipedreamToolDescriptor } from "./listTools";
export { runPipedreamAction } from "./runAction";
export { makeAuthReader } from "./auth-resolver";
export type {
  PipedreamActionModule,
  PipedreamAppModule,
  PipedreamAuthReader,
} from "./types";
