import { describe, expect, it } from "vitest";
import { serializeBigInt, serializeEvent } from "../src/lib/serialize";

describe("serializeEvent", () => {
  it("passes through a present funding_deadline as a number", () => {
    const event = serializeEvent({
      organizer: "GORGANIZER",
      name: "Stellar Meetup",
      description: "desc",
      venue: "Lagos",
      date_unix: 1_760_000_000n,
      funding_goal: 500_000_000n,
      funding_deadline: 1_755_000_000n,
      balance: 0n,
      status: ["Active"],
    });

    expect(event.funding_deadline).toBe(1_755_000_000);
  });

  it("serializes a missing funding_deadline as null, not 0 or NaN", () => {
    // An event created before this field existed on the deployed contract
    // decodes with no funding_deadline key at all — Number(undefined) is
    // NaN, which JSON can't represent (it'd silently become null over the
    // wire either way, masking the bug); asserting on the object directly,
    // before it's ever serialized to JSON, is what actually catches it.
    const event = serializeEvent({
      organizer: "GORGANIZER",
      name: "Stellar Meetup",
      description: "desc",
      venue: "Lagos",
      date_unix: 1_760_000_000n,
      funding_goal: 500_000_000n,
      balance: 0n,
      status: ["Active"],
    });

    expect(event.funding_deadline).toBeNull();
    expect(event.funding_deadline).not.toBeNaN();
  });
});

describe("serializeBigInt", () => {
  it("passes a Uint8Array through unchanged instead of treating it as a plain object", () => {
    const bytes = new Uint8Array(32).fill(0xab);
    expect(serializeBigInt(bytes)).toBe(bytes);
  });
});
