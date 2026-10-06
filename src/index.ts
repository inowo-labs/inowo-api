import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app";

const REQUIRED_ENV = ["STELLAR_RPC_URL", "INOWO_CONTRACT_ID"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const PORT = process.env.PORT || 3001;

createApp().listen(PORT, () => {
  console.log(`Inowo API running on port ${PORT}`);
});
