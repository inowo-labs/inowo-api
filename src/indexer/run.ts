import dotenv from "dotenv";
dotenv.config();

import { rpcServer } from "../lib/stellar";
import config from "../lib/config";
import { openIndexerDb } from "./store";
import { pollOnce } from "./poll";

const REQUIRED_ENV = ["STELLAR_RPC_URL", "INOWO_CONTRACT_ID"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const db = openIndexerDb(config.indexerDbPath);
console.log(`Inowo indexer writing to ${config.indexerDbPath}`);

let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function tick() {
  try {
    const { pages, inserted } = await pollOnce({
      rpcServer,
      contractId: config.contractId,
      db,
      defaultStartLedger: config.indexerStartLedger,
      log: (m) => console.log(m),
    });
    if (pages > 0) console.log(`Indexed ${inserted} new event(s) across ${pages} page(s)`);
  } catch (err) {
    console.error("Poll cycle failed:", err instanceof Error ? err.message : err);
  }
  if (!stopping) timer = setTimeout(tick, config.indexerPollIntervalMs);
}

function shutdown() {
  stopping = true;
  if (timer) clearTimeout(timer);
  db.close();
  console.log("Indexer stopped.");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void tick();
