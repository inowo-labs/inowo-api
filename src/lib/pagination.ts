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
 * with `limit` defaulting to `defaultLimit` and `offset` to 0. `maxLimit`
 * lets a route cap `limit` below `MAX_LIMIT` to match a contract-side page
 * size (e.g. sponsorships, capped at the contract's `MAX_SPONSORSHIP_PAGE`).
 */
export function parsePagination(
  query: Record<string, unknown>,
  { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT }: { defaultLimit?: number; maxLimit?: number } = {}
): PaginationParams {
  const { limit: rawLimit, offset: rawOffset } = query;
  if (rawLimit === undefined && rawOffset === undefined) {
    return { ok: true, paginated: false, limit: defaultLimit, offset: 0 };
  }

  const limit = rawLimit === undefined ? defaultLimit : parseNonNegativeInt(rawLimit);
  if (limit === null || limit < 1 || limit > maxLimit) {
    return { ok: false, error: `limit must be an integer between 1 and ${maxLimit}` };
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
