import { scValToNative, type xdr } from "@stellar/stellar-sdk";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LIMIT, MAX_LIMIT, idRange, parsePagination } from "../src/lib/pagination";

const { simulateContractCall } = vi.hoisted(() => ({ simulateContractCall: vi.fn() }));
vi.mock("../src/lib/stellar", () => ({
  simulateContractCall: (...args: unknown[]) => simulateContractCall(...args),
  rpcCacheStats: () => ({ hits: 0, misses: 0, size: 0, ttlMs: 0 }),
}));

const EVENT_COUNT = 25;

// The list route has a module-level rate limiter (10 requests a minute), so each
// test loads a fresh app instead of sharing limiter state with the others.
let app: ReturnType<(typeof import("../src/app"))["createApp"]>;

/** Event `id` is named `E<id>` and its goal grows with the id, so sorting by goal reverses the order. */
function mockContract(count = EVENT_COUNT) {
  simulateContractCall.mockImplementation(async (fn: string, arg?: xdr.ScVal) => {
    if (fn === "event_count") return count;
    if (fn === "get_event") {
      const id = Number(scValToNative(arg!));
      return {
        organizer: "GORGANIZER",
        name: `E${id}`,
        description: "",
        venue: "Lagos",
        date_unix: BigInt(1_000 + id),
        funding_goal: BigInt((id + 1) * 100),
        balance: 0n,
        status: ["Active"],
      };
    }
    throw new Error(`unexpected contract call: ${fn}`);
  });
}

/** The event ids the API asked the contract for. */
function fetchedIds(): number[] {
  return simulateContractCall.mock.calls
    .filter(([fn]) => fn === "get_event")
    .map(([, arg]) => Number(scValToNative(arg as xdr.ScVal)));
}

beforeEach(async () => {
  vi.resetModules();
  app = (await import("../src/app")).createApp();
  simulateContractCall.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockContract();
});

describe("GET /api/events pagination", () => {
  it("returns a bare array of every event when no pagination params are sent", async () => {
    const res = await request(app).get("/api/events");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(EVENT_COUNT);
    expect(fetchedIds()).toHaveLength(EVENT_COUNT);
  });

  it("returns the first page and fetches only that page from the contract", async () => {
    const res = await request(app).get("/api/events?limit=5&offset=0");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: EVENT_COUNT, limit: 5, offset: 0 });
    expect(res.body.data.map((e: { id: number }) => e.id)).toEqual([0, 1, 2, 3, 4]);
    expect(fetchedIds().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns the next page", async () => {
    const res = await request(app).get("/api/events?limit=5&offset=5");

    expect(res.body.data.map((e: { id: number }) => e.id)).toEqual([5, 6, 7, 8, 9]);
    expect(fetchedIds().sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9]);
  });

  it("returns a short last page", async () => {
    const res = await request(app).get("/api/events?limit=5&offset=23");

    expect(res.body.data.map((e: { id: number }) => e.id)).toEqual([23, 24]);
    expect(res.body.total).toBe(EVENT_COUNT);
  });

  it("returns an empty page, without fetching events, when the offset is past the end", async () => {
    const res = await request(app).get("/api/events?limit=5&offset=100");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], total: EVENT_COUNT, limit: 5, offset: 100 });
    expect(fetchedIds()).toEqual([]);
  });

  it("defaults the limit when only an offset is sent", async () => {
    const res = await request(app).get("/api/events?offset=0");

    expect(res.body.limit).toBe(DEFAULT_LIMIT);
    expect(res.body.data).toHaveLength(DEFAULT_LIMIT);
  });

  it("defaults the offset when only a limit is sent", async () => {
    const res = await request(app).get("/api/events?limit=3");

    expect(res.body.offset).toBe(0);
    expect(res.body.data.map((e: { id: number }) => e.id)).toEqual([0, 1, 2]);
  });

  it("handles a contract with no events", async () => {
    mockContract(0);

    const res = await request(app).get("/api/events?limit=5");

    expect(res.body).toEqual({ data: [], total: 0, limit: 5, offset: 0 });
  });

  it("sorts across all events, then slices the page", async () => {
    const res = await request(app).get("/api/events?sort=goal&limit=3&offset=0");

    // Goals grow with the id, so sorting by goal puts the highest ids first.
    expect(res.body.data.map((e: { name: string }) => e.name)).toEqual(["E24", "E23", "E22"]);
    expect(res.body.total).toBe(EVENT_COUNT);
    expect(fetchedIds()).toHaveLength(EVENT_COUNT);
  });

  it("pages through a sorted list without gaps or repeats", async () => {
    const first = await request(app).get("/api/events?sort=goal&limit=3&offset=0");
    const second = await request(app).get("/api/events?sort=goal&limit=3&offset=3");

    expect(second.body.data.map((e: { name: string }) => e.name)).toEqual(["E21", "E20", "E19"]);
    const ids = [...first.body.data, ...second.body.data].map((e: { id: number }) => e.id);
    expect(new Set(ids).size).toBe(6);
  });

  it.each([
    ["limit=0"],
    [`limit=${MAX_LIMIT + 1}`],
    ["limit=-1"],
    ["limit=abc"],
    ["limit=1.5"],
    ["limit="],
    ["limit=5&limit=6"],
    ["offset=-1"],
    ["offset=x"],
    ["offset=1.5"],
  ])("rejects ?%s with 400 before calling the contract", async (query) => {
    const res = await request(app).get(`/api/events?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit|offset/);
    expect(simulateContractCall).not.toHaveBeenCalled();
  });

  it("accepts the maximum limit", async () => {
    const res = await request(app).get(`/api/events?limit=${MAX_LIMIT}`);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(MAX_LIMIT);
  });
});

describe("parsePagination", () => {
  it("is not paginated without limit or offset", () => {
    expect(parsePagination({})).toMatchObject({ ok: true, paginated: false });
    expect(parsePagination({ sort: "date" })).toMatchObject({ ok: true, paginated: false });
  });

  it("opts in with either parameter", () => {
    expect(parsePagination({ limit: "10" })).toEqual({
      ok: true,
      paginated: true,
      limit: 10,
      offset: 0,
    });
    expect(parsePagination({ offset: "40" })).toEqual({
      ok: true,
      paginated: true,
      limit: DEFAULT_LIMIT,
      offset: 40,
    });
  });

  it("rejects numbers too large to represent exactly", () => {
    expect(parsePagination({ offset: "99999999999999999999" })).toMatchObject({ ok: false });
  });
});

describe("idRange", () => {
  it("covers everything by default", () => {
    expect(idRange(3)).toEqual([0, 1, 2]);
    expect(idRange(0)).toEqual([]);
  });

  it("clamps to the number of events", () => {
    expect(idRange(10, 8, 5)).toEqual([8, 9]);
    expect(idRange(10, 10, 5)).toEqual([]);
    expect(idRange(10, 50, 5)).toEqual([]);
  });
});
