import { NextFunction, Request, Response } from "express";

const U32_MAX = 0xffff_ffff;

export function isU32(value: string): boolean {
  const n = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(n) && n <= U32_MAX;
}

export function validateEventId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isU32(String(req.params.id))) {
    res.status(400).json({ error: "event id must be a non-negative integer" });
    return;
  }
  next();
}
