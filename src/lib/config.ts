import { Networks } from "@stellar/stellar-sdk";

const config = {
  stellarRpcUrl: process.env.STELLAR_RPC_URL!,
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET,
  contractId: process.env.INOWO_CONTRACT_ID!,
  usdcContractId: process.env.USDC_CONTRACT_ID,
  port: Number(process.env.PORT ?? 3001),
  // How long identical contract reads are served from memory; 0 disables caching.
  rpcCacheTtlMs: Number(process.env.RPC_CACHE_TTL_MS ?? 10_000),
  // Indexer: where the SQLite database lives, how often it polls for new
  // events, and which ledger to start from if it has never run before. Unset,
  // it starts at the chain tip (no backfill) — see README > Indexer.
  indexerDbPath: process.env.INDEXER_DB_PATH ?? "./data/indexer.sqlite",
  indexerPollIntervalMs: Number(process.env.INDEXER_POLL_INTERVAL_MS ?? 10_000),
  indexerStartLedger: process.env.INDEXER_START_LEDGER
    ? Number(process.env.INDEXER_START_LEDGER)
    : undefined,
} as const;

export default config;
