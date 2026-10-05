# Inowo API

Off-chain API for Inowo — handles indexing, notifications, and media for the Stellar event platform.

The smart contract is the source of truth for all on-chain state. This API layers on top of it to provide faster queries, event-driven notifications, and services that can't run on-chain.

## Getting started

### Prerequisites

- Node.js 20+
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

### Build

```bash
npm run build
```

## Stack

- **Runtime:** Node.js
- **Framework:** Express
- **Language:** TypeScript

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

## Open for contributors

- Integrate `@stellar/stellar-sdk` to query the contract
- Index events into a local database for fast listing
- Email / push notifications for ticket purchases and event updates
- Image upload endpoint for event media (S3 or similar)

See the [Issues](https://github.com/inowo-labs/inowo-api/issues) tab for scoped tasks.

## Related repos

- [Inowo contract](https://github.com/inowo-labs/inowo-Contract) — Soroban smart contract (Rust)
- [Inowo App](https://github.com/inowo-labs/inowo-app) — frontend (Next.js)
