import { Router } from "express";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { resourceNames, type ResourceName } from "@rf/contracts";
import { db, pool } from "../db/client.js";
import {
  messages,
  settings,
  snapshots,
  auditLog,
  pageViews,
  visitors,
  referrers,
} from "../db/schema.js";
import { requireOwner, csrf } from "../auth/session.js";
import { HttpError, asyncRoute, idParam } from "../lib/http.js";
import * as content from "../services/content.js";

export function adminRouter() {
  const router = Router();
  router.use(requireOwner, csrf, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get(
    "/content",
    asyncRoute(async (_req, res) => {
      res.json(await content.draft());
    }),
  );
  router.get(
    "/settings",
    asyncRoute(async (_req, res) => {
      const [row] = await db.select().from(settings).where(eq(settings.id, 1));
      res.json(row.data);
    }),
  );
  router.put(
    "/settings",
    asyncRoute(async (req, res) => {
      res.json(await content.saveSettings(req.body));
    }),
  );
  router.get(
    "/publish/preview",
    asyncRoute(async (_req, res) => {
      res.json(
        await db.transaction(async (tx) => {
          await content.lockContent(tx);
          return content.preview(tx);
        }),
      );
    }),
  );
  router.post(
    "/publish",
    asyncRoute(async (req, res) => {
      const input = z
        .object({ revision: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict()
        .parse(req.body);
      res.json(await content.publish(input.revision));
    }),
  );
  router.post(
    "/publish/revalidate",
    asyncRoute(async (_req, res) => {
      const latest = await content.latest();
      res.json({
        revalidated: await content.revalidate(content.pathsFor(latest.payload)),
      });
    }),
  );
  router.get(
    "/snapshots",
    asyncRoute(async (_req, res) => {
      res.json(
        await db
          .select({
            version: snapshots.version,
            commitHash: snapshots.commitHash,
            summary: snapshots.summary,
            publishedAt: snapshots.publishedAt,
          })
          .from(snapshots)
          .orderBy(desc(snapshots.version)),
      );
    }),
  );
  router.post(
    "/snapshots/:version/rollback",
    asyncRoute(async (req, res) => {
      res.json(await content.rollback(idParam(req.params.version)));
    }),
  );
  router.get(
    "/messages",
    asyncRoute(async (req, res) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .strict()
        .parse(req.query);
      const [items, [count]] = await Promise.all([
        db
          .select({
            id: messages.id,
            name: messages.name,
            email: messages.email,
            phone: messages.phone,
            body: messages.body,
            consent: messages.consent,
            read: messages.read,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .orderBy(desc(messages.id))
          .limit(query.limit)
          .offset((query.page - 1) * query.limit),
        db
          .select({
            total: sql<number>`count(*)`,
            unread: sql<number>`sum(case when ${messages.read} = false then 1 else 0 end)`,
          })
          .from(messages),
      ]);
      res.json({
        items,
        total: Number(count.total),
        unread: Number(count.unread || 0),
        ...query,
      });
    }),
  );
  router.patch(
    "/messages/:id",
    asyncRoute(async (req, res) => {
      const input = z.object({ read: z.boolean() }).strict().parse(req.body);
      const [result] = await db
        .update(messages)
        .set(input)
        .where(eq(messages.id, idParam(req.params.id)));
      if (!result.affectedRows) throw new HttpError(404, "Message not found.");
      res.json({ ok: true });
    }),
  );
  router.delete(
    "/messages/:id",
    asyncRoute(async (req, res) => {
      const [result] = await db
        .delete(messages)
        .where(eq(messages.id, idParam(req.params.id)));
      if (!result.affectedRows) throw new HttpError(404, "Message not found.");
      res.json({ ok: true });
    }),
  );
  router.get(
    "/analytics",
    asyncRoute(async (req, res) => {
      const query = z
        .object({ range: z.enum(["14d", "30d"]).default("14d") })
        .strict()
        .parse(req.query);
      const days = parseInt(query.range),
        now = new Date(),
        since = new Date(now.getTime() - (days - 1) * 86400_000)
          .toISOString()
          .slice(0, 10);
      const dailyRows = await db
        .select({
          day: pageViews.day,
          views: sql<number>`sum(${pageViews.views})`,
          uniques: sql<number>`(select count(distinct v.visitor_hash) from visitors_daily v where v.day = ${pageViews.day})`,
        })
        .from(pageViews)
        .where(gte(pageViews.day, since))
        .groupBy(pageViews.day);
      // Retained aggregates keep daily total uniques even after the short-lived hashes are removed.
      const totals = await db
        .select({
          day: pageViews.day,
          views: pageViews.views,
          uniques: pageViews.uniques,
        })
        .from(pageViews)
        .where(
          and(gte(pageViews.day, since), eq(pageViews.path, "__daily_total__")),
        );
      const daily = Array.from({ length: days }, (_, i) => {
        const day = new Date(now.getTime() - (days - 1 - i) * 86400_000)
            .toISOString()
            .slice(0, 10),
          row = dailyRows.find((item) => item.day === day),
          total = totals.find((item) => item.day === day);
        return {
          day,
          views: Number(total?.views || row?.views || 0),
          uniques: Number(total?.uniques || row?.uniques || 0),
        };
      });
      const [topPages, sources] = await Promise.all([
        db
          .select({
            path: pageViews.path,
            views: sql<number>`sum(${pageViews.views})`,
          })
          .from(pageViews)
          .where(
            and(
              gte(pageViews.day, since),
              sql`${pageViews.path} <> '__daily_total__'`,
            ),
          )
          .groupBy(pageViews.path)
          .orderBy(sql`sum(${pageViews.views}) desc`)
          .limit(10),
        db
          .select({
            source: referrers.source,
            views: sql<number>`sum(${referrers.views})`,
          })
          .from(referrers)
          .where(gte(referrers.day, since))
          .groupBy(referrers.source)
          .orderBy(sql`sum(${referrers.views}) desc`)
          .limit(10),
      ]);
      res.json({
        today: daily.at(-1)?.uniques || 0,
        last7: daily.slice(-7).reduce((sum, item) => sum + item.uniques, 0),
        total: daily.reduce((sum, item) => sum + item.uniques, 0),
        daily,
        topPages: topPages.map((row) => ({ ...row, views: Number(row.views) })),
        referrers: sources.map((row) => ({ ...row, views: Number(row.views) })),
      });
    }),
  );
  router.get(
    "/status",
    asyncRoute(async (_req, res) => {
      const start = Date.now();
      await pool.query("SELECT 1");
      const [snapshot, activity, [counts]] = await Promise.all([
        content.latest(),
        db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(10),
        db
          .select({
            unread: sql<number>`sum(case when ${messages.read} = false then 1 else 0 end)`,
          })
          .from(messages),
      ]);
      res.json({
        api: "online",
        database: "connected",
        latency: Date.now() - start,
        lastPublish: {
          version: snapshot.version,
          commitHash: snapshot.commitHash,
          publishedAt: snapshot.publishedAt,
        },
        unread: Number(counts.unread || 0),
        activity,
        backup: "Configure a scheduled backup on the VPS",
      });
    }),
  );
  for (const resource of resourceNames) {
    router.get(
      "/" + resource,
      asyncRoute(async (_req, res) => {
        res.json(await content.entries(resource));
      }),
    );
    router.post(
      "/" + resource,
      asyncRoute(async (req, res) => {
        const input = z.record(z.string(), z.unknown()).parse(req.body);
        res.status(201).json(await content.save(resource, null, input));
      }),
    );
    router.put(
      "/" + resource + "/order",
      asyncRoute(async (req, res) => {
        const input = z
          .object({ ids: z.array(z.number().int().positive()).max(1000) })
          .strict()
          .parse(req.body);
        await content.reorder(resource, input.ids);
        res.json({ ok: true });
      }),
    );
    router.patch(
      "/" + resource + "/:id",
      asyncRoute(async (req, res) => {
        const input = z.record(z.string(), z.unknown()).parse(req.body);
        res.json(await content.save(resource, idParam(req.params.id), input));
      }),
    );
    router.delete(
      "/" + resource + "/:id",
      asyncRoute(async (req, res) => {
        await content.remove(resource, idParam(req.params.id));
        res.json({ ok: true });
      }),
    );
  }
  return router;
}
