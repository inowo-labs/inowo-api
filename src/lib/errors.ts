// Contract error codes mirror the `Error` enum in inowo-Contract/src/lib.rs. Codes are stable.
export const ContractErrorCode = {
  AlreadyInitialized: 1,
  NotInitialized: 2,
  EventNotFound: 3,
  TicketNotFound: 4,
  NotOrganizer: 5,
  EventNotActive: 6,
  NoTiers: 7,
  InvalidFundingGoal: 8,
  InvalidTierPrice: 9,
  InvalidSupplyCap: 10,
  InvalidTier: 11,
  TierSoldOut: 12,
  AlreadyRedeemed: 13,
  InvalidAmount: 14,
} as const;

const NAMES = Object.fromEntries(
  Object.entries(ContractErrorCode).map(([name, code]) => [code, name])
) as Record<number, string>;

export class ContractError extends Error {
  readonly code: number;
  readonly name = "ContractError";

  constructor(code: number) {
    super(NAMES[code] ?? `ContractError#${code}`);
    this.code = code;
  }
}

/** Extracts the code from a simulation error such as `HostError: Error(Contract, #3)`. */
export function parseContractErrorCode(message: string): number | null {
  const match = /Error\(Contract, #(\d+)\)/.exec(message);
  return match ? Number(match[1]) : null;
}

export class RpcTimeoutError extends Error {
  readonly name = "RpcTimeoutError";
}

export class RpcUnavailableError extends Error {
  readonly name = "RpcUnavailableError";
}
