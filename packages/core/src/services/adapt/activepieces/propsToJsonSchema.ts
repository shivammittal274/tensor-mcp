/**
 * Convert an Activepieces props map into a JSON Schema fragment that the
 * tensor-mcp catalog can index. We collapse vendor-specific PropertyTypes
 * (DROPDOWN, DYNAMIC, FILE) onto their JSON equivalent — the agent only
 * needs a workable shape, not the UI metadata.
 */

import { PropertyType, type ActivepiecesAction } from "./framework";

interface JsonSchemaProp {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchemaProp;
  default?: unknown;
  // biome-ignore lint/suspicious/noExplicitAny: nested-schema passthrough
  [k: string]: any;
}

function propToJsonSchema(prop: {
  type: PropertyType;
  displayName?: string;
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: shape varies by PropertyType
  options?: any;
}): JsonSchemaProp {
  const out: JsonSchemaProp = {};
  if (prop.description || prop.displayName) {
    out.description = prop.description ?? prop.displayName;
  }
  if (prop.defaultValue !== undefined) {
    out.default = prop.defaultValue;
  }
  switch (prop.type) {
    case PropertyType.SHORT_TEXT:
    case PropertyType.LONG_TEXT:
    case PropertyType.SECRET_TEXT:
    case PropertyType.DATE_TIME:
    case PropertyType.COLOR:
    case PropertyType.DROPDOWN:
    case PropertyType.STATIC_DROPDOWN:
      out.type = "string";
      if (prop.options?.options && Array.isArray(prop.options.options)) {
        const values = prop.options.options
          .map((o: { value: unknown }) => o.value)
          .filter((v: unknown) => typeof v === "string");
        if (values.length > 0) out.enum = values;
      }
      break;
    case PropertyType.NUMBER:
      out.type = "number";
      break;
    case PropertyType.CHECKBOX:
      out.type = "boolean";
      break;
    case PropertyType.ARRAY:
    case PropertyType.MULTI_SELECT_DROPDOWN:
    case PropertyType.STATIC_MULTI_SELECT_DROPDOWN:
      out.type = "array";
      out.items = { type: "string" };
      break;
    case PropertyType.JSON:
    case PropertyType.OBJECT:
    case PropertyType.DYNAMIC:
      out.type = "object";
      break;
    case PropertyType.FILE:
      out.type = "string";
      out.description =
        (out.description ?? "") +
        " (base64-encoded file or URL; tensor-mcp does not stage binaries)";
      break;
    case PropertyType.MARKDOWN:
      // UI-only — skip from JSON Schema.
      return { type: "null" };
    default:
      out.type = "string";
  }
  return out;
}

export function actionToJsonSchema(action: ActivepiecesAction): {
  type: "object";
  properties: Record<string, JsonSchemaProp>;
  required: string[];
} {
  const properties: Record<string, JsonSchemaProp> = {};
  const required: string[] = [];
  for (const [key, prop] of Object.entries(action.props)) {
    const p = prop as {
      type: PropertyType;
      required?: boolean;
      displayName?: string;
      description?: string;
      defaultValue?: unknown;
    };
    if (p.type === PropertyType.MARKDOWN) continue;
    properties[key] = propToJsonSchema(p);
    if (p.required) required.push(key);
  }
  return { type: "object", properties, required };
}
