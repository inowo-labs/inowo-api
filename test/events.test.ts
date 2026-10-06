import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import {
  ContractError,
  ContractErrorCode,
  RpcTimeoutError,
  RpcUnavailableError,
} from "../src/lib/errors";
import { createApp } from "../src/app";

const { simulateContractCall } = vi.hoisted(() => ({ simulateContractCall: vi.fn() }));
vi.mock("../src/lib/stellar", () => ({
  simulateContractCall: (...args: unknown[]) => simulateContractCall(...args),
}));

// Shape returned by scValToNative for an Event: i128/u64 as bigint, unit enum as ["Active"].
function rawEvent(overrides: Record<string, unknown> = {}) {
  return {
    organizer: "GORGANIZER",
    name: "Stellar Meetup",
    description: "Monthly meetup",
    venue: "Lagos",
    date_unix: 1_760_000_000n,
    funding_goal: 500_000_000n,
    balance: 120_000_000n,
    status: ["Active"],
    ...overrides,
  };
}

function mockCalls(handlers: Record<string, (...args: unknown[]) => unknown>) {
  simulateContractCall.mockImplementation(async (fn: string, ...args: unknown[]) => {
    const handler = handlers[fn];
    if (!handler) throw new Error(`unexpected contract call: ${fn}`);
    return handler(...args);
  });
}

const app = createApp();

beforeEach(() => {
  simulateContractCall.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/events/:id/status", () => {
  it("returns the status name, not the array index", async () => {
    mockCalls({ get_event: () => rawEvent({ status: ["Ended"] }) });

    const res = await request(app).get("/api/events/0/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ event_id: 0, status: "Ended" });
  });
});

describe("GET /api/events/:id", () => {
  it("serializes bigints and normalizes status", async () => {
    mockCalls({ get_event: () => rawEvent() });

    const res = await request(app).get("/api/events/3");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 3,
      name: "Stellar Meetup",
      date_unix: 1_760_000_000,
      funding_goal: "500000000",
      balance: "120000000",
      status: "Active",
    });
  });

  it("returns 404 when the contract reports EventNotFound", async () => {
    mockCalls({
      get_event: () => {
        throw new ContractError(ContractErrorCode.EventNotFound);
      },
    });

    const res = await request(app).get("/api/events/99");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "event not found", code: 3 });
  });

  it.each(["-1", "abc", "1.5", "4294967296"])("rejects invalid id %s with 400", async (id) => {
    const res = await request(app).get(`/api/events/${id}`);

    expect(res.status).toBe(400);
    expect(simulateContractCall).not.toHaveBeenCalled();
  });
});

describe("error responses", () => {
  it("never leaks RPC diagnostics in a 500", async () => {
    mockCalls({
      get_event: () => {
        throw new Error("HostError: Error(WasmVm, InvalidAction)\nEvent log: secret diagnostics");
      },
    });

    const res = await request(app).get("/api/events/0");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal server error" });
  });

  it("maps RPC timeouts to 504", async () => {
    mockCalls({
      get_event: () => {
        throw new RpcTimeoutError("RPC request timed out");
      },
    });

    const res = await request(app).get("/api/events/0");

    expect(res.status).toBe(504);
  });

  it("maps RPC network failures to 502", async () => {
    mockCalls({
      get_event: () => {
        throw new RpcUnavailableError("RPC request failed: getaddrinfo EAI_AGAIN");
      },
    });

    const res = await request(app).get("/api/events/0");

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "upstream RPC unavailable" });
  });

  it("returns 404 for nested resources of a missing event", async () => {
    mockCalls({
      get_sponsorships: () => {
        throw new ContractError(ContractErrorCode.EventNotFound);
      },
    });

    const res = await request(app).get("/api/events/99/sponsorships");

    expect(res.status).toBe(404);
  });

  it("returns 404 for a missing ticket", async () => {
    mockCalls({
      get_ticket: () => {
        throw new ContractError(ContractErrorCode.TicketNotFound);
      },
    });

    const res = await request(app).get("/api/events/0/tickets/7");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "ticket not found", code: 4 });
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
  });
});

describe("GET /api/events", () => {
  it("lists events with ids and sorts by date", async () => {
    const events = [
      rawEvent({ name: "Later", date_unix: 2_000n }),
      rawEvent({ name: "Sooner", date_unix: 1_000n }),
    ];
    mockCalls({
      event_count: () => 2,
      get_event: () => events.shift(),
    });

    const res = await request(app).get("/api/events?sort=date");

    expect(res.status).toBe(200);
    expect(res.body.map((e: { name: string }) => e.name)).toEqual(["Sooner", "Later"]);
    expect(res.body[0]).toMatchObject({ id: 1, status: "Active" });
  });
});

describe("request logger", () => {
  it("sets X-Response-Time without crashing the server", async () => {
    const res = await request(app).get("/health");
    const second = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["x-response-time"]).toMatch(/^\d+(\.\d+)?ms$/);
    expect(second.status).toBe(200);
  });
});
