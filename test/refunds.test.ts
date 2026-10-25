import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openIndexerDb, type IndexerDb } from "../src/indexer/store";
import { fixtures, BUYER, SPONSOR } from "./indexer/fixtures";

const { simulateContractCall } = vi.hoisted(() => ({ simulateContractCall: vi.fn() }));
vi.mock("../src/lib/stellar", () => ({
  simulateContractCall: (...args: unknown[]) => simulateContractCall(...args),
  rpcCacheStats: () => ({ hits: 0, misses: 0, size: 0, ttlMs: 0 }),
}));

let indexerDb: IndexerDb;
const { getIndexerDb } = vi.hoisted(() => ({ getIndexerDb: vi.fn() }));
vi.mock("../src/lib/indexerDb", () => ({ getIndexerDb: () => getIndexerDb() }));

import { createApp } from "../src/app";

const app = createApp();

beforeEach(() => {
  simulateContractCall.mockReset();
  simulateContractCall.mockImplementation(async (fn: string) => {
    if (fn === "get_event") return { event_id: 0, status: "Cancelled" };
    throw new Error(`unexpected contract call: ${fn}`);
  });
  indexerDb = openIndexerDb(":memory:");
  getIndexerDb.mockReturnValue(indexerDb);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/events/:id/refunds", () => {
  it("returns both refund types for the event, newest first, with total_refunded", async () => {
    indexerDb.applyPage(
      [
        fixtures.ticketRefunded({ id: "r1", ledger: 1000 }),
        fixtures.sponsorshipRefunded({ id: "r2", ledger: 1005 }),
      ],
      "c",
      1005
    );

    const res = await request(app).get("/api/events/0/refunds");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        type: "sponsorship",
        address: SPONSOR,
        amount: "40000000",
        ledger: 1005,
        timestamp: "2026-01-01T00:00:00Z",
        tx_hash: "tx-r2",
      },
      {
        type: "ticket",
        address: BUYER,
        amount: "50000000",
        ticket_id: 3,
        ledger: 1000,
        timestamp: "2026-01-01T00:00:00Z",
        tx_hash: "tx-r1",
      },
    ]);
    expect(res.body.total_refunded).toBe("90000000");
  });

  it("omits ticket_id for sponsorship refunds", async () => {
    indexerDb.applyPage([fixtures.sponsorshipRefunded({ id: "r1" })], "c", 1000);

    const res = await request(app).get("/api/events/0/refunds");

    expect(res.body.data[0]).not.toHaveProperty("ticket_id");
  });

  it("returns an empty list and zero total for an event with no refunds", async () => {
    const res = await request(app).get("/api/events/0/refunds");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], total_refunded: "0" });
  });

  it("only returns refunds for the requested event", async () => {
    indexerDb.applyPage([fixtures.ticketRefunded({ id: "r1" })], "c", 1000);
    // A refund from a different event shouldn't show up under event 0.
    indexerDb.raw
      .prepare(
        `INSERT INTO ticket_refunded (id, ledger, ledger_closed_at, tx_hash, event_id, owner, ticket_id, amount)
         VALUES ('r-other-event', 999, '2026-01-01T00:00:00Z', 'tx-other', 1, @buyer, 7, '1000')`
      )
      .run({ buyer: BUYER });

    const res = await request(app).get("/api/events/0/refunds");
    expect(res.body.data).toHaveLength(1);
  });

  it("404s for an event that doesn't exist", async () => {
    simulateContractCall.mockImplementation(async (fn: string) => {
      if (fn === "get_event") {
        const { ContractError, ContractErrorCode } = await import("../src/lib/errors");
        throw new ContractError(ContractErrorCode.EventNotFound);
      }
      throw new Error(`unexpected contract call: ${fn}`);
    });

    const res = await request(app).get("/api/events/99/refunds");

    expect(res.status).toBe(404);
  });

  it("400s for a malformed event id, without touching the contract or the index", async () => {
    const res = await request(app).get("/api/events/not-a-number/refunds");

    expect(res.status).toBe(400);
    expect(simulateContractCall).not.toHaveBeenCalled();
  });
});
