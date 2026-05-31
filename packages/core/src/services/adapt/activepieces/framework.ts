/**
 * Activepieces `@activepieces/pieces-framework` shim.
 *
 * Drop-in surface for lifted pieces: `createAction`, `createPiece`,
 * `createTrigger`, `Property.*`, `PieceAuth.*`, plus the enums and types
 * the lifted code references at the value level.
 *
 * All property factories are identity passthroughs that tag the spec with
 * a `PropertyType`. Action/trigger factories collect their args verbatim.
 * Everything else is structural — runtime work happens in `runAction.ts`.
 */

export enum PropertyType {
  SHORT_TEXT = "SHORT_TEXT",
  LONG_TEXT = "LONG_TEXT",
  MARKDOWN = "MARKDOWN",
  DROPDOWN = "DROPDOWN",
  STATIC_DROPDOWN = "STATIC_DROPDOWN",
  NUMBER = "NUMBER",
  CHECKBOX = "CHECKBOX",
  OAUTH2 = "OAUTH2",
  SECRET_TEXT = "SECRET_TEXT",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
  BASIC_AUTH = "BASIC_AUTH",
  JSON = "JSON",
  MULTI_SELECT_DROPDOWN = "MULTI_SELECT_DROPDOWN",
  STATIC_MULTI_SELECT_DROPDOWN = "STATIC_MULTI_SELECT_DROPDOWN",
  DYNAMIC = "DYNAMIC",
  CUSTOM_AUTH = "CUSTOM_AUTH",
  DATE_TIME = "DATE_TIME",
  FILE = "FILE",
  CUSTOM = "CUSTOM",
  COLOR = "COLOR",
}

export enum TriggerStrategy {
  POLLING = "POLLING",
  WEBHOOK = "WEBHOOK",
  APP_WEBHOOK = "APP_WEBHOOK",
  MANUAL = "MANUAL",
}

export enum WebhookHandshakeStrategy {
  NONE = "NONE",
  HEADER_PRESENT = "HEADER_PRESENT",
  QUERY_PRESENT = "QUERY_PRESENT",
  BODY_PARAM_PRESENT = "BODY_PARAM_PRESENT",
}

export enum WebhookRenewStrategy {
  CRON = "CRON",
  NONE = "NONE",
}

export type DropdownOption<T> = { label: string; value: T };
export type DropdownState<T> = {
  disabled?: boolean;
  placeholder?: string;
  options: DropdownOption<T>[];
};

export class ApFile {
  constructor(
    public filename: string,
    public data: Buffer,
    public extension?: string,
  ) {}
}

// Property specs are heterogeneous (dropdowns with options, arrays with
// inner properties, files with size limits…). At the shim layer we don't
// model any of that — we just keep the spec opaque and read `.type` /
// `.required` when we need to project to JSON Schema. Using `any` is the
// pragmatic choice because the lifted code passes 2/3-arg generics
// (`Property.Dropdown<string, R, typeof slackAuth>`) that don't match a
// stricter constraint.
// biome-ignore lint/suspicious/noExplicitAny: see comment above
type AnyProp = any;

function prop<T extends PropertyType>(type: T) {
  return <R extends Record<string, unknown>>(
    // biome-ignore lint/suspicious/noExplicitAny: free-form spec from lifted piece
    spec: R | any,
    // biome-ignore lint/suspicious/noExplicitAny: per-call generics ignored
    ..._rest: any[]
  ): AnyProp => ({ ...spec, type, valueSchema: undefined });
}

// Some lifted callers pass 2 or 3 generic arguments (e.g.
// `Property.Dropdown<T, R, PieceAuth>`). The shim collapses them to a
// single shape via the helper above — overloads here are purely
// type-level breadcrumbs so the source compiles unchanged.
export const Property = {
  ShortText: prop(PropertyType.SHORT_TEXT) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  LongText: prop(PropertyType.LONG_TEXT) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  MarkDown: (spec: { value: string; variant?: string }): AnyProp => ({
    displayName: "Markdown",
    required: false,
    description: spec.value,
    type: PropertyType.MARKDOWN,
    valueSchema: undefined as never,
    variant: spec.variant ?? "INFO",
  }),
  Number: prop(PropertyType.NUMBER) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  Checkbox: prop(PropertyType.CHECKBOX) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  Json: prop(PropertyType.JSON) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  Array: prop(PropertyType.ARRAY) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  Object: prop(PropertyType.OBJECT) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  Dropdown: prop(PropertyType.DROPDOWN) as <_T, _R extends boolean, _Auth>(
    spec: unknown,
  ) => AnyProp,
  StaticDropdown: prop(PropertyType.STATIC_DROPDOWN) as <
    _T,
    _R extends boolean,
  >(
    spec: unknown,
  ) => AnyProp,
  MultiSelectDropdown: prop(PropertyType.MULTI_SELECT_DROPDOWN) as <
    _T,
    _R extends boolean,
    _Auth,
  >(
    spec: unknown,
  ) => AnyProp,
  StaticMultiSelectDropdown: prop(PropertyType.STATIC_MULTI_SELECT_DROPDOWN) as <
    _T,
    _R extends boolean,
  >(
    spec: unknown,
  ) => AnyProp,
  DynamicProperties: prop(PropertyType.DYNAMIC) as <
    _R extends boolean,
    _Auth,
  >(
    spec: unknown,
  ) => AnyProp,
  DateTime: prop(PropertyType.DATE_TIME) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  File: prop(PropertyType.FILE) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  Custom: prop(PropertyType.CUSTOM) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  Color: prop(PropertyType.COLOR) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
};

export const PieceAuth = {
  SecretText: prop(PropertyType.SECRET_TEXT) as <_R extends boolean>(
    spec: unknown,
  ) => AnyProp,
  OAuth2: prop(PropertyType.OAUTH2) as <_T>(spec: unknown) => AnyProp,
  BasicAuth: prop(PropertyType.BASIC_AUTH) as (spec: unknown) => AnyProp,
  CustomAuth: prop(PropertyType.CUSTOM_AUTH) as <_T>(spec: unknown) => AnyProp,
  None: () => undefined,
};

// ─── Action / Trigger / Piece factories ────────────────────────────────────

export interface ActivepiecesAction {
  name: string;
  displayName: string;
  description: string;
  props: Record<string, AnyProp>;
  auth?: unknown;
  requireAuth?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: trampoline boundary
  run: (ctx: any) => Promise<unknown>;
  // biome-ignore lint/suspicious/noExplicitAny: trampoline boundary
  test?: (ctx: any) => Promise<unknown>;
}

export interface ActivepiecesTrigger {
  name: string;
  displayName: string;
  description: string;
  props: Record<string, AnyProp>;
  type: TriggerStrategy;
  // Triggers aren't exposed as MCP tools in this POC. Kept structurally so
  // lifted piece files compile, but the orchestrator only enumerates actions.
  [k: string]: unknown;
}

export interface ActivepiecesPiece {
  displayName: string;
  description?: string;
  logoUrl: string;
  authors: string[];
  categories: string[];
  auth?: unknown;
  actions: Record<string, ActivepiecesAction>;
  triggers: Record<string, ActivepiecesTrigger>;
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  events?: unknown;
  getAction(name: string): ActivepiecesAction | undefined;
  getTrigger(name: string): ActivepiecesTrigger | undefined;
}

export function createAction<P extends Record<string, AnyProp>>(params: {
  name: string;
  displayName: string;
  description: string;
  props: P;
  auth?: unknown;
  requireAuth?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: lifted-piece callback boundary
  run: (ctx: any) => Promise<unknown>;
  // biome-ignore lint/suspicious/noExplicitAny: lifted-piece callback boundary
  test?: (ctx: any) => Promise<unknown>;
  errorHandlingOptions?: unknown;
}): ActivepiecesAction {
  return {
    name: params.name,
    displayName: params.displayName,
    description: params.description,
    props: params.props,
    auth: params.auth,
    requireAuth: params.requireAuth ?? true,
    run: params.run,
    test: params.test ?? params.run,
  };
}

export function createTrigger<P extends Record<string, AnyProp>>(params: {
  name: string;
  displayName: string;
  description: string;
  props: P;
  type: TriggerStrategy;
  // biome-ignore lint/suspicious/noExplicitAny: lifted-piece callback boundary
  [k: string]: any;
}): ActivepiecesTrigger {
  return {
    ...params,
    name: params.name,
    displayName: params.displayName,
    description: params.description,
    props: params.props,
    type: params.type,
  };
}

export function createPiece(params: {
  displayName: string;
  description?: string;
  logoUrl: string;
  authors?: string[];
  categories?: string[];
  auth?: unknown;
  actions: ActivepiecesAction[];
  triggers: ActivepiecesTrigger[];
  events?: unknown;
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
}): ActivepiecesPiece {
  const actions: Record<string, ActivepiecesAction> = {};
  for (const a of params.actions) actions[a.name] = a;
  const triggers: Record<string, ActivepiecesTrigger> = {};
  for (const t of params.triggers) triggers[t.name] = t;
  return {
    displayName: params.displayName,
    description: params.description,
    logoUrl: params.logoUrl,
    authors: params.authors ?? [],
    categories: params.categories ?? [],
    auth: params.auth,
    actions,
    triggers,
    events: params.events,
    minimumSupportedRelease: params.minimumSupportedRelease,
    maximumSupportedRelease: params.maximumSupportedRelease,
    getAction: (name: string) => actions[name],
    getTrigger: (name: string) => triggers[name],
  };
}

// ─── Type-level glue: lifted code references these but only reads .type. ───

// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type OAuth2PropertyValue<_T = any> = {
  access_token: string;
  data: Record<string, unknown>;
  scope?: string;
};

// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type AppConnectionValueForAuthProperty<_T> = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type ExtractPieceAuthPropertyTypeForMethods<_T> = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type StaticPropsValue<_T> = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type InputPropertyMap = Record<string, any>;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type PieceAuthProperty = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type Action = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type Trigger = any;
// biome-ignore lint/suspicious/noExplicitAny: structural placeholder
export type Piece = any;

export interface FilesService {
  write(args: { fileName: string; data: Buffer }): Promise<string>;
}

export const DEFAULT_CONNECTION_DISPLAY_NAME = "Connection";
