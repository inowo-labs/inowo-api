import { Router, Request, Response } from "express";
import { xdr } from "@stellar/stellar-sdk";
import rateLimit from "express-rate-limit";
import { simulateContractCall } from "../lib/stellar";
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

router.get("/count", async (_req: Request, res: Response) => {
  const count = await simulateContractCall("event_count");
  res.json({ count: Number(count) });
});

router.get("/", eventsListLimiter, async (req: Request, res: Response) => {
  const count = Number(await simulateContractCall("event_count"));
  const events = await Promise.all(
    Array.from({ length: count }, async (_, id) => ({
      id,
      ...serializeEvent(await simulateContractCall("get_event", xdr.ScVal.scvU32(id))),
    }))
  );

  const { sort } = req.query;
  if (sort === "date") {
    events.sort((a, b) => a.date_unix - b.date_unix);
  } else if (sort === "goal") {
    events.sort((a, b) => Number(b.funding_goal) - Number(a.funding_goal));
  }

  res.json(events);
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

router.get("/:id/tiers", validateEventId, async (req: Request, res: Response) => {
  const tiers = await simulateContractCall("get_tiers", u32(req.params.id as string));
  res.json(serializeBigInt(tiers));
});

router.get("/:id/sponsorships", validateEventId, async (req: Request, res: Response) => {
  const sponsorships = await simulateContractCall(
    "get_sponsorships",
    u32(req.params.id as string)
  );
  res.json(serializeBigInt(sponsorships));
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
