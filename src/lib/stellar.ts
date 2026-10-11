import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  scValToNative,
  xdr,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";
import { memoizeAsync } from "./cache";
import config from "./config";
import {
  ContractError,
  ContractErrorCode,
  RpcTimeoutError,
  RpcUnavailableError,
  parseContractErrorCode,
} from "./errors";

export const rpcServer = new SorobanRpc.Server(config.stellarRpcUrl);
const contract = new Contract(config.contractId);

// Dummy source — simulation does not require a funded account.
const DUMMY_SOURCE = new Account(
  "GCSOXELWBWKPQHSOUTEPGBUHR6W72V3ZCBO7DNBXRSEXZ3UN54CGVESY",
  "0"
);

const TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RpcTimeoutError("RPC request timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function simulateUncached(
  funcName: string,
  ...args: xdr.ScVal[]
): Promise<unknown> {
  const tx = new TransactionBuilder(DUMMY_SOURCE, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(funcName, ...args))
    .setTimeout(30)
    .build();

  let sim: SorobanRpc.Api.SimulateTransactionResponse;
  try {
    sim = await withTimeout(rpcServer.simulateTransaction(tx), TIMEOUT_MS);
  } catch (err) {
    if (err instanceof RpcTimeoutError) throw err;
    throw new RpcUnavailableError(
      `RPC request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
    const message = (sim as SorobanRpc.Api.SimulateTransactionErrorResponse).error;
    const code = parseContractErrorCode(message);
    if (code !== null) throw new ContractError(code);
    throw new Error(`Contract call ${funcName} failed: ${message}`);
  }

  return scValToNative(sim.result!.retval);
}

const NOT_FOUND_CODES = new Set<number>([
  ContractErrorCode.EventNotFound,
  ContractErrorCode.TicketNotFound,
  ContractErrorCode.PayoutNotFound,
]);

/**
 * Simulates a read-only contract call. Identical calls within the cache TTL
 * share one RPC simulation; "not found" answers are cached too, other
 * failures never are.
 */
export const simulateContractCall = memoizeAsync(simulateUncached, {
  ttlMs: config.rpcCacheTtlMs,
  max: 2_000,
  key: (funcName: string, ...args: xdr.ScVal[]) =>
    [funcName, ...args.map((arg) => arg.toXDR("base64"))].join(":"),
  cacheError: (err) => err instanceof ContractError && NOT_FOUND_CODES.has(err.code),
});

export const rpcCacheStats = () => simulateContractCall.stats();
