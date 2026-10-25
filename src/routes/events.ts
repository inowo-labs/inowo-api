import { Router, Request, Response } from "express";
import { xdr } from "@stellar/stellar-sdk";
import rateLimit from "express-rate-limit";
import { simulateContractCall } from "../lib/stellar";
import { getIndexerDb } from "../lib/indexerDb";
import { idRange, parsePagination } from "../lib/pagination";
import { serializeBigInt, serializeEvent, serializePayout } from "../lib/serialize";
import { isU32, validateEventId } from "../middleware/validateEventId";

// Express 5 forwards rejected promises from async handlers to errorHandler,
// which maps contract error codes to HTTP statuses.
const router = Router();

// Stricter limiter for GET /api/events — fans out N RPC simulations
const eventsListLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const u32 = (value: string) => xdr.ScVal.scvU32(Number(value));
const u32Num = (value: number) => xdr.ScVal.scvU32(value);

// Mirrors MAX_SPONSORSHIP_PAGE in inowo-Contract/src/lib.rs — get_sponsorships
// never returns more than this many per call, however large `limit` is.
const MAX_SPONSORSHIP_PAGE = 50;

router.get("/count", async (_req: Request, res: Response) => {
  const count = await simulateContractCall("event_count");
  res.json({ count: Number(count) });
});

router.get("/", eventsListLimiter, async (req: Request, res: Response) => {
  const page = parsePagination(req.query);
  if (!page.ok) {
    res.status(400).json({ error: page.error });
    return;
  }

  const count = Number(await simulateContractCall("event_count"));
  const { sort } = req.query;
  const sorted = sort === "date" || sort === "goal";

  // Event ids are sequential (0..count), so a plain page can fetch just its own
  // events. Sorting needs every event, so it fetches all and slices afterwards.
  const ids =
    page.paginated && !sorted ? idRange(count, page.offset, page.limit) : idRange(count);
  const events = await Promise.all(
    ids.map(async (id) => ({
      id,
      ...serializeEvent(await simulateContractCall("get_event", xdr.ScVal.scvU32(id))),
    }))
  );

  if (sort === "date") {
    events.sort((a, b) => a.date_unix - b.date_unix);
  } else if (sort === "goal") {
    events.sort((a, b) => Number(b.funding_goal) - Number(a.funding_goal));
  }

  if (!page.paginated) {
    res.json(events);
    return;
  }

  const data = sorted ? events.slice(page.offset, page.offset + page.limit) : events;
  res.json({ data, total: count, limit: page.limit, offset: page.offset });
});


router.get("/:id", validateEventId, async (req: Request, res: Response) => {
  const event = await simulateContractCall("get_event", u32(req.params.id as string));
  res.json({ id: Number(req.params.id), ...serializeEvent(event) });
});

router.get("/:id/status", validateEventId, async (req: Request, res: Response) => {
  const event = await simulateContractCall("get_event", u32(req.params.id as string));
  res.json({ event_id: Number(req.params.id), status: serializeEvent(event).status });
});

router.get("/:id/organizer", validateEventId, async (req: Request, res: Response) => {
  const organizer = await simulateContractCall("get_organizer", u32(req.params.id as string));
  res.json({ event_id: Number(req.params.id), organizer: String(organizer) });
});

router.get("/:id/balance", validateEventId, async (req: Request, res: Response) => {
  const id = u32(req.params.id as string);
  const [rawEvent, released] = await Promise.all([
    simulateContractCall("get_event", id),
    simulateContractCall("total_released", id),
  ]);
  const event = serializeEvent(rawEvent);
  res.json({
    event_id: Number(req.params.id),
    balance: event.balance,
    funding_goal: event.funding_goal,
    total_released: String(released),
  });
});

router.get("/:id/payouts", validateEventId, async (req: Request, res: Response) => {
  const id = u32(req.params.id as string);
  const count = Number(await simulateContractCall("payout_count", id));
  const payouts = await Promise.all(
    Array.from({ length: count }, async (_, payoutId) =>
      serializePayout(
        payoutId,
        await simulateContractCall("get_payout", id, xdr.ScVal.scvU32(payoutId))
      )
    )
  );
  res.json(payouts);
});

router.get("/:id/refunds", validateEventId, async (req: Request, res: Response) => {
  const id = u32(req.params.id as string);
  // Refunds aren't on-chain queries — they only exist as indexed events — so
  // the existence check that would normally come from the contract call has
  // to be done explicitly here.
  await simulateContractCall("get_event", id);

  const rows = getIndexerDb().listRefunds(Number(req.params.id));
  const totalRefunded = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);

  res.json({
    data: rows.map((row) => ({
      type: row.type,
      address: row.address,
      amount: row.amount,
      ...(row.type === "ticket" ? { ticket_id: row.ticketId } : {}),
      ledger: row.ledger,
      timestamp: row.ledgerClosedAt,
      tx_hash: row.txHash,
    })),
    total_refunded: totalRefunded.toString(),
  });
});

router.get("/:id/tiers", validateEventId, async (req: Request, res: Response) => {
  const tiers = await simulateContractCall("get_tiers", u32(req.params.id as string));
  res.json(serializeBigInt(tiers));
});

router.get("/:id/sponsorships", validateEventId, async (req: Request, res: Response) => {
  // The contract's get_sponsorships now requires (start, limit) — it moved
  // from one growing list to one entry per contribution to stop a flood of
  // tiny sponsorships from blocking everyone else's (inowo-Contract#36).
  const page = parsePagination(req.query, {
    defaultLimit: MAX_SPONSORSHIP_PAGE,
    maxLimit: MAX_SPONSORSHIP_PAGE,
  });
  if (!page.ok) {
    res.status(400).json({ error: page.error });
    return;
  }

  const id = u32(req.params.id as string);
  const sponsorships = await simulateContractCall(
    "get_sponsorships",
    id,
    u32Num(page.offset),
    u32Num(page.limit)
  );

  if (!page.paginated) {
    // Matches today's response shape exactly, but only up to
    // MAX_SPONSORSHIP_PAGE sponsorships — an event with more than that needs
    // ?limit=&offset= to see the rest. True for every seeded event today.
    res.json(serializeBigInt(sponsorships));
    return;
  }

  const total = Number(await simulateContractCall("sponsor_count", id));
  res.json({
    data: serializeBigInt(sponsorships),
    total,
    limit: page.limit,
    offset: page.offset,
  });
});

router.get("/:id/ticket-count", validateEventId, async (req: Request, res: Response) => {
  const count = await simulateContractCall("ticket_count", u32(req.params.id as string));
  res.json({ event_id: Number(req.params.id), ticket_count: Number(count) });
});

router.get(
  "/:id/tickets/:ticketId",
  validateEventId,
  async (req: Request, res: Response) => {
    const ticketId = req.params.ticketId as string;
    if (!isU32(ticketId)) {
      res.status(400).json({ error: "ticket id must be a non-negative integer" });
      return;
    }
    const ticket = await simulateContractCall(
      "get_ticket",
      u32(req.params.id as string),
      u32(ticketId)
    );
    res.json(serializeBigInt(ticket));
  }
);

export default router;
