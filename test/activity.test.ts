import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openIndexerDb, type IndexerDb } from "../src/indexer/store";
import { fixtures, ORGANIZER, SPONSOR, BUYER, RECIPIENT } from "./indexer/fixtures";

vi.mock("../src/lib/stellar", () => ({
  simulateContractCall: vi.fn(),
  rpcCacheStats: () => ({ hits: 0, misses: 0, size: 0, ttlMs: 0 }),
}));

let indexerDb: IndexerDb;
const { getIndexerDb } = vi.hoisted(() => ({ getIndexerDb: vi.fn() }));
vi.mock("../src/lib/indexerDb", () => ({ getIndexerDb: () => getIndexerDb() }));

import { createApp } from "../src/app";

const app = createApp();

beforeEach(() => {
  indexerDb = openIndexerDb(":memory:");
  getIndexerDb.mockReturnValue(indexerDb);
});

describe("GET /api/addresses/:address/activity", () => {
  it("400s for an address that isn't a valid Stellar public key", async () => {
    const res = await request(app).get("/api/addresses/not-an-address/activity");
    expect(res.status).toBe(400);
  });

  it("returns empty sections for an address with no activity", async () => {
    const res = await request(app).get(`/api/addresses/${ORGANIZER}/activity`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      organized: [],
      sponsorships: [],
      tickets: [],
      payouts_received: [],
      refunds: [],
    });
  });

  it("returns the event this address organized", async () => {
    indexerDb.applyPage([fixtures.eventCreated({ id: "e1" })], "c", 1000);

    const res = await request(app).get(`/api/addresses/${ORGANIZER}/activity`);

    expect(res.body.organized).toEqual([{ event_id: 0, tx_hash: "tx-e1" }]);
  });

  it("returns sponsorships with an amount", async () => {
    indexerDb.applyPage([fixtures.sponsored({ id: "s1" })], "c", 1000);

    const res = await request(app).get(`/api/addresses/${SPONSOR}/activity`);

    expect(res.body.sponsorships).toEqual([{ event_id: 0, amount: "40000000", tx_hash: "tx-s1" }]);
  });

  it("returns tickets with amount and ticket_id", async () => {
    indexerDb.applyPage([fixtures.ticketPurchased({ id: "t1" })], "c", 1000);

    const res = await request(app).get(`/api/addresses/${BUYER}/activity`);

    expect(res.body.tickets).toEqual([
      { event_id: 0, amount: "50000000", ticket_id: 3, tx_hash: "tx-t1" },
    ]);
  });

  it("returns payouts received", async () => {
    indexerDb.applyPage([fixtures.fundsReleased({ id: "f1" })], "c", 1000);

    const res = await request(app).get(`/api/addresses/${RECIPIENT}/activity`);

    expect(res.body.payouts_received).toEqual([
      { event_id: 0, amount: "25000000", tx_hash: "tx-f1" },
    ]);
  });

  it("returns both ticket and sponsorship refunds for the address, each typed", async () => {
    indexerDb.applyPage([fixtures.ticketRefunded({ id: "r1" })], "c", 1000);

    const ticketRefunds = await request(app).get(`/api/addresses/${BUYER}/activity`);
    expect(ticketRefunds.body.refunds).toEqual([
      { type: "ticket", event_id: 0, amount: "50000000", ticket_id: 3, tx_hash: "tx-r1" },
    ]);

    indexerDb.applyPage([fixtures.sponsorshipRefunded({ id: "r2" })], "c", 1001);
    const sponsorRefunds = await request(app).get(`/api/addresses/${SPONSOR}/activity`);
    expect(sponsorRefunds.body.refunds).toEqual([
      { type: "sponsorship", event_id: 0, amount: "40000000", tx_hash: "tx-r2" },
    ]);
  });

  it("only returns this address's own activity, not another address's", async () => {
    indexerDb.applyPage([fixtures.sponsored({ id: "s1" })], "c", 1000);

    const res = await request(app).get(`/api/addresses/${BUYER}/activity`);

    expect(res.body.sponsorships).toEqual([]);
  });

  it("paginates each section with ?limit= and ?offset=", async () => {
    indexerDb.applyPage(
      [
        fixtures.sponsored({ id: "s1", ledger: 1000 }),
        fixtures.sponsored({ id: "s2", ledger: 1001 }),
        fixtures.sponsored({ id: "s3", ledger: 1002 }),
      ],
      "c",
      1002
    );

    const res = await request(app).get(`/api/addresses/${SPONSOR}/activity?limit=1&offset=1`);

    expect(res.body.sponsorships).toHaveLength(1);
    expect(res.body.sponsorships[0].tx_hash).toBe("tx-s2"); // newest first, so offset 1 skips s3
  });

  it("400s for an invalid limit, without touching the index", async () => {
    const res = await request(app).get(`/api/addresses/${ORGANIZER}/activity?limit=0`);

    expect(res.status).toBe(400);
    expect(getIndexerDb).not.toHaveBeenCalled();
  });
});
