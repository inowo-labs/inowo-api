import { nativeToScVal, xdr, type rpc as SorobanRpc } from "@stellar/stellar-sdk";

const ORGANIZER = "GASCJ5XMP6A5DZYTBX6NFG2RBGIR2GGZRRYUCAUZ5LRV2ENGOKQLLEJA";
const SPONSOR = "GCMTWHCDWDAYUE4TUTWJ5RXU4TDALPEE6CFDWUIY76KYDF3IOTWIDJPQ";
const BUYER = "GD7LQAA5YYVYVOUC3267JG3UG75NND5RYVYMWTZ3L5K2CDMKOW37MKNZ";
const RECIPIENT = "GC7ICQFWX6W2J3GDV7YDUJ7A5UHFTKMDT2ACEXZKG4Q34A5PIUR4QWVK";

export { ORGANIZER, SPONSOR, BUYER, RECIPIENT };

const symbol = (s: string) => nativeToScVal(s, { type: "symbol" });
const address = (a: string) => nativeToScVal(a, { type: "address" });
const u32 = (n: number) => nativeToScVal(n, { type: "u32" });
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const str = (s: string) => nativeToScVal(s, { type: "string" });

interface RawEventFields {
  /** `#[contractevent]` name, e.g. "event_created". */
  name: string;
  /** Topic field ScVals, in declared order, *after* the name symbol. */
  topicFields: xdr.ScVal[];
  /** Data map fields, by name — matches how scValToNative decodes a Map. */
  data: Record<string, unknown>;
}

let nextId = 1;

/**
 * Builds an `EventResponse` shaped exactly like what `#[contractevent]`
 * produces on-chain: topics = [Symbol(name), ...#[topic] fields], value =
 * Map of the remaining fields. The envelope fields (ledger, txHash, ...)
 * are filled with distinct-but-arbitrary values unless overridden.
 */
export function makeEvent(
  fields: RawEventFields,
  overrides: Partial<SorobanRpc.Api.EventResponse> = {}
): SorobanRpc.Api.EventResponse {
  const id = overrides.id ?? `event-fixture-${nextId++}`;
  return {
    id,
    type: "contract",
    ledger: overrides.ledger ?? 1000,
    ledgerClosedAt: overrides.ledgerClosedAt ?? "2026-01-01T00:00:00Z",
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: overrides.txHash ?? `tx-${id}`,
    contractId: overrides.contractId as never,
    topic: [symbol(fields.name), ...fields.topicFields],
    value: nativeToScVal(fields.data),
  } as SorobanRpc.Api.EventResponse;
}

export const fixtures = {
  eventCreated: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent(
      {
        name: "event_created",
        topicFields: [u32(0), address(ORGANIZER)],
        data: { funding_goal: 500_000_000n, date_unix: 1_800_000_000n },
      },
      overrides
    ),
  sponsored: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent(
      {
        name: "sponsored",
        topicFields: [u32(0), address(SPONSOR)],
        data: { amount: 40_000_000n },
      },
      overrides
    ),
  ticketPurchased: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent(
      {
        name: "ticket_purchased",
        topicFields: [u32(0), address(BUYER)],
        data: { ticket_id: 3, tier_index: 1, price: 50_000_000n },
      },
      overrides
    ),
  ticketTransferred: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent(
      {
        name: "ticket_transferred",
        topicFields: [u32(0), address(BUYER)],
        data: { to: RECIPIENT, ticket_id: 3 },
      },
      overrides
    ),
  ticketRedeemed: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent({ name: "ticket_redeemed", topicFields: [u32(0)], data: { ticket_id: 3 } }, overrides),
  eventEnded: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent({ name: "event_ended", topicFields: [u32(0)], data: { balance: 360_000_000n } }, overrides),
  eventCancelled: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent({ name: "event_cancelled", topicFields: [u32(0)], data: { balance: 30_000_000n } }, overrides),
  ticketRefunded: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent(
      {
        name: "ticket_refunded",
        topicFields: [u32(0), address(BUYER)],
        data: { ticket_id: 3, amount: 50_000_000n },
      },
      overrides
    ),
  sponsorshipRefunded: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent(
      {
        name: "sponsorship_refunded",
        topicFields: [u32(0), address(SPONSOR)],
        data: { amount: 40_000_000n },
      },
      overrides
    ),
  fundsReleased: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent(
      {
        name: "funds_released",
        topicFields: [u32(0), address(RECIPIENT)],
        data: { payout_id: 0, amount: 25_000_000n, memo: "Venue hire" },
      },
      overrides
    ),
  unrecognised: (overrides?: Partial<SorobanRpc.Api.EventResponse>) =>
    makeEvent({ name: "some_future_event", topicFields: [u32(0)], data: { x: 1 } }, overrides),
};

export { str };
