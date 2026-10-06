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

## Stack

- **Runtime:** Node.js
- **Framework:** Express
- **Language:** TypeScript
- **Chain access:** `@stellar/stellar-sdk` (Soroban RPC simulation)

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health, uptime, contract info |
| `GET` | `/api/events` | List all events (supports `?sort=date` or `?sort=goal`) |
| `GET` | `/api/events/count` | Total number of events |
| `GET` | `/api/events/:id` | Single event by ID |
| `GET` | `/api/events/:id/status` | Event status only |
| `GET` | `/api/events/:id/organizer` | Organizer address |
| `GET` | `/api/events/:id/balance` | Current balance vs funding goal |
| `GET` | `/api/events/:id/tiers` | All ticket tiers |
| `GET` | `/api/events/:id/sponsorships` | All sponsorships |
| `GET` | `/api/events/:id/ticket-count` | Total tickets sold |
| `GET` | `/api/events/:id/tickets/:ticketId` | Single ticket |

All write operations (buy ticket, sponsor, create event) happen directly on-chain through the contract — not through this API.

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

- Cache RPC responses to cut latency and load
- Pagination and status filtering for `GET /api/events`
- Index contract events into a database for fast listing and history
- Payout and refund history endpoints (once the contract supports them)
- Notifications for sponsorships, ticket purchases, and event updates

See the [Issues](https://github.com/inowo-labs/inowo-api/issues) tab for scoped tasks.

## Related repos

- [inowo-Contract](https://github.com/inowo-labs/inowo-Contract) — Soroban smart contract (Rust)
- [inowo-app](https://github.com/inowo-labs/inowo-app) — web frontend (Next.js)

## License

[MIT](./LICENSE)
