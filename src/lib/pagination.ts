export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export type PaginationParams =
  | {
      ok: true;
      /** False when the client sent neither `limit` nor `offset`. */
      paginated: boolean;
      limit: number;
      offset: number;
    }
  | { ok: false; error: string };

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Reads `?limit=` and `?offset=`. Sending either one opts into pagination,
 * with `limit` defaulting to DEFAULT_LIMIT and `offset` to 0.
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const { limit: rawLimit, offset: rawOffset } = query;
  if (rawLimit === undefined && rawOffset === undefined) {
    return { ok: true, paginated: false, limit: DEFAULT_LIMIT, offset: 0 };
  }

  const limit = rawLimit === undefined ? DEFAULT_LIMIT : parseNonNegativeInt(rawLimit);
  if (limit === null || limit < 1 || limit > MAX_LIMIT) {
    return { ok: false, error: `limit must be an integer between 1 and ${MAX_LIMIT}` };
  }

  const offset = rawOffset === undefined ? 0 : parseNonNegativeInt(rawOffset);
  if (offset === null) {
    return { ok: false, error: "offset must be a non-negative integer" };
  }

  return { ok: true, paginated: true, limit, offset };
}

/** The ids `[start, start + length)` that exist, given `count` events numbered from 0. */
export function idRange(count: number, start = 0, length = count): number[] {
  const end = Math.min(start + length, count);
  return start >= end ? [] : Array.from({ length: end - start }, (_, i) => start + i);
}
