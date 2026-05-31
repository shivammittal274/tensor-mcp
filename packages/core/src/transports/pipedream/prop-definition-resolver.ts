import type {
  PipedreamAppModule,
  PipedreamProp,
  PipedreamPropDefinitionRef,
  PipedreamStaticProp,
} from "./types";

function isPropDefRef(p: unknown): p is PipedreamPropDefinitionRef {
  return (
    typeof p === "object" &&
    p != null &&
    Array.isArray((p as PipedreamPropDefinitionRef).propDefinition)
  );
}

/**
 * Resolve a Pipedream prop down to a static shape. `propDefinition: [app, "key"]`
 * is followed one level into the app's `propDefinitions`; the local entry's
 * `description` / `optional` / `default` / `hidden` overrides win.
 *
 * Cross-action references that themselves use `propDefinition` are resolved
 * recursively up to a small depth. We never call `options()` — that's a
 * UI-time lookup, irrelevant at execute time.
 */
export function resolveProp(
  prop: PipedreamProp | PipedreamAppModule,
  depth = 0,
): PipedreamStaticProp | { type: "app" } {
  if (depth > 5) return { type: "any" };

  if (isAppLike(prop)) return { type: "app" };

  if (isPropDefRef(prop)) {
    const [app, key] = prop.propDefinition;
    const upstream = app?.propDefinitions?.[key];
    if (!upstream) return { type: "any", description: prop.description };
    const resolved = resolveProp(upstream, depth + 1);
    if (isAppShape(resolved)) return resolved;
    return {
      ...resolved,
      description: prop.description ?? resolved.description,
      optional: prop.optional ?? resolved.optional,
      default: prop.default ?? resolved.default,
      hidden: prop.hidden ?? resolved.hidden,
    };
  }

  return prop as PipedreamStaticProp;
}

function isAppLike(p: unknown): p is PipedreamAppModule {
  return (
    typeof p === "object" &&
    p != null &&
    (p as PipedreamAppModule).type === "app" &&
    typeof (p as PipedreamAppModule).propDefinitions === "object"
  );
}

function isAppShape(r: unknown): r is { type: "app" } {
  return typeof r === "object" && r != null && (r as { type: string }).type === "app";
}
