import type { rpc as SorobanRpc } from "@stellar/stellar-sdk";
import type { IndexerDb } from "./store";

export interface PollDeps {
  rpcServer: SorobanRpc.Server;
  contractId: string;
  db: IndexerDb;
  /** Ledger to start from if the indexer has never run before. */
  defaultStartLedger?: number;
  /** Events requested per `getEvents` call. Overridable in tests; production uses the default. */
  pageLimit?: number;
  log?: (message: string) => void;
}

const DEFAULT_PAGE_LIMIT = 1000;

/**
 * Runs event pages forward from the stored cursor (or `defaultStartLedger`,
 * or the chain tip if neither is set) until caught up to the latest ledger
 * the RPC had when this cycle began. Each page is applied — stored and the
 * cursor advanced — before the next page is requested, so a crash between
 * pages loses no progress.
 */
export async function pollOnce(deps: PollDeps): Promise<{ pages: number; inserted: number }> {
  const log = deps.log ?? (() => {});
  const pageLimit = deps.pageLimit ?? DEFAULT_PAGE_LIMIT;
  const filters = [{ type: "contract" as const, contractIds: [deps.contractId] }];

  const stored = deps.db.getCursor();
  let request: Parameters<SorobanRpc.Server["getEvents"]>[0];
  if (stored) {
    request = { filters, cursor: stored.cursor, limit: pageLimit };
  } else {
    let startLedger = deps.defaultStartLedger;
    if (startLedger === undefined) {
      startLedger = (await deps.rpcServer.getLatestLedger()).sequence;
    }
    log(`No stored cursor — starting from ledger ${startLedger}`);
    request = { filters, startLedger, limit: pageLimit };
  }

  let pages = 0;
  let totalInserted = 0;
  for (;;) {
    const response = await deps.rpcServer.getEvents(request);
    if (response.events.length === 0) break;

    const { inserted, unknown } = deps.db.applyPage(
      response.events,
      response.cursor,
      response.events[response.events.length - 1].ledger
    );
    pages++;
    totalInserted += inserted;
    if (unknown > 0) log(`Skipped ${unknown} event(s) of an unrecognised type`);
    log(`Page ${pages}: ${response.events.length} event(s), ${inserted} new, cursor -> ${response.cursor}`);

    if (response.events.length < pageLimit) break; // caught up
    request = { filters, cursor: response.cursor, limit: pageLimit };
  }

  return { pages, inserted: totalInserted };
}
