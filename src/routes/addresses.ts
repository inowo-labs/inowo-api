import { Router, Request, Response } from "express";
import { StrKey } from "@stellar/stellar-sdk";
import { getIndexerDb } from "../lib/indexerDb";
import { parsePagination } from "../lib/pagination";
import type { ActivityRow, RefundActivityRow } from "../indexer/store";

const router = Router();

function activity(row: ActivityRow) {
  return {
    event_id: row.eventId,
    ...(row.amount !== null ? { amount: row.amount } : {}),
    ...(row.ticketId !== null ? { ticket_id: row.ticketId } : {}),
    tx_hash: row.txHash,
  };
}

function refundActivity(row: RefundActivityRow) {
  return { type: row.type, ...activity(row) };
}

router.get("/:address/activity", async (req: Request, res: Response) => {
  const address = req.params.address as string;
  if (!StrKey.isValidEd25519PublicKey(address)) {
    res.status(400).json({ error: "address must be a valid Stellar public key" });
    return;
  }

  const page = parsePagination(req.query);
  if (!page.ok) {
    res.status(400).json({ error: page.error });
    return;
  }

  const db = getIndexerDb();
  const { limit, offset } = page;
  res.json({
    organized: db.listOrganized(address, limit, offset).map(activity),
    sponsorships: db.listSponsorshipsByAddress(address, limit, offset).map(activity),
    tickets: db.listTicketsByAddress(address, limit, offset).map(activity),
    payouts_received: db.listPayoutsReceived(address, limit, offset).map(activity),
    refunds: db.listRefundsByAddress(address, limit, offset).map(refundActivity),
  });
});

export default router;
