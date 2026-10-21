import { scValToNative, type xdr } from "@stellar/stellar-sdk";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { simulateContractCall } = vi.hoisted(() => ({ simulateContractCall: vi.fn() }));
vi.mock("../src/lib/stellar", () => ({
  simulateContractCall: (...args: unknown[]) => simulateContractCall(...args),
  rpcCacheStats: () => ({ hits: 0, misses: 0, size: 0, ttlMs: 0 }),
}));

import { createApp } from "../src/app";

const MAX_SPONSORSHIP_PAGE = 50;
const app = createApp();

/** Sponsorship `i` is from `S<i>` for an amount that grows with `i`. */
function sponsorship(i: number) {
  return { sponsor: `S${i}`, amount: BigInt((i + 1) * 1000) };
}

function mockContract(total: number) {
  simulateContractCall.mockImplementation(async (fn: string, ...args: xdr.ScVal[]) => {
    if (fn === "sponsor_count") return total;
    if (fn === "get_sponsorships") {
      const [, offsetArg, limitArg] = args;
      const offset = Number(scValToNative(offsetArg));
      const limit = Math.min(Number(scValToNative(limitArg)), MAX_SPONSORSHIP_PAGE);
      const end = Math.min(offset + limit, total);
      return Array.from({ length: Math.max(0, end - offset) }, (_, i) => sponsorship(offset + i));
    }
    throw new Error(`unexpected contract call: ${fn}`);
  });
}

beforeEach(() => {
  simulateContractCall.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/events/:id/sponsorships pagination", () => {
  it("returns a bare array when neither limit nor offset is sent, calling the contract with (0, 50)", async () => {
    mockContract(3);

    const res = await request(app).get("/api/events/0/sponsorships");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);
    expect(simulateContractCall).toHaveBeenCalledWith(
      "get_sponsorships",
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    const [, , offsetArg, limitArg] = simulateContractCall.mock.calls[0];
    expect(scValToNative(offsetArg)).toBe(0);
    expect(scValToNative(limitArg)).toBe(MAX_SPONSORSHIP_PAGE);
  });

  it("returns a page with data/total/limit/offset when limit or offset is sent", async () => {
    mockContract(10);

    const res = await request(app).get("/api/events/0/sponsorships?limit=4&offset=2");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(10);
    expect(res.body.limit).toBe(4);
    expect(res.body.offset).toBe(2);
    expect(res.body.data.map((s: { sponsor: string }) => s.sponsor)).toEqual(["S2", "S3", "S4", "S5"]);
  });

  it("serializes amounts to strings within a page, same as the bare-array response", async () => {
    mockContract(1);

    const res = await request(app).get("/api/events/0/sponsorships?limit=1");

    expect(res.body.data[0]).toEqual({ sponsor: "S0", amount: "1000" });
  });

  it("caps the limit at MAX_SPONSORSHIP_PAGE even if a larger one is requested", async () => {
    mockContract(60);

    const res = await request(app).get("/api/events/0/sponsorships?limit=200");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit must be an integer between 1 and 50/);
  });

  it.each(["limit=0", "limit=51", "limit=-1", "limit=abc", "offset=-1", "offset=abc"])(
    "rejects ?%s with 400 before calling the contract",
    async (query) => {
      const res = await request(app).get(`/api/events/0/sponsorships?${query}`);

      expect(res.status).toBe(400);
      expect(simulateContractCall).not.toHaveBeenCalled();
    }
  );

  it("accepts the maximum limit of 50", async () => {
    mockContract(50);

    const res = await request(app).get("/api/events/0/sponsorships?limit=50");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(50);
  });

  it("returns an empty page, without error, when the offset is past the end", async () => {
    mockContract(5);

    const res = await request(app).get("/api/events/0/sponsorships?limit=10&offset=100");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], total: 5, limit: 10, offset: 100 });
  });

  it("needs a second page for an event with more than MAX_SPONSORSHIP_PAGE sponsorships", async () => {
    mockContract(75);

    const bareArray = await request(app).get("/api/events/0/sponsorships");
    const secondPage = await request(app).get("/api/events/0/sponsorships?limit=50&offset=50");

    // The bare-array response can't see past the contract's own page cap —
    // this is the documented limitation for events with > 50 sponsorships.
    expect(bareArray.body).toHaveLength(50);
    expect(secondPage.body.data).toHaveLength(25);
    expect(secondPage.body.total).toBe(75);
  });
});
