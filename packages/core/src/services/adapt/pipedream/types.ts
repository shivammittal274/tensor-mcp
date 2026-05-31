// Loose mirror of the Pipedream component shape that we depend on at execute
// time. Pipedream's own framework adds far more (UI rendering, deploy/test
// metadata) which we deliberately ignore.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PipedreamProp =
  | PipedreamStaticProp
  | PipedreamPropDefinitionRef
  | PipedreamAppRef;

export interface PipedreamStaticProp {
  type: "string" | "integer" | "boolean" | "object" | "any" | "string[]";
  label?: string;
  description?: string;
  optional?: boolean;
  default?: unknown;
  options?: unknown;
  reloadProps?: boolean;
  hidden?: boolean;
  format?: string;
}

export interface PipedreamPropDefinitionRef {
  propDefinition: [PipedreamAppModule, string, ((c: unknown) => unknown)?];
  description?: string;
  optional?: boolean;
  default?: unknown;
  hidden?: boolean;
}

export interface PipedreamAppRef {
  type: "app";
  app: string;
}

export interface PipedreamAppModule {
  type: "app";
  app: string;
  propDefinitions: Record<string, PipedreamStaticProp | PipedreamPropDefinitionRef>;
  methods: Record<string, (...args: any[]) => any>;
}

export interface PipedreamActionModule {
  key: string;
  name?: string;
  description?: string;
  version?: string;
  type?: "action";
  props: Record<string, PipedreamProp | PipedreamAppModule>;
  methods?: Record<string, (...args: any[]) => any>;
  run: (ctx: { $: PipedreamDollar }) => Promise<unknown> | unknown;
}

export interface PipedreamDollar {
  export(key: string, value: unknown): void;
  summary?: string;
  flow?: { exit(reason: string): void };
}

/**
 * Reads the user's auth bundle for a service. Keys map to whatever the
 * upstream Pipedream component references via `this.$auth.<key>` — e.g.
 * `oauth_access_token`, `bot_token`, `base_url`. Implementations may
 * compute on demand (e.g. derive `base_url` from a default).
 */
export type PipedreamAuthReader = (key: string) => unknown;
