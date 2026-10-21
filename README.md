# Inowo API

Read API for [Inowo](https://github.com/inowo-labs/inowo-Contract) — sponsorship escrow and accountable event budgets on Stellar.

The smart contract is the source of truth for all funds and records. This API reads contract state over Soroban RPC and serves it as JSON, so clients don't need to talk to the chain directly. It is read-only: all writes are signed by the user's wallet and sent straight to the contract.

## Getting started

### Prerequisites

- Node.js 22.12+
- npm

### Install dependencies

```bash
npm install
```

### Set up environment

```bash
cp .env.example .env
# Fill in your values
```

### Run in development mode

```bash
npm run dev
# API runs at http://localhost:3001
```

### Test

```bash
npm test           # unit + route tests (RPC is mocked, no network needed)
npm run typecheck  # type-checks src and tests
```

### Build

```bash
npm run build
```

## Caching

Contract reads are cached in memory for `RPC_CACHE_TTL_MS` (default 10 seconds) so repeated requests don't re-run the same RPC simulation. Concurrent identical requests share one in-flight call. "Not found" answers are cached too; RPC failures never are. Set `RPC_CACHE_TTL_MS=0` to disable. `/health` reports hits, misses, and size.

Data can therefore be up to the TTL behind the chain — writes still go straight to the contract, so this only delays when a new sponsorship or payout appears in API responses.

## Indexer

A separate worker records every contract event into a local SQLite database, so history that the contract itself can't answer efficiently — "every payout", "everything this address has done" — is a plain SQL query away instead of an unbounded chain scan. It isn't wired into the HTTP API yet; this is the foundation other endpoints (refund history, address activity) build on.

```bash
npm run indexer        # dev, with auto-restart
npm run start:indexer  # after npm run build
```

- One table per contract event (`event_created`, `sponsored`, `ticket_purchased`, `ticket_transferred`, `ticket_redeemed`, `event_ended`, `event_cancelled`, `ticket_refunded`, `sponsorship_refunded`, `funds_released`), each with the event's own fields plus `ledger`, `ledger_closed_at`, and `tx_hash`.
- **Idempotent.** Every row's primary key is the RPC event's own unique ID, so reprocessing the same ledger range — after a crash, or because the RPC occasionally repeats the event at a page boundary — never creates a duplicate.
- **Resumable.** The cursor Soroban RPC returns is stored after every page and picked up again on restart, so nothing is reprocessed or skipped across a restart.
- **Retention-aware.** Soroban RPC only retains recent events (on public testnet, roughly the last week). With no stored cursor and no `INDEXER_START_LEDGER` set, the indexer starts at the current chain tip rather than request ledgers the RPC has already discarded. To backfill further back, set `INDEXER_START_LEDGER` to a ledger still within the RPC's retention window — the indexer logs the RPC's reported floor (`oldestLedger`) if a request falls outside it.
- Unrecognised event types (a future contract upgrade, or a diagnostic event that slipped past the filter) are skipped and logged, not treated as a crash.

Configuration (`.env.example`): `INDEXER_DB_PATH`, `INDEXER_POLL_INTERVAL_MS`, `INDEXER_START_LEDGER`.

## Stack

- **Runtime:** Node.js
- **Framework:** Express
- **Language:** TypeScript
- **Chain access:** `@stellar/stellar-sdk` (Soroban RPC simulation and event polling)
- **Indexer storage:** `better-sqlite3`

## API Reference

The full machine-readable reference is an [OpenAPI 3.1](https://www.openapis.org/) spec at [`openapi.yaml`](./openapi.yaml), served as JSON at `GET /openapi.json` and as interactive docs at `GET /docs` (`npm run dev` or `npm start`, then open `http://localhost:3001/docs`). A test keeps it in sync with the actual routes — the build fails if either drifts from the other.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health, uptime, contract info, RPC cache statistics |
| `GET` | `/api/events` | List events — all of them, or one page with `?limit=` / `?offset=` (see [Pagination](#pagination)); supports `?sort=date` or `?sort=goal` |
| `GET` | `/api/events/count` | Total number of events |
| `GET` | `/api/events/:id` | Single event by ID |
| `GET` | `/api/events/:id/status` | Event status only |
| `GET` | `/api/events/:id/organizer` | Organizer address |
| `GET` | `/api/events/:id/balance` | Escrow balance, funding goal, and total released |
| `GET` | `/api/events/:id/tiers` | All ticket tiers |
| `GET` | `/api/events/:id/sponsorships` | Sponsorships — all of them (up to 50), or one page with `?limit=` / `?offset=` |
| `GET` | `/api/events/:id/payouts` | All payouts released from escrow, with memos |
| `GET` | `/api/events/:id/ticket-count` | Total tickets sold |
| `GET` | `/api/events/:id/tickets/:ticketId` | Single ticket |

All write operations (buy ticket, sponsor, create event) happen directly on-chain through the contract — not through this API.

### Pagination

`GET /api/events` returns a plain array of every event by default. Send `limit`, `offset`, or both to get a page instead:

```
GET /api/events?limit=5&offset=10
```

```json
{ "data": [ /* up to 5 events */ ], "total": 42, "limit": 5, "offset": 10 }
```

- `limit` is 1–100 (default 20); `offset` is 0 or more (default 0). Anything else returns `400`.
- Events are ordered by id. A page fetches only its own events from the contract, so a page of 5 costs 5 RPC reads, not one per event on the contract.
- `?sort=` needs every event to sort, so a sorted page still reads them all and slices afterwards. Indexing contract events into a database is the long-term fix for that.

`GET /api/events/:id/sponsorships` works the same way, but its `limit` is capped at **50** to match the contract's own page size (`MAX_SPONSORSHIP_PAGE`) — the contract's `get_sponsorships` never returns more than 50 per call, however large a `limit` the API is asked for. Without `limit`/`offset`, the bare array is therefore only complete for events with 50 sponsorships or fewer (every seeded event today); a busier event needs explicit paging to see the rest.
- An offset past the end returns an empty `data` array, not an error.

### Error responses

Errors are always JSON: `{ "error": "<message>" }`, plus `code` when the contract returned a [contract error code](https://github.com/inowo-labs/inowo-Contract#errors).

| Status | When |
|--------|------|
| `400` | Invalid path parameter, or the contract rejected the call (body includes `code`) |
| `404` | Event or ticket does not exist (contract codes `3` / `4`), or unknown route |
| `429` | Rate limit exceeded |
| `500` | Unexpected error — details are logged server-side, never returned |
| `502` | The Soroban RPC endpoint could not be reached |
| `504` | The Soroban RPC call timed out |

## Open for contributors

| Feature | Difficulty | Issue |
|---------|------------|-------|
| Refund history endpoint for cancelled events, built on the indexer | Medium | [#43](https://github.com/inowo-labs/inowo-api/issues/43) |
| Activity endpoint for a Stellar address, built on the indexer | Medium | [#47](https://github.com/inowo-labs/inowo-api/issues/47) |
| Filter `GET /api/events` by status | Easy | [#23](https://github.com/inowo-labs/inowo-api/issues/23) |
| Remove outdated `@types` packages | Easy | [#46](https://github.com/inowo-labs/inowo-api/issues/46) |

See the [Issues](https://github.com/inowo-labs/inowo-api/issues) tab for scoped tasks.

## Related repos

- [inowo-Contract](https://github.com/inowo-labs/inowo-Contract) — Soroban smart contract (Rust)
- [inowo-app](https://github.com/inowo-labs/inowo-app) — web frontend (Next.js)

## License

[MIT](./LICENSE)
