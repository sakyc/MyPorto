import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { contactSubmissionSchema } from "@rf/contracts";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { messages, pageViews, visitors, referrers } from "../db/schema.js";
import { latest, revision } from "../services/content.js";
import { config } from "../config.js";
import { digest } from "../auth/crypto.js";
import { HttpError, asyncRoute } from "../lib/http.js";

export function publicRouter(disableLimits = false) {
  const router = Router();
  router.get(
    "/public/content",
    asyncRoute(async (_req, res) => {
      const snapshot = await latest();
      res
        .set({
          "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
          ETag: `"${revision(snapshot.payload)}"`,
        })
        .json(snapshot.payload);
    }),
  );
  router.get(
    "/public/projects/:slug",
    asyncRoute(async (req, res) => {
      const slug = z
        .string()
        .max(140)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .parse(req.params.slug);
      const snapshot = await latest(),
        project = snapshot.payload.projects.find((item) => item.slug === slug);
      if (!project) throw new HttpError(404, "Project not found.");
      res
        .set("Cache-Control", "public, max-age=60, stale-while-revalidate=600")
        .json(project);
    }),
  );
  const contactLimit = rateLimit({
    windowMs: 60 * 60_000,
    limit: 3,
    skip: () => disableLimits,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: "You’ve sent a few messages already. Please try again later.",
      });
    },
  });
  router.post(
    "/contact",
    contactLimit,
    asyncRoute(async (req, res) => {
      const input = contactSubmissionSchema.parse(req.body);
      if (input.website) {
        res.status(202).json({ ok: true });
        return;
      }
      await db.insert(messages).values({
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        body: input.message,
        consent: true,
        ipHash: digest(
          config.ANALYTICS_SALT_SECRET + "contact" + (req.ip || ""),
        ),
      });
      res.status(201).json({ ok: true });
    }),
  );
  const trackLimit = rateLimit({
    windowMs: 60_000,
    limit: 60,
    skip: () => disableLimits,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.sendStatus(204);
    },
  });
  router.post(
    "/track",
    trackLimit,
    asyncRoute(async (req, res) => {
      const input = z
        .object({
          path: z.string().max(300),
          referrer: z.string().max(2000).optional().default(""),
        })
        .strict()
        .safeParse(req.body);
      if (
        !input.success ||
        req.get("DNT") === "1" ||
        /bot|crawler|spider|headless|preview/i.test(req.get("User-Agent") || "")
      ) {
        res.sendStatus(204);
        return;
      }
      let path: string;
      try {
        path = new URL(input.data.path, config.WEB_ORIGIN).pathname;
      } catch {
        res.sendStatus(204);
        return;
      }
      if (
        !/^\/(?:projects(?:\/[a-z0-9-]+)?)?$/.test(path) ||
        path.length > 200
      ) {
        res.sendStatus(204);
        return;
      }
      const day = new Date().toISOString().slice(0, 10),
        visitorHash = digest(
          config.ANALYTICS_SALT_SECRET +
            day +
            (req.ip || "") +
            (req.get("User-Agent") || ""),
        );
      let source = "direct";
      try {
        const host = new URL(input.data.referrer).hostname;
        if (host !== new URL(config.WEB_ORIGIN).hostname)
          source = host.slice(0, 200);
      } catch {}
      await db.transaction(async (tx) => {
        // INSERT IGNORE plus a unique index makes concurrent beacons idempotent for uniqueness.
        const [inserted] = await tx
          .insert(visitors)
          .ignore()
          .values({ day, path, visitorHash });
        const unique = inserted.affectedRows ? 1 : 0;
        const { sql } = await import("drizzle-orm");
        await tx
          .insert(pageViews)
          .values({ day, path, views: 1, uniques: unique })
          .onDuplicateKeyUpdate({
            set: {
              views: sql`${pageViews.views} + 1`,
              uniques: sql`${pageViews.uniques} + ${unique}`,
            },
          });
        const [dailyVisitor] = await tx
          .insert(visitors)
          .ignore()
          .values({ day, path: "__daily_total__", visitorHash });
        const totalUnique = dailyVisitor.affectedRows ? 1 : 0;
        await tx
          .insert(pageViews)
          .values({
            day,
            path: "__daily_total__",
            views: 1,
            uniques: totalUnique,
          })
          .onDuplicateKeyUpdate({
            set: {
              views: sql`${pageViews.views} + 1`,
              uniques: sql`${pageViews.uniques} + ${totalUnique}`,
            },
          });
        await tx
          .insert(referrers)
          .values({ day, source, views: 1 })
          .onDuplicateKeyUpdate({
            set: { views: sql`${referrers.views} + 1` },
          });
      });
      res.sendStatus(204);
    }),
  );
  return router;
}
