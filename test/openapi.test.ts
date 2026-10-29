import { readFileSync } from "fs";
import { join } from "path";
import { Validator } from "@seriousme/openapi-schema-validator";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { loadOpenApiSpec } from "../src/lib/openapi";

const ROOT = join(__dirname, "..");

// Meta endpoints that serve the docs themselves, not part of the documented
// JSON API surface.
const UNDOCUMENTED = new Set(["GET /openapi.json", "GET /docs"]);

/**
 * Pulls `router.get("/path", ...)` / `app.get("/path", ...)` calls out of
 * source text. This is a static-text scan, not a real parser or a running
 * Express app, but it is exactly the pair of calls both these files ever
 * make, it needs nothing booted (no env vars, no RPC), and it reads the
 * same source a human reviewing a diff would.
 */
function extractRoutes(source: string): string[] {
  const calls = source.matchAll(/\b(?:router|app)\.get\(\s*["'`]([^"'`]+)["'`]/g);
  return [...calls].map(([, path]) => path);
}

/** Express's `:id` becomes OpenAPI's `{id}`. */
function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function liveRoutes(): string[] {
  const appRoutes = extractRoutes(readFileSync(join(ROOT, "src/app.ts"), "utf8"));
  const eventRoutes = extractRoutes(readFileSync(join(ROOT, "src/routes/events.ts"), "utf8")).map(
    (p) => (p === "/" ? "/api/events" : `/api/events${p}`)
  );
  const addressRoutes = extractRoutes(readFileSync(join(ROOT, "src/routes/addresses.ts"), "utf8")).map(
    (p) => (p === "/" ? "/api/addresses" : `/api/addresses${p}`)
  );
  return [...appRoutes, ...eventRoutes, ...addressRoutes].map(toOpenApiPath);
}

function specRoutes(spec: { paths: Record<string, Record<string, unknown>> }): string[] {
  const methods = ["get", "post", "put", "patch", "delete"];
  return Object.entries(spec.paths).flatMap(([path, operations]) =>
    methods.filter((m) => operations[m]).map((m) => `${m.toUpperCase()} ${path}`)
  );
}

describe("openapi.yaml", () => {
  it("is a valid OpenAPI 3.1 document", async () => {
    const validator = new Validator();
    const result = await validator.validate(parse(loadOpenApiSpec().yaml));

    expect(result.valid, JSON.stringify(result.errors, null, 2)).toBe(true);
  });

  it("documents exactly the GET routes the app registers", () => {
    const live = new Set(liveRoutes().map((p) => `GET ${p}`));
    const documented = new Set(specRoutes(parse(loadOpenApiSpec().yaml) as never));

    const undocumented = [...live].filter((r) => !documented.has(r) && !UNDOCUMENTED.has(r));
    const stale = [...documented].filter((r) => !live.has(r) && !UNDOCUMENTED.has(r));

    expect(undocumented, "routes missing from openapi.yaml").toEqual([]);
    expect(stale, "openapi.yaml documents routes that no longer exist").toEqual([]);
  });

  it("gives every schema referenced from a response a description or required fields", () => {
    const spec = parse(loadOpenApiSpec().yaml) as {
      components: { schemas: Record<string, { type?: string; required?: string[] }> };
    };

    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      if (schema.type === "object") {
        expect(schema.required, `${name} should list its required fields`).toBeDefined();
      }
    }
  });
});
