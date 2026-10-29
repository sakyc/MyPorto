import type { RequestHandler, CookieOptions } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { digest, equal } from "./crypto.js";
import { config } from "../config.js";
import { HttpError, asyncRoute } from "../lib/http.js";

declare global {
  namespace Express {
    interface Request {
      owner?: {
        id: number;
        email: string;
        tokenHash: string;
        csrfToken: string;
      };
    }
  }
}
export const sessionCookie = "rf_session";
export const challengeCookie = "rf_challenge";
export function cookieOptions(path = "/api/admin"): CookieOptions {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: config.COOKIE_SAME_SITE,
    path,
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  };
}
export const requireOwner: RequestHandler = asyncRoute(
  async (req, _res, next) => {
    const raw = req.cookies?.[sessionCookie];
    if (typeof raw !== "string" || !/^[a-f0-9]{64}$/.test(raw))
      throw new HttpError(401, "Please sign in.");
    const hash = digest(raw);
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        csrfToken: sessions.csrfToken,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, new Date())),
      );
    if (!row) throw new HttpError(401, "Please sign in.");
    req.owner = { ...row, tokenHash: hash };
    next();
  },
);
export const csrf: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const supplied = req.get("X-CSRF-Token") || "";
  if (!req.owner || !equal(supplied, req.owner.csrfToken))
    return next(new HttpError(403, "Refresh this page and try again."));
  next();
};
