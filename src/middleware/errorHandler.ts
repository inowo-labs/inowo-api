import { NextFunction, Request, Response } from "express";
import {
  ContractError,
  ContractErrorCode,
  RpcTimeoutError,
  RpcUnavailableError,
} from "../lib/errors";

const NOT_FOUND_MESSAGES: Record<number, string> = {
  [ContractErrorCode.EventNotFound]: "event not found",
  [ContractErrorCode.TicketNotFound]: "ticket not found",
};

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ContractError) {
    const notFound = NOT_FOUND_MESSAGES[err.code];
    if (notFound) {
      res.status(404).json({ error: notFound, code: err.code });
      return;
    }
    res.status(400).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof RpcTimeoutError) {
    console.error(err.message);
    res.status(504).json({ error: "upstream RPC timed out" });
    return;
  }

  if (err instanceof RpcUnavailableError) {
    console.error(err.message);
    res.status(502).json({ error: "upstream RPC unavailable" });
    return;
  }

  // Unexpected failures can carry RPC diagnostics; log them, never return them.
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  res.status(500).json({ error: "internal server error" });
}
