import { describe, expect, it, vi } from "vitest";
import { memoizeAsync } from "../src/lib/cache";

function setup(options: { ttlMs?: number; cacheError?: (err: unknown) => boolean } = {}) {
  let time = 1_000;
  const fn = vi.fn(async (n: number) => n * 2);
  const cached = memoizeAsync(fn, {
    ttlMs: options.ttlMs ?? 10_000,
    key: (n) => String(n),
    cacheError: options.cacheError,
    now: () => time,
  });
  return { fn, cached, advance: (ms: number) => (time += ms) };
}

describe("memoizeAsync", () => {
  it("serves repeat calls from the cache within the TTL", async () => {
    const { fn, cached } = setup();

    expect(await cached(2)).toBe(4);
    expect(await cached(2)).toBe(4);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(cached.stats()).toMatchObject({ hits: 1, misses: 1, size: 1 });
  });

  it("keys entries by arguments", async () => {
    const { fn, cached } = setup();

    await cached(1);
    await cached(2);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("calls through again once the TTL has passed", async () => {
    const { fn, cached, advance } = setup({ ttlMs: 10_000 });

    await cached(2);
    advance(9_999);
    await cached(2);
    advance(1);
    await cached(2);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight call between concurrent identical requests", async () => {
    const { fn, cached } = setup();

    const results = await Promise.all([cached(3), cached(3), cached(3)]);

    expect(results).toEqual([6, 6, 6]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures by default", async () => {
    let calls = 0;
    const flaky = memoizeAsync(
      async () => {
        calls++;
        if (calls === 1) throw new Error("RPC down");
        return "ok";
      },
      { ttlMs: 10_000, key: () => "k" }
    );

    await expect(flaky()).rejects.toThrow("RPC down");
    await expect(flaky()).resolves.toBe("ok");
    expect(calls).toBe(2);
  });

  it("caches failures that cacheError allows", async () => {
    const notFound = new Error("not found");
    const fn = vi.fn(async () => {
      throw notFound;
    });
    const cached = memoizeAsync(fn, {
      ttlMs: 10_000,
      key: () => "k",
      cacheError: (err) => err === notFound,
    });

    await expect(cached()).rejects.toBe(notFound);
    await expect(cached()).rejects.toBe(notFound);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("is disabled when the TTL is 0", async () => {
    const { fn, cached } = setup({ ttlMs: 0 });

    await cached(2);
    await cached(2);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(cached.stats().size).toBe(0);
  });
});
