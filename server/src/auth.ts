import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { Types } from "mongoose";

export interface AuthedRequest extends Request {
  ownerId?: string;
}

export function signToken(ownerId: string): string {
  return jwt.sign({ sub: ownerId }, config.authSecret, { expiresIn: `${config.authTokenDays}d` });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    const payload = jwt.verify(token, config.authSecret) as { sub: string };
    if (!payload.sub || !Types.ObjectId.isValid(payload.sub)) return res.status(401).json({ error: "Invalid session" });
    req.ownerId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired, please sign in again" });
  }
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie("token", token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? "none" : "lax", // lax works with the Vite proxy in dev
    maxAge: config.authTokenDays * 86400_000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie("token", { httpOnly: true, secure: config.isProd, sameSite: config.isProd ? "none" : "lax", path: "/" });
}
