import { LRUCache } from "lru-cache";

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  ttlMs: number;
}

interface Options<A extends unknown[]> {
  /** How long a result stays fresh. 0 disables caching. */
  ttlMs: number;
  /** Maximum number of entries kept; least recently used are evicted first. */
  max?: number;
  /** Builds the cache key from the call's arguments. */
  key: (...args: A) => string;
  /** Whether a failed call's error may be cached. Defaults to never. */
  cacheError?: (err: unknown) => boolean;
  /** Clock, injectable for tests. */
  now?: () => number;
}

interface Entry<T> {
  expires: number;
  value: Promise<T>;
}

/**
 * Wraps an async function so identical calls within `ttlMs` share one result.
 *
 * The promise itself is cached, so concurrent identical calls share a single
 * in-flight request. Failures are evicted as soon as they settle unless
 * `cacheError` allows them, so a transient RPC error is never served twice.
 */
export function memoizeAsync<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  options: Options<A>
) {
  const now = options.now ?? Date.now;
  const cache = new LRUCache<string, Entry<T>>({ max: options.max ?? 1000 });
  let hits = 0;
  let misses = 0;

  function call(...args: A): Promise<T> {
    if (options.ttlMs <= 0) return fn(...args);

    const key = options.key(...args);
    const cached = cache.get(key);
    if (cached && cached.expires > now()) {
      hits++;
      return cached.value;
    }

    misses++;
    const value = fn(...args);
    cache.set(key, { expires: now() + options.ttlMs, value });
    value.catch((err: unknown) => {
      const stillOurs = cache.get(key)?.value === value;
      if (stillOurs && !options.cacheError?.(err)) cache.delete(key);
    });
    return value;
  }

  return Object.assign(call, {
    stats: (): CacheStats => ({ hits, misses, size: cache.size, ttlMs: options.ttlMs }),
    clear: () => cache.clear(),
  });
}
