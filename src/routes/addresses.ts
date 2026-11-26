import { Router, Request, Response } from "express";
import { Address, StrKey, xdr } from "@stellar/stellar-sdk";
import { getIndexerDb } from "../lib/indexerDb";
import { parsePagination } from "../lib/pagination";
import { simulateContractCall } from "../lib/stellar";
import { serializeOrganizerStats } from "../lib/serialize";
import type { ActivityRow, RefundActivityRow } from "../indexer/store";

const router = Router();

// Mirrors MAX_ORGANIZER_EVENTS_PAGE in inowo-Contract/src/lib.rs.
const MAX_ORGANIZER_EVENTS_PAGE = 50;

function validAddress(req: Request, res: Response): string | null {
  const address = req.params.address as string;
  if (!StrKey.isValidEd25519PublicKey(address)) {
    res.status(400).json({ error: "address must be a valid Stellar public key" });
    return null;
  }
  return address;
}

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
  const address = validAddress(req, res);
  if (!address) return;

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

// On-chain track record straight from the contract's OrganizerStats, not the
// indexer's reconstruction — correct even if the indexer db was never seeded
// or an event predates it. All zeros for an address that has never organized.
router.get("/:address/organizer-stats", async (req: Request, res: Response) => {
  const address = validAddress(req, res);
  if (!address) return;

  const stats = await simulateContractCall(
    "get_organizer_stats",
    new Address(address).toScVal()
  );
  res.json(serializeOrganizerStats(stats));
});

router.get("/:address/organizer-events", async (req: Request, res: Response) => {
  const address = validAddress(req, res);
  if (!address) return;

  const page = parsePagination(req.query, { maxLimit: MAX_ORGANIZER_EVENTS_PAGE });
  if (!page.ok) {
    res.status(400).json({ error: page.error });
    return;
  }

  const addressScVal = new Address(address).toScVal();
  const [ids, stats] = await Promise.all([
    simulateContractCall(
      "get_organizer_events",
      addressScVal,
      xdr.ScVal.scvU32(page.offset),
      xdr.ScVal.scvU32(page.limit)
    ),
    simulateContractCall("get_organizer_stats", addressScVal),
  ]);

  res.json({
    data: ids as number[],
    total: serializeOrganizerStats(stats).events_created,
    limit: page.limit,
    offset: page.offset,
  });
});

export default router;
