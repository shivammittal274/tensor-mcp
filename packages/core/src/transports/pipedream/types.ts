// Loose mirror of the Pipedream component shape that we depend on at execute
// time. Pipedream's own framework adds far more (UI rendering, deploy/test
// metadata) which we deliberately ignore.

export type PipedreamProp = PipedreamStaticProp | PipedreamPropDefinitionRef;

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

// Method bags on Pipedream apps/actions are intentionally polymorphic — they
// can call any vendor SDK shape and chain helper calls of any arity. We type
// the bag with `unknown` rather than `any` so call sites are forced to assert
// at the boundary (see run-action.ts), keeping the unsafety auditable.
type MethodBag = Record<string, (...args: unknown[]) => unknown>;

export interface PipedreamAppModule {
  type: "app";
  app: string;
  propDefinitions: Record<string, PipedreamStaticProp | PipedreamPropDefinitionRef>;
  methods: MethodBag;
}

export interface PipedreamActionModule {
  key: string;
  name?: string;
  description?: string;
  version?: string;
  type?: "action";
  props: Record<string, PipedreamProp | PipedreamAppModule>;
  methods?: MethodBag;
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
