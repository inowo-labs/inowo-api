import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const { simulateContractCall } = vi.hoisted(() => ({ simulateContractCall: vi.fn() }));
vi.mock("../src/lib/stellar", () => ({
  simulateContractCall: (...args: unknown[]) => simulateContractCall(...args),
  rpcCacheStats: () => ({ hits: 0, misses: 0, size: 0, ttlMs: 0 }),
}));

// Shape returned by scValToNative for OrganizerStats: u32 as number, i128 as bigint.
function rawStats(overrides: Record<string, unknown> = {}) {
  return {
    events_created: 3,
    events_ended: 2,
    events_cancelled: 0,
    total_raised: 900_000_000n,
    total_released: 400_000_000n,
    total_refunded: 0n,
    ...overrides,
  };
}

function mockCalls(handlers: Record<string, (...args: unknown[]) => unknown>) {
  simulateContractCall.mockImplementation(async (fn: string, ...args: unknown[]) => {
    const handler = handlers[fn];
    if (!handler) throw new Error(`unexpected contract call: ${fn}`);
    return handler(...args);
  });
}

const app = createApp();
const ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

beforeEach(() => {
  simulateContractCall.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/addresses/:address/organizer-stats", () => {
  it("400s for an address that isn't a valid Stellar public key", async () => {
    const res = await request(app).get("/api/addresses/not-an-address/organizer-stats");

    expect(res.status).toBe(400);
    expect(simulateContractCall).not.toHaveBeenCalled();
  });

  it("serializes the contract's OrganizerStats, bigints as strings", async () => {
    mockCalls({ get_organizer_stats: () => rawStats() });

    const res = await request(app).get(`/api/addresses/${ADDRESS}/organizer-stats`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      events_created: 3,
      events_ended: 2,
      events_cancelled: 0,
      total_raised: "900000000",
      total_released: "400000000",
      total_refunded: "0",
    });
  });

  it("returns all zeros for an address that has never organized anything", async () => {
    mockCalls({
      get_organizer_stats: () =>
        rawStats({ events_created: 0, events_ended: 0, total_raised: 0n, total_released: 0n }),
    });

    const res = await request(app).get(`/api/addresses/${ADDRESS}/organizer-stats`);

    expect(res.status).toBe(200);
    expect(res.body.events_created).toBe(0);
    expect(res.body.total_raised).toBe("0");
  });
});

describe("GET /api/addresses/:address/organizer-events", () => {
  it("400s for an address that isn't a valid Stellar public key", async () => {
    const res = await request(app).get("/api/addresses/not-an-address/organizer-events");

    expect(res.status).toBe(400);
    expect(simulateContractCall).not.toHaveBeenCalled();
  });

  it("returns event ids with pagination metadata from events_created", async () => {
    mockCalls({
      get_organizer_events: () => [0, 2, 5],
      get_organizer_stats: () => rawStats({ events_created: 3 }),
    });

    const res = await request(app).get(`/api/addresses/${ADDRESS}/organizer-events`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [0, 2, 5], total: 3, limit: 20, offset: 0 });
  });

  it("passes ?limit= and ?offset= through to the contract call", async () => {
    mockCalls({
      get_organizer_events: (..._args) => [7],
      get_organizer_stats: () => rawStats({ events_created: 10 }),
    });

    const res = await request(app).get(
      `/api/addresses/${ADDRESS}/organizer-events?limit=1&offset=7`
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [7], total: 10, limit: 1, offset: 7 });
  });

  it("400s for a limit above MAX_ORGANIZER_EVENTS_PAGE, without calling the contract", async () => {
    const res = await request(app).get(
      `/api/addresses/${ADDRESS}/organizer-events?limit=51`
    );

    expect(res.status).toBe(400);
    expect(simulateContractCall).not.toHaveBeenCalled();
  });
});
