import { describe, expect, it } from "vitest";
import { decodeEvent, KNOWN_EVENT_TABLES } from "../../src/indexer/decode";
import { BUYER, fixtures, ORGANIZER, RECIPIENT, SPONSOR } from "./fixtures";

describe("decodeEvent", () => {
  it("decodes event_created", () => {
    expect(decodeEvent(fixtures.eventCreated())).toEqual({
      table: "event_created",
      columns: { event_id: 0, organizer: ORGANIZER, funding_goal: "500000000", date_unix: 1_800_000_000 },
    });
  });

  it("decodes sponsored", () => {
    expect(decodeEvent(fixtures.sponsored())).toEqual({
      table: "sponsored",
      columns: { event_id: 0, sponsor: SPONSOR, amount: "40000000" },
    });
  });

  it("decodes ticket_purchased", () => {
    expect(decodeEvent(fixtures.ticketPurchased())).toEqual({
      table: "ticket_purchased",
      columns: { event_id: 0, buyer: BUYER, ticket_id: 3, tier_index: 1, price: "50000000" },
    });
  });

  it("decodes ticket_transferred", () => {
    expect(decodeEvent(fixtures.ticketTransferred())).toEqual({
      table: "ticket_transferred",
      columns: { event_id: 0, from: BUYER, to: RECIPIENT, ticket_id: 3 },
    });
  });

  it("decodes ticket_redeemed", () => {
    expect(decodeEvent(fixtures.ticketRedeemed())).toEqual({
      table: "ticket_redeemed",
      columns: { event_id: 0, ticket_id: 3 },
    });
  });

  it("decodes event_ended", () => {
    expect(decodeEvent(fixtures.eventEnded())).toEqual({
      table: "event_ended",
      columns: { event_id: 0, balance: "360000000" },
    });
  });

  it("decodes event_cancelled", () => {
    expect(decodeEvent(fixtures.eventCancelled())).toEqual({
      table: "event_cancelled",
      columns: { event_id: 0, balance: "30000000" },
    });
  });

  it("decodes ticket_refunded", () => {
    expect(decodeEvent(fixtures.ticketRefunded())).toEqual({
      table: "ticket_refunded",
      columns: { event_id: 0, owner: BUYER, ticket_id: 3, amount: "50000000" },
    });
  });

  it("decodes sponsorship_refunded", () => {
    expect(decodeEvent(fixtures.sponsorshipRefunded())).toEqual({
      table: "sponsorship_refunded",
      columns: { event_id: 0, sponsor: SPONSOR, amount: "40000000" },
    });
  });

  it("decodes funds_released, including the memo string", () => {
    expect(decodeEvent(fixtures.fundsReleased())).toEqual({
      table: "funds_released",
      columns: { event_id: 0, recipient: RECIPIENT, payout_id: 0, amount: "25000000", memo: "Venue hire" },
    });
  });

  it("returns null for an event type it doesn't recognise, instead of throwing", () => {
    expect(decodeEvent(fixtures.unrecognised())).toBeNull();
  });

  it("every decoder is covered by a fixture above", () => {
    const covered = [
      "event_created",
      "sponsored",
      "ticket_purchased",
      "ticket_transferred",
      "ticket_redeemed",
      "event_ended",
      "event_cancelled",
      "ticket_refunded",
      "sponsorship_refunded",
      "funds_released",
    ];
    expect([...KNOWN_EVENT_TABLES].sort()).toEqual([...covered].sort());
  });
});
