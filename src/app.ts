import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { absolutePath as swaggerUiAssetsPath } from "swagger-ui-dist";
import eventsRouter from "./routes/events";
import addressesRouter from "./routes/addresses";
import { rpcCacheStats } from "./lib/stellar";
import { loadOpenApiSpec } from "./lib/openapi";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";

const DOCS_PAGE = `<!doctype html>
<html>
  <head>
    <title>Inowo API docs</title>
    <link rel="stylesheet" href="/docs/swagger-ui.css" />
    <link rel="icon" href="/docs/favicon-32x32.png" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: "/openapi.json",
          dom_id: "#swagger-ui",
          presets: [SwaggerUIBundle.presets.apis],
        });
      };
    </script>
  </body>
</html>`;

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
      rpcCache: rpcCacheStats(),
    });
  });

  app.get("/openapi.json", (_req, res) => {
    res.json(loadOpenApiSpec().json);
  });
  app.get("/docs", (_req, res) => {
    res.type("html").send(DOCS_PAGE);
  });
  // swagger-ui-dist ships its own index.html and swagger-initializer.js,
  // pointed at the Swagger Petstore demo. Block both so /docs always serves
  // our page above instead, which points Swagger UI at /openapi.json.
  const BLOCKED_DOCS_FILES = new Set(["/index.html", "/swagger-initializer.js"]);
  app.use("/docs", (req, res, next) => {
    if (BLOCKED_DOCS_FILES.has(req.path)) {
      res.status(404).json({ error: "not found" });
      return;
    }
    next();
  });
  app.use("/docs", express.static(swaggerUiAssetsPath(), { index: false }));

  app.use("/api/events", eventsRouter);
  app.use("/api/addresses", addressesRouter);
  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });
  app.use(errorHandler);

  return app;
}
