import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { hash, verify } from "@node-rs/argon2";
import { TOTP } from "otpauth";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { ownerCredentialsSchema, authenticatorQrSchema } from "@rf/contracts";
import QRCode from "qrcode";
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
import { checkVerification } from "../auth/verification.js";

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
      res.set("Cache-Control", "no-store").json({ needs2fa: true, verificationMethod: owner.verificationMethod });
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
      const verificationError = await db.transaction(async (tx) => {
        const [owner] = await tx
          .select()
          .from(users)
          .where(eq(users.id, challenge.userId))
          .for("update");
        if (!owner || (owner.lockedUntil && owner.lockedUntil > new Date()))
          throw invalid();
        // A reusable PIN still requires a live, single-use password challenge.
        const [liveChallenge] = await tx.select().from(challenges).where(
          and(eq(challenges.tokenHash, challenge.tokenHash), gt(challenges.expiresAt, new Date())),
        ).for("update");
        if (!liveChallenge || liveChallenge.attempts > 3) throw invalid();
        const checked = await checkVerification(owner, input.data.code);
        if (!checked.valid) {
          const failures = owner.failedLogins + 1;
          await tx.update(users).set({ failedLogins: failures,
            lockedUntil: failures >= 5 ? new Date(Date.now() + Math.min(60, 2 ** Math.min(failures - 5, 6)) * 60_000) : null,
          }).where(eq(users.id, owner.id));
          return new HttpError(checked.replay ? 409 : 400, checked.replay
            ? "This code was already used. Wait for the next authenticator code."
            : owner.verificationMethod === "pin" ? "Incorrect PIN. Enter your six-digit PIN."
            : "Incorrect authenticator code. Check the account and automatic time on your phone.");
        }
        // Consume the challenge atomically with session creation; replay is rejected.
        await tx
          .delete(challenges)
          .where(eq(challenges.tokenHash, challenge.tokenHash));
        await tx
          .update(users)
          .set({ lastTotpStep: checked.step, failedLogins: 0, lockedUntil: null })
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
      if (verificationError) throw verificationError;
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
        .select({ username: users.username, email: users.email, verificationMethod: users.verificationMethod, pinHash: users.pinHash })
        .from(users)
        .where(eq(users.id, req.owner!.id));
      res
        .set("Cache-Control", "no-store")
        .json({ username: owner.username, email: owner.email, verificationMethod: owner.verificationMethod, totpEnabled: owner.verificationMethod === "totp", pinConfigured: !!owner.pinHash });
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
      const pinHash = input.newPin ? await hash(input.newPin, {
        memoryCost: 19456, timeCost: 2, parallelism: 1,
      }) : null;
      let savedMethod: "totp" | "pin" = "totp";
      let pinConfigured = false;
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
            "Current password is incorrect.",
          );
        const checked = await checkVerification(owner, input.code);
        if (checked.replay)
          throw new HttpError(
            409,
            "This code was already used. Wait for the next authenticator code.",
          );
        if (!checked.valid) throw new HttpError(400, owner.verificationMethod === "pin"
          ? "Incorrect current PIN." : "Incorrect authenticator code. Check the account and automatic time on your phone.");
        savedMethod = input.verificationMethod ?? owner.verificationMethod;
        if (savedMethod === "pin" && !pinHash && !owner.pinHash)
          throw new HttpError(400, "Set a six-digit PIN before selecting PIN verification.");
        let nextTotpStep = checked.step;
        if (savedMethod === "totp" && owner.verificationMethod === "pin") {
          const enrolled = await checkVerification({ ...owner, verificationMethod: "totp" }, input.authenticatorCode);
          if (!enrolled.valid) throw new HttpError(400, "Enter a fresh code from your authenticator before switching methods.");
          nextTotpStep = enrolled.step;
        }
        pinConfigured = !!(pinHash || owner.pinHash);
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
            verificationMethod: savedMethod,
            ...(pinHash ? { pinHash } : {}),
            lastTotpStep: nextTotpStep,
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
          totpEnabled: savedMethod === "totp",
          verificationMethod: savedMethod,
          pinConfigured,
          csrfToken,
        });
    }),
  );
  router.post(
    "/authenticator/qr", requireOwner, csrf, limiter(),
    asyncRoute(async (req, res) => {
      const input = authenticatorQrSchema.parse(req.body);
      const [owner] = await db.select().from(users).where(eq(users.id, req.owner!.id));
      if (!owner || !await verify(owner.passwordHash, input.currentPassword).catch(() => false))
        throw new HttpError(400, "Current password is incorrect.");
      const totp = new TOTP({ issuer: "Nuansua Portfolio", label: owner.email,
        secret: decrypt(owner.totpSecret), digits: 6, period: 30, algorithm: "SHA1" });
      const qrDataUrl = await QRCode.toDataURL(totp.toString(), { width: 280, margin: 2 });
      await db.insert(auditLog).values({ action: "authenticator_qr_viewed", entity: "owner", entityId: String(owner.id) });
      res.set("Cache-Control", "no-store").json({ qrDataUrl, email: owner.email });
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
