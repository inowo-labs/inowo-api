import { rpc as SorobanRpc, scValToNative } from "@stellar/stellar-sdk";

/**
 * A decoded row, ready to insert. `table` names the event's SQLite table and
 * doubles as the `#[contractevent]` name (`event_created`, `sponsored`, …).
 * `columns` excludes the shared `id`/`ledger`/`ledger_closed_at`/`tx_hash`
 * columns, which every table has and the caller fills in from the envelope.
 */
export interface DecodedEvent {
  table: string;
  columns: Record<string, string | number>;
}

type Decoder = (topics: unknown[], data: Record<string, unknown>) => Record<string, string | number>;

// soroban-sdk's #[contractevent] puts the event name as the first topic
// (a Symbol, decoded to a string by scValToNative), then one JS value per
// #[topic] field in the order they're declared, then every other field in
// the data map. i128/i256 values decode to bigint; stringify them so they
// survive JSON and don't exceed SQLite/JS's safe integer range.
const DECODERS: Record<string, Decoder> = {
  event_created: (topics, data) => ({
    event_id: Number(topics[1]),
    organizer: String(topics[2]),
    funding_goal: String(data.funding_goal),
    date_unix: Number(data.date_unix),
  }),
  sponsored: (topics, data) => ({
    event_id: Number(topics[1]),
    sponsor: String(topics[2]),
    amount: String(data.amount),
  }),
  ticket_purchased: (topics, data) => ({
    event_id: Number(topics[1]),
    buyer: String(topics[2]),
    ticket_id: Number(data.ticket_id),
    tier_index: Number(data.tier_index),
    price: String(data.price),
  }),
  ticket_transferred: (topics, data) => ({
    event_id: Number(topics[1]),
    from: String(topics[2]),
    to: String(data.to),
    ticket_id: Number(data.ticket_id),
  }),
  ticket_redeemed: (topics, data) => ({
    event_id: Number(topics[1]),
    ticket_id: Number(data.ticket_id),
  }),
  event_ended: (topics, data) => ({
    event_id: Number(topics[1]),
    balance: String(data.balance),
  }),
  event_cancelled: (topics, data) => ({
    event_id: Number(topics[1]),
    balance: String(data.balance),
  }),
  ticket_refunded: (topics, data) => ({
    event_id: Number(topics[1]),
    owner: String(topics[2]),
    ticket_id: Number(data.ticket_id),
    amount: String(data.amount),
  }),
  sponsorship_refunded: (topics, data) => ({
    event_id: Number(topics[1]),
    sponsor: String(topics[2]),
    amount: String(data.amount),
  }),
  funds_released: (topics, data) => ({
    event_id: Number(topics[1]),
    recipient: String(topics[2]),
    payout_id: Number(data.payout_id),
    amount: String(data.amount),
    memo: String(data.memo),
  }),
};

export const KNOWN_EVENT_TABLES = Object.keys(DECODERS);

/**
 * Decodes one RPC event response, or returns null for an event this indexer
 * doesn't recognise (a diagnostic event that slipped through the filter, or
 * a contract event added after this code was written) — unknown events are
 * skipped, never a crash, so the indexer keeps running across a contract
 * upgrade that adds new event types.
 */
export function decodeEvent(event: SorobanRpc.Api.EventResponse): DecodedEvent | null {
  const topics = event.topic.map(scValToNative);
  const name = String(topics[0]);
  const decoder = DECODERS[name];
  if (!decoder) return null;

  const data = scValToNative(event.value) as Record<string, unknown>;
  return { table: name, columns: decoder(topics, data) };
}
