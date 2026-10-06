import { Networks } from "@stellar/stellar-sdk";

const config = {
  stellarRpcUrl: process.env.STELLAR_RPC_URL!,
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET,
  contractId: process.env.INOWO_CONTRACT_ID!,
  usdcContractId: process.env.USDC_CONTRACT_ID,
  port: Number(process.env.PORT ?? 3001),
} as const;

export default config;
