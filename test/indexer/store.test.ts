import { beforeEach, describe, expect, it } from "vitest";
import { openIndexerDb, type IndexerDb } from "../../src/indexer/store";
import { BUYER, fixtures, ORGANIZER, SPONSOR } from "./fixtures";

let db: IndexerDb;

beforeEach(() => {
  db = openIndexerDb(":memory:");
});

describe("openIndexerDb", () => {
  it("has no cursor before anything is applied", () => {
    expect(db.getCursor()).toBeNull();
  });

  it("stores a decoded event and advances the cursor", () => {
    const { inserted, unknown } = db.applyPage([fixtures.eventCreated()], "cursor-1", 1000);

    expect(inserted).toBe(1);
    expect(unknown).toBe(0);
    expect(db.getCursor()).toEqual({ cursor: "cursor-1", lastLedger: 1000 });

    const row = db.raw.prepare("SELECT * FROM event_created").get() as Record<string, unknown>;
    expect(row).toMatchObject({ event_id: 0, organizer: ORGANIZER, funding_goal: "500000000" });
  });

  it("routes each event type to its own table", () => {
    db.applyPage(
      [fixtures.eventCreated(), fixtures.sponsored(), fixtures.fundsReleased()],
      "c",
      1000
    );

    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM event_created").get()).toEqual({ n: 1 });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM sponsored").get()).toEqual({ n: 1 });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM funds_released").get()).toEqual({ n: 1 });
  });

  it("is idempotent: applying the exact same page twice inserts nothing the second time", () => {
    const page = [fixtures.sponsored({ id: "evt-dup" }), fixtures.ticketPurchased({ id: "evt-dup-2" })];

    const first = db.applyPage(page, "cursor-1", 1000);
    const second = db.applyPage(page, "cursor-1", 1000);

    expect(first.inserted).toBe(2);
    expect(second.inserted).toBe(0);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM sponsored").get()).toEqual({ n: 1 });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM ticket_purchased").get()).toEqual({ n: 1 });
  });

  it("is idempotent across overlapping pages (shared boundary event)", () => {
    const shared = fixtures.sponsored({ id: "evt-boundary" });
    const before = fixtures.eventCreated({ id: "evt-before" });
    const after = fixtures.ticketPurchased({ id: "evt-after" });

    db.applyPage([before, shared], "cursor-1", 1000);
    db.applyPage([shared, after], "cursor-2", 1001); // RPC re-sent the boundary event

    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM sponsored").get()).toEqual({ n: 1 });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM event_created").get()).toEqual({ n: 1 });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM ticket_purchased").get()).toEqual({ n: 1 });
    expect(db.getCursor()).toEqual({ cursor: "cursor-2", lastLedger: 1001 });
  });

  it("counts unrecognised event types without storing or throwing", () => {
    const { inserted, unknown } = db.applyPage(
      [fixtures.sponsored(), fixtures.unrecognised()],
      "c",
      1000
    );

    expect(inserted).toBe(1);
    expect(unknown).toBe(1);
  });

  it("stores amounts as TEXT, not a JS number, so i128 precision past 2^53 survives", () => {
    db.applyPage([fixtures.fundsReleased({ id: "evt-amount" })], "c", 1000);

    const row = db.raw.prepare("SELECT amount, typeof(amount) AS t FROM funds_released").get() as {
      amount: string;
      t: string;
    };
    expect(row.t).toBe("text");
    expect(row.amount).toBe("25000000");
  });

  it("filters sponsorships by sponsor and payouts by recipient", () => {
    db.applyPage(
      [
        fixtures.sponsored({ id: "s1" }),
        fixtures.sponsored({ id: "s2" }),
      ],
      "c",
      1000
    );
    const rows = db.raw.prepare("SELECT sponsor FROM sponsored WHERE sponsor = ?").all(SPONSOR);
    expect(rows).toHaveLength(2);
  });

  it("indexes buyer-scoped lookups", () => {
    db.applyPage([fixtures.ticketPurchased({ id: "t1" })], "c", 1000);
    const rows = db.raw.prepare("SELECT buyer FROM ticket_purchased WHERE buyer = ?").all(BUYER);
    expect(rows).toHaveLength(1);
  });
});
