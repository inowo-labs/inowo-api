import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import type { rpc as SorobanRpc } from "@stellar/stellar-sdk";
import { SCHEMA_SQL } from "./schema";
import { decodeEvent, type DecodedEvent } from "./decode";

export type IndexerDb = ReturnType<typeof openIndexerDb>;

export interface RefundRow {
  type: "ticket" | "sponsorship";
  address: string;
  amount: string;
  ticketId: number | null;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export interface ActivityRow {
  eventId: number;
  amount: string | null;
  ticketId: number | null;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}

export interface RefundActivityRow extends ActivityRow {
  type: "ticket" | "sponsorship";
}

export function openIndexerDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);

  const insertStatements = new Map<string, Database.Statement>();
  function insertStatementFor(decoded: DecodedEvent): Database.Statement {
    let stmt = insertStatements.get(decoded.table);
    if (!stmt) {
      const columns = ["id", "ledger", "ledger_closed_at", "tx_hash", ...Object.keys(decoded.columns)];
      const placeholders = columns.map((c) => `@${c}`).join(", ");
      // INSERT OR IGNORE: re-processing an event already stored (e.g. after a
      // crash before the cursor advanced) is a no-op, not a duplicate row.
      stmt = db.prepare(
        `INSERT OR IGNORE INTO "${decoded.table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`
      );
      insertStatements.set(decoded.table, stmt);
    }
    return stmt;
  }

  const getCursorStmt = db.prepare("SELECT cursor, last_ledger FROM cursor WHERE id = 1");
  const setCursorStmt = db.prepare(
    `INSERT INTO cursor (id, cursor, last_ledger, updated_at) VALUES (1, @cursor, @last_ledger, @updated_at)
     ON CONFLICT(id) DO UPDATE SET cursor = @cursor, last_ledger = @last_ledger, updated_at = @updated_at`
  );

  // Refunds aren't stored as their own list on-chain; this is the union of
  // the two events a cancelled event's refunds are published as, newest first.
  const listRefundsStmt = db.prepare(`
    SELECT 'ticket' AS type, owner AS address, ticket_id AS ticketId, amount,
           ledger, ledger_closed_at AS ledgerClosedAt, tx_hash AS txHash, id
      FROM ticket_refunded WHERE event_id = @event_id
    UNION ALL
    SELECT 'sponsorship' AS type, sponsor AS address, NULL AS ticketId, amount,
           ledger, ledger_closed_at AS ledgerClosedAt, tx_hash AS txHash, id
      FROM sponsorship_refunded WHERE event_id = @event_id
    ORDER BY ledger DESC, id DESC
  `);

  // One prepared statement per activity section — each scoped by address on
  // a different column, so a single shared query shape doesn't fit.
  const listOrganizedStmt = db.prepare(`
    SELECT event_id AS eventId, NULL AS amount, NULL AS ticketId,
           ledger, ledger_closed_at AS ledgerClosedAt, tx_hash AS txHash
      FROM event_created WHERE organizer = @address
    ORDER BY ledger DESC, id DESC LIMIT @limit OFFSET @offset
  `);
  const listSponsorshipsStmt = db.prepare(`
    SELECT event_id AS eventId, amount, NULL AS ticketId,
           ledger, ledger_closed_at AS ledgerClosedAt, tx_hash AS txHash
      FROM sponsored WHERE sponsor = @address
    ORDER BY ledger DESC, id DESC LIMIT @limit OFFSET @offset
  `);
  const listTicketsStmt = db.prepare(`
    SELECT event_id AS eventId, price AS amount, ticket_id AS ticketId,
           ledger, ledger_closed_at AS ledgerClosedAt, tx_hash AS txHash
      FROM ticket_purchased WHERE buyer = @address
    ORDER BY ledger DESC, id DESC LIMIT @limit OFFSET @offset
  `);
  const listPayoutsReceivedStmt = db.prepare(`
    SELECT event_id AS eventId, amount, NULL AS ticketId,
           ledger, ledger_closed_at AS ledgerClosedAt, tx_hash AS txHash
      FROM funds_released WHERE recipient = @address
    ORDER BY ledger DESC, id DESC LIMIT @limit OFFSET @offset
  `);
  const listRefundsByAddressStmt = db.prepare(`
    SELECT 'ticket' AS type, event_id AS eventId, amount, ticket_id AS ticketId,
           ledger, ledger_closed_at AS ledgerClosedAt, tx_hash AS txHash, id
      FROM ticket_refunded WHERE owner = @address
    UNION ALL
    SELECT 'sponsorship' AS type, event_id AS eventId, amount, NULL AS ticketId,
           ledger, ledger_closed_at AS ledgerClosedAt, tx_hash AS txHash, id
      FROM sponsorship_refunded WHERE sponsor = @address
    ORDER BY ledger DESC, id DESC LIMIT @limit OFFSET @offset
  `);

  return {
    raw: db,

    getCursor(): { cursor: string; lastLedger: number } | null {
      const row = getCursorStmt.get() as { cursor: string; last_ledger: number } | undefined;
      return row ? { cursor: row.cursor, lastLedger: row.last_ledger } : null;
    },

    /**
     * Stores every recognised event in `events` and advances the cursor, all
     * in one transaction — a crash mid-page leaves the cursor exactly where
     * it was, so the next poll reprocesses that page from the start.
     * `INSERT OR IGNORE` makes that safe. Returns how many rows were newly
     * inserted (not re-seen) and how many events were of an unrecognised type.
     */
    applyPage(
      events: SorobanRpc.Api.EventResponse[],
      cursor: string,
      lastLedger: number
    ): { inserted: number; unknown: number } {
      let inserted = 0;
      let unknown = 0;

      const apply = db.transaction(() => {
        for (const event of events) {
          const decoded = decodeEvent(event);
          if (!decoded) {
            unknown++;
            continue;
          }
          const stmt = insertStatementFor(decoded);
          const result = stmt.run({
            id: event.id,
            ledger: event.ledger,
            ledger_closed_at: event.ledgerClosedAt,
            tx_hash: event.txHash,
            ...decoded.columns,
          });
          if (result.changes > 0) inserted++;
        }
        setCursorStmt.run({ cursor, last_ledger: lastLedger, updated_at: new Date().toISOString() });
      });
      apply();

      return { inserted, unknown };
    },

    listRefunds(eventId: number): RefundRow[] {
      return listRefundsStmt.all({ event_id: eventId }) as RefundRow[];
    },

    listOrganized(address: string, limit: number, offset: number): ActivityRow[] {
      return listOrganizedStmt.all({ address, limit, offset }) as ActivityRow[];
    },

    listSponsorshipsByAddress(address: string, limit: number, offset: number): ActivityRow[] {
      return listSponsorshipsStmt.all({ address, limit, offset }) as ActivityRow[];
    },

    listTicketsByAddress(address: string, limit: number, offset: number): ActivityRow[] {
      return listTicketsStmt.all({ address, limit, offset }) as ActivityRow[];
    },

    listPayoutsReceived(address: string, limit: number, offset: number): ActivityRow[] {
      return listPayoutsReceivedStmt.all({ address, limit, offset }) as ActivityRow[];
    },

    listRefundsByAddress(address: string, limit: number, offset: number): RefundActivityRow[] {
      return listRefundsByAddressStmt.all({ address, limit, offset }) as RefundActivityRow[];
    },

    close() {
      db.close();
    },
  };
}
