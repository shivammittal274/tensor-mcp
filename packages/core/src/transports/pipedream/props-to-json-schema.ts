import { resolveProp } from "./prop-definition-resolver";
import type {
  PipedreamActionModule,
  PipedreamAppModule,
  PipedreamStaticProp,
} from "./types";

interface JsonSchemaProp {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

interface JsonSchema {
  type: "object";
  properties: Record<string, JsonSchemaProp>;
  required: string[];
  additionalProperties?: boolean;
}

const TYPE_MAP: Record<string, string> = {
  string: "string",
  integer: "integer",
  boolean: "boolean",
  object: "object",
  any: "string",
  "string[]": "array",
};

/**
 * Convert a Pipedream action's `props` to a JSON Schema usable by the
 * tensor-mcp catalog. App-typed props (e.g. `slack: <appModule>`) are
 * stripped — they don't take user input, they're a handle the action
 * uses to call the SDK.
 */
export function propsToJsonSchema(action: PipedreamActionModule): JsonSchema {
  const properties: Record<string, JsonSchemaProp> = {};
  const required: string[] = [];

  for (const [name, rawProp] of Object.entries(action.props ?? {})) {
    const resolved = resolveProp(rawProp as PipedreamAppModule);
    if ((resolved as { type?: string }).type === "app") continue;

    const p = resolved as PipedreamStaticProp;
    const jsonProp: JsonSchemaProp = {
      type: TYPE_MAP[p.type] ?? "string",
    };
    if (p.description || p.label) jsonProp.description = p.description ?? p.label;
    if (p.default !== undefined) jsonProp.default = p.default;
    if (Array.isArray(p.options)) {
      // Static enum list — keep. Function-form options() are UI-only; skip.
      const opts = p.options as Array<unknown>;
      const enumVals = opts.map((o) =>
        typeof o === "object" && o != null && "value" in o
          ? (o as { value: unknown }).value
          : o,
      );
      jsonProp.enum = enumVals;
    }
    properties[name] = jsonProp;

    if (!p.optional && p.default === undefined) required.push(name);
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}
