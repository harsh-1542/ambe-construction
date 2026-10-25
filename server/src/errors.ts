import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

/** Consistent error shape: { error: string, details?: any } */
export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details: Record<string, string> = {};
    for (const [k, v] of Object.entries(err.errors)) details[k] = (v as mongoose.Error.ValidatorError).message;
    return res.status(400).json({ error: "Validation failed", details });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: `Invalid value for ${err.path}` });
  }
  if (typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 11000) {
    const kv = (err as { keyValue?: Record<string, unknown> }).keyValue ?? {};
    return res.status(409).json({ error: "Duplicate record", details: kv });
  }
  console.error("[error]", err);
  const message = err instanceof Error ? err.message : "Something went wrong";
  res.status(500).json({ error: message });
}
