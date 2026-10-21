/**
 * One table per contract event type, plus a single-row `cursor` table that
 * remembers how far the indexer has got. Every event table's primary key is
 * the RPC event's own globally-unique `id`, so re-processing the same ledger
 * range (e.g. after a crash, before the cursor was advanced) is a no-op:
 * `INSERT OR IGNORE` silently skips rows that are already there.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cursor (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT NOT NULL,
  last_ledger INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_created (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  ledger_closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  organizer TEXT NOT NULL,
  funding_goal TEXT NOT NULL,
  date_unix INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS event_created_event_id ON event_created(event_id);

CREATE TABLE IF NOT EXISTS sponsored (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  ledger_closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  sponsor TEXT NOT NULL,
  amount TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sponsored_event_id ON sponsored(event_id);
CREATE INDEX IF NOT EXISTS sponsored_sponsor ON sponsored(sponsor);

CREATE TABLE IF NOT EXISTS ticket_purchased (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  ledger_closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  buyer TEXT NOT NULL,
  ticket_id INTEGER NOT NULL,
  tier_index INTEGER NOT NULL,
  price TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ticket_purchased_event_id ON ticket_purchased(event_id);
CREATE INDEX IF NOT EXISTS ticket_purchased_buyer ON ticket_purchased(buyer);

CREATE TABLE IF NOT EXISTS ticket_transferred (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  ledger_closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  ticket_id INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ticket_transferred_event_id ON ticket_transferred(event_id);

CREATE TABLE IF NOT EXISTS ticket_redeemed (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  ledger_closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  ticket_id INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ticket_redeemed_event_id ON ticket_redeemed(event_id);

CREATE TABLE IF NOT EXISTS event_ended (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  ledger_closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  balance TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS event_ended_event_id ON event_ended(event_id);

CREATE TABLE IF NOT EXISTS event_cancelled (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  ledger_closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  balance TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS event_cancelled_event_id ON event_cancelled(event_id);

CREATE TABLE IF NOT EXISTS ticket_refunded (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  ledger_closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  owner TEXT NOT NULL,
  ticket_id INTEGER NOT NULL,
  amount TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ticket_refunded_event_id ON ticket_refunded(event_id);
CREATE INDEX IF NOT EXISTS ticket_refunded_owner ON ticket_refunded(owner);

CREATE TABLE IF NOT EXISTS sponsorship_refunded (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  ledger_closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  sponsor TEXT NOT NULL,
  amount TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sponsorship_refunded_event_id ON sponsorship_refunded(event_id);
CREATE INDEX IF NOT EXISTS sponsorship_refunded_sponsor ON sponsorship_refunded(sponsor);

CREATE TABLE IF NOT EXISTS funds_released (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  ledger_closed_at TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  payout_id INTEGER NOT NULL,
  amount TEXT NOT NULL,
  memo TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS funds_released_event_id ON funds_released(event_id);
CREATE INDEX IF NOT EXISTS funds_released_recipient ON funds_released(recipient);
`;
