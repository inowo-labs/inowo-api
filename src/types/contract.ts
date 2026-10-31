// TypeScript mirror of the Soroban contract types.
// Amounts are strings because i128 exceeds JavaScript's safe integer range.

export type EventStatus = "Active" | "Ended" | "Cancelled";

export interface Event {
  organizer: string;
  name: string;
  description: string;
  venue: string;
  date_unix: number;
  funding_goal: string;
  balance: string;
  status: EventStatus;
}

export interface TicketTier {
  name: string;
  price: string;
  supply_cap: number;
  tickets_sold: number;
}

export interface Ticket {
  event_id: number;
  tier_index: number;
  owner: string;
  redeemed: boolean;
  price_paid: string;
  refunded: boolean;
}

export interface Sponsorship {
  sponsor: string;
  amount: string;
}

export interface Payout {
  id: number;
  recipient: string;
  amount: string;
  memo: string;
  /** Unix timestamp (seconds) of the release. */
  timestamp: number;
  /** Hex-encoded SHA-256 of a receipt document; null until attach_receipt is called. */
  receipt_hash: string | null;
  /** Where to find the receipt document, e.g. an IPFS CID; null if never set. */
  receipt_uri: string | null;
}
