import { beforeEach, describe, expect, it, vi } from "vitest";
import type { rpc as SorobanRpc } from "@stellar/stellar-sdk";
import { pollOnce } from "../../src/indexer/poll";
import { openIndexerDb, type IndexerDb } from "../../src/indexer/store";
import { fixtures } from "./fixtures";

const CONTRACT_ID = "CCWFDV2MIDV7QOEUJNZDFRRJY75O7S65JPVJ2S2WNARJ4INEMDTCNOPV";

function fakeRpcServer(pages: SorobanRpc.Api.EventResponse[][]) {
  let call = 0;
  const getEvents = vi.fn(async (req: { cursor?: string }) => {
    const events = pages[call] ?? [];
    call++;
    const cursor = req.cursor ? `${req.cursor}+${call}` : `cursor-${call}`;
    return { events, cursor, latestLedger: 2000, oldestLedger: 0 } as SorobanRpc.Api.GetEventsResponse;
  });
  const getLatestLedger = vi.fn(async () => ({ sequence: 1500 }) as SorobanRpc.Api.GetLatestLedgerResponse);
  return { getEvents, getLatestLedger } as unknown as SorobanRpc.Server;
}

let db: IndexerDb;

beforeEach(() => {
  db = openIndexerDb(":memory:");
});

describe("pollOnce", () => {
  it("uses the configured start ledger on a first run", async () => {
    const rpcServer = fakeRpcServer([[fixtures.eventCreated({ ledger: 1200 })]]);

    await pollOnce({ rpcServer, contractId: CONTRACT_ID, db, defaultStartLedger: 1200 });

    expect(rpcServer.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 1200, filters: [{ type: "contract", contractIds: [CONTRACT_ID] }] })
    );
    expect(rpcServer.getLatestLedger).not.toHaveBeenCalled();
  });

  it("starts at the chain tip when no start ledger is configured, to avoid backfilling", async () => {
    const rpcServer = fakeRpcServer([[]]);

    await pollOnce({ rpcServer, contractId: CONTRACT_ID, db });

    expect(rpcServer.getLatestLedger).toHaveBeenCalled();
    expect(rpcServer.getEvents).toHaveBeenCalledWith(expect.objectContaining({ startLedger: 1500 }));
  });

  it("resumes from the stored cursor on a later run, not the start ledger", async () => {
    db.applyPage([], "resume-here", 1300);
    const rpcServer = fakeRpcServer([[]]);

    await pollOnce({ rpcServer, contractId: CONTRACT_ID, db, defaultStartLedger: 1200 });

    expect(rpcServer.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "resume-here" })
    );
    expect(rpcServer.getLatestLedger).not.toHaveBeenCalled();
  });

  it("stores every event from one page and advances the cursor", async () => {
    const rpcServer = fakeRpcServer([[fixtures.eventCreated(), fixtures.sponsored()]]);

    const result = await pollOnce({ rpcServer, contractId: CONTRACT_ID, db, defaultStartLedger: 1 });

    expect(result).toEqual({ pages: 1, inserted: 2 });
    expect(db.getCursor()?.cursor).toBe("cursor-1");
  });

  it("follows the cursor across multiple full pages in one cycle", async () => {
    // pageLimit: 2, so a 2-event response means "there might be more" and a
    // shorter one means "caught up" — exercises real multi-page pagination.
    const fullPage = [fixtures.sponsored({ id: "page1-0" }), fixtures.sponsored({ id: "page1-1" })];
    const lastPage = [fixtures.ticketPurchased({ id: "page2-0" })];
    const rpcServer = fakeRpcServer([fullPage, lastPage]);

    const result = await pollOnce({
      rpcServer,
      contractId: CONTRACT_ID,
      db,
      defaultStartLedger: 1,
      pageLimit: 2,
    });

    expect(result).toEqual({ pages: 2, inserted: 3 });
    expect(rpcServer.getEvents).toHaveBeenCalledTimes(2);
    // Each page call used the cursor the previous page returned.
    expect(rpcServer.getEvents).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "cursor-1" }));
  });

  it("stops requesting pages once a response is shorter than the page limit", async () => {
    const rpcServer = fakeRpcServer([[fixtures.sponsored()]]); // 1 event, pageLimit 2 -> "caught up"

    const result = await pollOnce({
      rpcServer,
      contractId: CONTRACT_ID,
      db,
      defaultStartLedger: 1,
      pageLimit: 2,
    });

    expect(result.pages).toBe(1);
    expect(rpcServer.getEvents).toHaveBeenCalledTimes(1);
  });

  it("does nothing and leaves the cursor untouched when there are no new events", async () => {
    db.applyPage([fixtures.eventCreated()], "already-here", 999);
    const rpcServer = fakeRpcServer([[]]);

    const result = await pollOnce({ rpcServer, contractId: CONTRACT_ID, db, defaultStartLedger: 1 });

    expect(result).toEqual({ pages: 0, inserted: 0 });
    expect(db.getCursor()).toEqual({ cursor: "already-here", lastLedger: 999 });
  });

  it("is safe to call again immediately after a successful cycle (idempotent in practice)", async () => {
    const rpcServer = fakeRpcServer([[fixtures.eventCreated()], []]);

    const first = await pollOnce({ rpcServer, contractId: CONTRACT_ID, db, defaultStartLedger: 1 });
    const second = await pollOnce({ rpcServer, contractId: CONTRACT_ID, db, defaultStartLedger: 1 });

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM event_created").get()).toEqual({ n: 1 });
  });
});
