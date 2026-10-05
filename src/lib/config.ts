const config = {
  stellarRpcUrl: process.env.STELLAR_RPC_URL!,
  contractId: process.env.INOWO_CONTRACT_ID!,
  usdcContractId: process.env.USDC_CONTRACT_ID,
  port: Number(process.env.PORT ?? 3001),
} as const;

export default config;
