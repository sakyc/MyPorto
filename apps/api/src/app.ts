import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pino from "pino";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import multer from "multer";
import { healthResponseSchema } from "@rf/contracts";
import { config } from "./config.js";
import { pool } from "./db/client.js";
import { authRouter } from "./routes/auth.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { mediaRouter, uploadDirectory } from "./routes/media.js";
import { HttpError, asyncRoute } from "./lib/http.js";

const logger = pino({ level: config.NODE_ENV === "test" ? "silent" : "info" });
export function createApp(
  webOrigin = config.WEB_ORIGIN,
  options: { disableLimits?: boolean } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: webOrigin, credentials: true }));
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: Date.now() - start,
        },
        "request",
      );
    });
    next();
  });
  app.get("/api/health", (_req, res) => {
    res.json(healthResponseSchema.parse({ status: "ok", service: "rf-api" }));
  });
  app.get(
    "/healthz",
    asyncRoute(async (_req, res) => {
      try {
        await pool.query("SELECT 1");
        res.json({ ok: true, db: true });
      } catch {
        res.status(503).json({ ok: false, db: false });
      }
    }),
  );
  app.use(
    express.json({
      limit: "64kb",
      type: ["application/json", "application/*+json"],
    }),
  );
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 240,
      skip: () => !!options.disableLimits,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) => {
        res
          .status(429)
          .json({ error: "Too many requests. Please try again shortly." });
      },
    }),
  );
  app.use("/api/admin", (req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("Origin") &&
      req.get("Origin") !== webOrigin
    )
      return next(new HttpError(403, "Origin not allowed."));
    next();
  });
  app.use("/api/admin", authRouter(options.disableLimits));
  app.use("/api/admin/media", mediaRouter());
  app.use("/api/admin", adminRouter());
  app.use("/api", publicRouter(options.disableLimits));
  app.use(
    "/media",
    express.static(uploadDirectory, {
      maxAge: "1y",
      immutable: true,
      dotfiles: "deny",
      index: false,
      setHeaders: (res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
  ) => {
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues)
        fields[issue.path.join(".")] = issue.message;
      res.status(400).json({ error: "Check the highlighted fields.", fields });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "Choose an image smaller than 5 MB."
            : "Check the uploaded file.",
      });
      return;
    }
    const detail = error as {
      status?: number;
      code?: string;
      cause?: { code?: string };
    };
    if (
      detail.code === "ER_DUP_ENTRY" ||
      detail.cause?.code === "ER_DUP_ENTRY"
    ) {
      res
        .status(409)
        .json({ error: "This slug is already in use. Choose another one." });
      return;
    }
    if (detail.status === 413 || detail.status === 400) {
      res.status(detail.status).json({
        error: detail.status === 413 ? "Request too large" : "Invalid request",
      });
      return;
    }
    logger.error(
      { code: detail.cause?.code || detail.code || "INTERNAL" },
      "request failed",
    );
    res.status(500).json({ error: "Something went wrong. Please try again." });
  };
  app.use(errorHandler);
  return app;
}
