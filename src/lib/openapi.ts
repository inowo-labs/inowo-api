import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

// openapi.yaml lives at the project root, not under src/, so it isn't
// compiled by tsc — read it from disk relative to this file's own location
// rather than process.cwd(), which can differ depending on how the process
// was started.
const SPEC_PATH = join(__dirname, "..", "..", "openapi.yaml");

let cached: { yaml: string; json: unknown } | undefined;

export function loadOpenApiSpec(): { yaml: string; json: unknown } {
  if (!cached) {
    const yaml = readFileSync(SPEC_PATH, "utf8");
    cached = { yaml, json: parse(yaml) };
  }
  return cached;
}
