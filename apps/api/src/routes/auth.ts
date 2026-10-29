import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { hash, verify } from "@node-rs/argon2";
import { TOTP } from "otpauth";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { ownerCredentialsSchema } from "@rf/contracts";
import { z } from "zod";
import { db } from "../db/client.js";
import { users, sessions, challenges, auditLog } from "../db/schema.js";
import { decrypt, digest, token } from "../auth/crypto.js";
import {
  requireOwner,
  csrf,
  sessionCookie,
  challengeCookie,
  cookieOptions,
} from "../auth/session.js";
import { HttpError, asyncRoute } from "../lib/http.js";

export function authRouter(disableLimits = false) {
  const router = Router();
  const limiter = () =>
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 3,
      // Correct passwords and valid codes must not consume the failure budget.
      skipSuccessfulRequests: true,
      skip: () => disableLimits,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) => {
        const retryAfter = Number(res.getHeader("Retry-After")) || 900;
        res.status(429).json({
          error:
            "Too many incorrect attempts. Please wait before trying again.",
          retryAfter,
        });
      },
    });
  const dummyHash = hash(token(), {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const invalid = () => new HttpError(401, "Invalid login details.");
  router.post(
    "/login",
    limiter(),
    asyncRoute(async (req, res) => {
      const input = z
        .object({
          email: z.string().trim().min(1).max(254),
          password: z.string().min(1).max(256),
        })
        .strict()
        .parse(req.body);
      const login = input.email.toLowerCase();
      const [owner] = await db
        .select()
        .from(users)
        .where(or(eq(users.email, login), eq(users.username, login)));
      const valid = await verify(
        owner?.passwordHash || (await dummyHash),
        input.password,
      ).catch(() => false);
      if (owner?.lockedUntil && owner.lockedUntil > new Date()) {
        const retryAfter = Math.ceil(
          (owner.lockedUntil.getTime() - Date.now()) / 1000,
        );
        res.set("Retry-After", String(retryAfter)).status(429).json({
          error:
            "Too many incorrect attempts. Please wait before trying again.",
          retryAfter,
        });
        return;
      }
      if (!owner || !valid) {
        if (owner) {
          const failures = owner.failedLogins + 1;
          await db
            .update(users)
            .set({
              failedLogins: failures,
              lockedUntil:
                failures >= 5
                  ? new Date(
                      Date.now() +
                        Math.min(60, 2 ** Math.min(failures - 5, 6)) * 60_000,
                    )
                  : null,
            })
            .where(eq(users.id, owner.id));
        }
        throw invalid();
      }
      const raw = token();
      await db.insert(challenges).values({
        tokenHash: digest(raw),
        userId: owner.id,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      });
      res.cookie(challengeCookie, raw, {
        ...cookieOptions("/api/admin/login"),
        maxAge: 5 * 60_000,
      });
      res.json({ needs2fa: true });
    }),
  );
  router.post(
    "/login/2fa",
    limiter(),
    asyncRoute(async (req, res) => {
      const input = z
        .object({ code: z.string().regex(/^\d{6}$/) })
        .strict()
        .safeParse(req.body);
      if (!input.success) throw invalid();
      const raw = req.cookies?.[challengeCookie];
      if (typeof raw !== "string" || !/^[a-f0-9]{64}$/.test(raw))
        throw invalid();
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(
          and(
            eq(challenges.tokenHash, digest(raw)),
            gt(challenges.expiresAt, new Date()),
          ),
        );
      if (!challenge || challenge.attempts >= 3) throw invalid();
      await db
        .update(challenges)
        .set({ attempts: sql`${challenges.attempts} + 1` })
        .where(eq(challenges.tokenHash, challenge.tokenHash));
      const sessionToken = token(),
        csrfToken = token();
      await db.transaction(async (tx) => {
        const [owner] = await tx
          .select()
          .from(users)
          .where(eq(users.id, challenge.userId))
          .for("update");
        if (!owner || (owner.lockedUntil && owner.lockedUntil > new Date()))
          throw invalid();
        const totp = new TOTP({
          secret: decrypt(owner.totpSecret),
          digits: 6,
          period: 30,
          algorithm: "SHA1",
        });
        const delta = totp.validate({ token: input.data.code, window: 1 });
        const step = Math.floor(Date.now() / 30_000) + (delta || 0);
        if (delta === null || step <= owner.lastTotpStep) throw invalid();
        // Consume the challenge atomically with session creation; replay is rejected.
        await tx
          .delete(challenges)
          .where(eq(challenges.tokenHash, challenge.tokenHash));
        await tx
          .update(users)
          .set({ lastTotpStep: step, failedLogins: 0, lockedUntil: null })
          .where(eq(users.id, owner.id));
        await tx.insert(sessions).values({
          tokenHash: digest(sessionToken),
          userId: owner.id,
          csrfToken,
          expiresAt: new Date(Date.now() + 12 * 60 * 60_000),
        });
        await tx.insert(auditLog).values({
          action: "login",
          entity: "owner",
          entityId: String(owner.id),
        });
      });
      res.clearCookie(challengeCookie, cookieOptions("/api/admin/login"));
      res.cookie(sessionCookie, sessionToken, {
        ...cookieOptions(),
        maxAge: 12 * 60 * 60_000,
      });
      res.json({ ok: true, csrfToken });
    }),
  );
  router.get("/me", requireOwner, (req, res) => {
    res
      .set("Cache-Control", "no-store")
      .json({ email: req.owner!.email, csrfToken: req.owner!.csrfToken });
  });
  router.get(
    "/credentials",
    requireOwner,
    asyncRoute(async (req, res) => {
      const [owner] = await db
        .select({ username: users.username, email: users.email })
        .from(users)
        .where(eq(users.id, req.owner!.id));
      res
        .set("Cache-Control", "no-store")
        .json({ ...owner, totpEnabled: true });
    }),
  );
  router.patch(
    "/credentials",
    requireOwner,
    csrf,
    limiter(),
    asyncRoute(async (req, res) => {
      const input = ownerCredentialsSchema.parse(req.body);
      const replacementHash = input.newPassword
        ? await hash(input.newPassword, {
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1,
          })
        : null;
      const sessionToken = token(),
        csrfToken = token();
      await db.transaction(async (tx) => {
        const [owner] = await tx
          .select()
          .from(users)
          .where(eq(users.id, req.owner!.id))
          .for("update");
        if (
          !owner ||
          !(await verify(owner.passwordHash, input.currentPassword).catch(
            () => false,
          ))
        )
          throw new HttpError(
            400,
            "Current password or authenticator code is incorrect.",
          );
        const totp = new TOTP({
          secret: decrypt(owner.totpSecret),
          digits: 6,
          period: 30,
          algorithm: "SHA1",
        });
        const delta = totp.validate({ token: input.code, window: 1 });
        if (delta === null)
          throw new HttpError(
            400,
            "Current password or authenticator code is incorrect.",
          );
        const step = Math.floor(Date.now() / 30_000) + delta;
        if (step <= owner.lastTotpStep)
          throw new HttpError(
            409,
            "This code was already used. Wait for the next authenticator code.",
          );
        const duplicate = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            or(
              eq(users.email, input.email),
              eq(users.username, input.username),
            ),
          );
        if (duplicate.some((row) => row.id !== owner.id))
          throw new HttpError(409, "This username or email is already in use.");
        await tx
          .update(users)
          .set({
            username: input.username,
            email: input.email,
            ...(replacementHash ? { passwordHash: replacementHash } : {}),
            lastTotpStep: step,
            failedLogins: 0,
            lockedUntil: null,
          })
          .where(eq(users.id, owner.id));
        await tx.delete(challenges).where(eq(challenges.userId, owner.id));
        await tx.delete(sessions).where(eq(sessions.userId, owner.id));
        await tx
          .insert(sessions)
          .values({
            tokenHash: digest(sessionToken),
            userId: owner.id,
            csrfToken,
            expiresAt: new Date(Date.now() + 12 * 60 * 60_000),
          });
        await tx
          .insert(auditLog)
          .values({
            action: "credentials_updated",
            entity: "owner",
            entityId: String(owner.id),
          });
      });
      res.cookie(sessionCookie, sessionToken, {
        ...cookieOptions(),
        maxAge: 12 * 60 * 60_000,
      });
      res.clearCookie(challengeCookie, cookieOptions("/api/admin/login"));
      res
        .set("Cache-Control", "no-store")
        .json({
          username: input.username,
          email: input.email,
          totpEnabled: true,
          csrfToken,
        });
    }),
  );
  router.post(
    "/logout",
    requireOwner,
    csrf,
    asyncRoute(async (req, res) => {
      await db
        .delete(sessions)
        .where(eq(sessions.tokenHash, req.owner!.tokenHash));
      res.clearCookie(sessionCookie, cookieOptions());
      res.json({ ok: true });
    }),
  );
  return router;
}
