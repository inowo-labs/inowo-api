import { describe, expect, it } from "vitest";
import { ContractError, parseContractErrorCode } from "../src/lib/errors";

describe("parseContractErrorCode", () => {
  it("extracts the code from a host error", () => {
    expect(parseContractErrorCode("HostError: Error(Contract, #3)\n\nEvent log ...")).toBe(3);
    expect(parseContractErrorCode("HostError: Error(Contract, #14)")).toBe(14);
  });

  it("returns null for non-contract errors", () => {
    expect(parseContractErrorCode("HostError: Error(WasmVm, InvalidAction)")).toBeNull();
    expect(parseContractErrorCode("network down")).toBeNull();
  });
});

describe("ContractError", () => {
  it("names known codes and falls back for unknown ones", () => {
    expect(new ContractError(3).message).toBe("EventNotFound");
    expect(new ContractError(999).message).toBe("ContractError#999");
  });
});
