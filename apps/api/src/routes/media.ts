import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { media, snapshots } from "../db/schema.js";
import { config } from "../config.js";
import { csrf, requireOwner } from "../auth/session.js";
import { HttpError, asyncRoute, idParam } from "../lib/http.js";
import { draft, lockContent } from "../services/content.js";

export const uploadDirectory = path.resolve(config.UPLOAD_DIR);
const publicMedia = (row: typeof media.$inferSelect) => ({
  ...row,
  url: config.API_PUBLIC_URL.replace(/\/$/, "") + "/media/" + row.filename,
});
export function mediaRouter() {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 },
    fileFilter: (_req, file, callback) => {
      callback(
        null,
        ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype),
      );
    },
  });
  router.use(requireOwner, csrf, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get(
    "/",
    asyncRoute(async (_req, res) => {
      res.json(
        (await db.select().from(media).orderBy(desc(media.id))).map(
          publicMedia,
        ),
      );
    }),
  );
  router.post(
    "/",
    upload.single("file"),
    asyncRoute(async (req, res) => {
      if (!req.file)
        throw new HttpError(
          400,
          "Choose a PNG, JPEG, or WebP image up to 5 MB.",
        );
      const alt = z
        .string()
        .trim()
        .max(250)
        .refine((value) => !/<[^>]*>/.test(value))
        .parse(req.body.alt || "");
      let data: Buffer, width: number, height: number;
      try {
        const input = sharp(req.file.buffer, {
            limitInputPixels: 40_000_000,
            animated: false,
          }),
          metadata = await input.metadata();
        if (
          !metadata.format ||
          !["png", "jpeg", "webp"].includes(metadata.format)
        )
          throw Error("Unsupported format");
        const result = await input
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer({ resolveWithObject: true });
        data = result.data;
        width = result.info.width;
        height = result.info.height;
      } catch {
        throw new HttpError(
          400,
          "This file isn’t a valid PNG, JPEG, or WebP image.",
        );
      }
      const filename = randomBytes(20).toString("hex") + ".webp",
        filePath = path.join(uploadDirectory, filename);
      await mkdir(uploadDirectory, { recursive: true });
      await writeFile(filePath, data, { flag: "wx" });
      try {
        const [result] = await db.insert(media).values({
          filename,
          mime: "image/webp",
          width,
          height,
          bytes: data.length,
          alt,
        });
        const [row] = await db
          .select()
          .from(media)
          .where(eq(media.id, result.insertId));
        res.status(201).json(publicMedia(row));
      } catch (error) {
        await unlink(filePath).catch(() => {});
        throw error;
      }
    }),
  );
  router.delete(
    "/:id",
    asyncRoute(async (req, res) => {
      const id = idParam(req.params.id);
      let filename = "";
      await db.transaction(async (tx) => {
        await lockContent(tx);
        const [row] = await tx.select().from(media).where(eq(media.id, id));
        if (!row) throw new HttpError(404, "Image not found.");
        const current = await draft(tx),
          history = await tx
            .select({ payload: snapshots.payload })
            .from(snapshots);
        const references = [
          current,
          ...history.map((snapshot) => snapshot.payload),
        ];
        if (
          references.some(
            (content) =>
              content.projects.some((project) => project.imageId === id) ||
              content.certificates.some(
                (certificate) => certificate.imageId === id,
              ) ||
              content.settings.profile.portraitUrl.includes(row.filename),
          )
        )
          throw new HttpError(
            409,
            "This image is used by a draft or a saved publication. Keep it to preserve that version.",
          );
        await tx.delete(media).where(eq(media.id, id));
        filename = row.filename;
      });
      // A failed database commit must never remove a referenced file. An orphan can
      // safely be cleaned up later if the filesystem is temporarily unavailable.
      await unlink(path.join(uploadDirectory, filename)).catch(() => {});
      res.json({ ok: true });
    }),
  );
  return router;
}
