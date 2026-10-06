import { NextFunction, Request, Response } from "express";

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - start) / 1e6;

  // Headers can only be set before they are flushed, so hook writeHead rather
  // than the "finish" event (which fires after the response has been sent).
  const writeHead = res.writeHead;
  res.writeHead = function (this: Response, ...args: unknown[]) {
    if (!res.headersSent) {
      res.setHeader("X-Response-Time", `${elapsedMs().toFixed(1)}ms`);
    }
    return (writeHead as (...a: unknown[]) => Response).apply(this, args);
  } as Response["writeHead"];

  res.on("finish", () => {
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} — ${elapsedMs().toFixed(1)}ms`
    );
  });

  next();
}
