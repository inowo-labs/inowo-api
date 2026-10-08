import type { Event, EventStatus, Payout } from "../types/contract";

/** Converts bigint values (i128/u64 from the contract) to strings so they survive JSON. */
export function serializeBigInt(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInt);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        serializeBigInt(v),
      ])
    );
  }
  return value;
}

// scValToNative decodes a unit enum variant such as EventStatus::Active as ["Active"].
export function toEventStatus(raw: unknown): EventStatus {
  return (Array.isArray(raw) ? raw[0] : raw) as EventStatus;
}

export function serializePayout(id: number, raw: unknown): Payout {
  const payout = serializeBigInt(raw) as Record<string, unknown>;
  return {
    id,
    recipient: String(payout.recipient),
    amount: String(payout.amount),
    memo: String(payout.memo),
    timestamp: Number(payout.timestamp),
  };
}

export function serializeEvent(raw: unknown): Event {
  const event = serializeBigInt(raw) as Record<string, unknown>;
  return {
    ...event,
    date_unix: Number(event.date_unix),
    status: toEventStatus(event.status),
  } as Event;
}
