import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import eventsRouter from "./routes/events";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";

export function createApp() {
  const app = express();

  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(",") ?? "*",
    })
  );
  app.use(express.json());
  app.use(limiter);
  app.use(requestLogger);

  const startedAt = Date.now();

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      version: process.env.npm_package_version ?? "unknown",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      network: process.env.STELLAR_RPC_URL,
      contractId: process.env.INOWO_CONTRACT_ID,
    });
  });

  app.use("/api/events", eventsRouter);
  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });
  app.use(errorHandler);

  return app;
}
