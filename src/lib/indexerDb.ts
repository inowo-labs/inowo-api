import config from "./config";
import { openIndexerDb, type IndexerDb } from "../indexer/store";

let db: IndexerDb | undefined;

/**
 * The indexer (a separate process, `npm run indexer`) writes to this same
 * SQLite file; WAL mode lets the API read from it concurrently. Opened
 * lazily and reused across requests rather than per-call.
 */
export function getIndexerDb(): IndexerDb {
  if (!db) db = openIndexerDb(config.indexerDbPath);
  return db;
}
