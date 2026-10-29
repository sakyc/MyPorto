import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import request from "supertest";
import { hash } from "@node-rs/argon2";
import { TOTP, Secret } from "otpauth";
import sharp from "sharp";
import {
  contentSchema,
  contactSubmissionSchema,
  healthResponseSchema,
} from "@rf/contracts";
import type { Express } from "express";

// Every run uses its own disposable database. Never use the owner's database.
const database = "nuansua-api-test-" + process.pid;
const rootUrl = process.env.TEST_MYSQL_URL || "mysql://root@127.0.0.1:3306/";
const url = new URL(rootUrl);
url.pathname = "/" + database;
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: url.toString(),
  SESSION_SECRET: "test-session-secret-".repeat(3),
  ANALYTICS_SALT_SECRET: "test-analytics-secret-".repeat(3),
  REVALIDATE_SECRET: "test-revalidation-secret-".repeat(3),
  REVALIDATE_URL: "http://127.0.0.1:1/api/revalidate",
  OWNER_EMAIL: "owner@test.example",
  WEB_ORIGIN: "http://localhost:3000",
  UPLOAD_DIR: path.resolve("../../.cache/test-uploads-" + process.pid),
});
const totp = new TOTP({
  secret: new Secret({ size: 20 }).base32,
  algorithm: "SHA1",
  digits: 6,
  period: 30,
});
const password = "Integration-test-password!";
let root: mysql.Connection,
  app: Express,
  limited: Express,
  agent: ReturnType<typeof request.agent>,
  csrf: string;
let connection: typeof import("./db/client.js");
before(async () => {
  root = await mysql.createConnection(rootUrl);
  await root.query("SET time_zone = '+00:00'");
  assert.match(database, /^nuansua-api-test-\d+$/);
  await root.query(
    "CREATE DATABASE `" +
      database +
      "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  await root.changeUser({ database });
  const directory = path.resolve("drizzle");
  for (const file of (await readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const statement of (await readFile(path.join(directory, file), "utf8"))
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean))
      await root.query(statement);
  connection = await import("./db/client.js");
  const { createApp } = await import("./app.js"),
    { encrypt } = await import("./auth/crypto.js"),
    schema = await import("./db/schema.js"),
    { resourceTables } = await import("./services/content.js");
  const content = contentSchema.parse(
    JSON.parse(
      await readFile(path.resolve("src/db/seed-content.json"), "utf8"),
    ),
  );
  await connection.db
    .insert(schema.settings)
    .values({ id: 1, data: content.settings });
  for (const [resource, items] of Object.entries({
    projects: content.projects,
    experience: content.experience,
    certificates: content.certificates,
    "stack-groups": content.stack,
    "assistant-presets": content.assistant,
  }))
    for (const row of items) {
      const data = { ...row } as Record<string, unknown>;
      delete data.id;
      const table = resourceTables[resource as keyof typeof resourceTables];
      if (resource === "projects")
        await connection.db.insert(schema.projects).values({
          id: row.id,
          data,
          sort: row.sort,
          slug: String(data.slug),
        });
      else
        await connection.db
          .insert(table)
          .values({ id: row.id, data, sort: row.sort });
    }
  await connection.db
    .insert(schema.snapshots)
    .values({ payload: content, summary: [], commitHash: "0123456789ab" });
  await connection.db.insert(schema.users).values({
    email: process.env.OWNER_EMAIL!,
    passwordHash: await hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    }),
    totpSecret: encrypt(totp.secret.base32),
  });
  app = createApp(undefined, { disableLimits: true });
  limited = createApp();
  agent = request.agent(app);
  await mkdir(process.env.UPLOAD_DIR!, { recursive: true });
});
after(async () => {
  if (connection) await connection.pool.end();
  if (root) {
    await root.query("DROP DATABASE `" + database + "`");
    await root.end();
  }
  if (process.env.UPLOAD_DIR?.endsWith("test-uploads-" + process.pid))
    await rm(process.env.UPLOAD_DIR, { recursive: true, force: true });
});
test("health, CORS, headers, unauthorized access and validation", async () => {
  const health = await request(app)
    .get("/api/health")
    .set("Origin", "http://localhost:3000");
  assert.equal(health.status, 200);
  assert.equal(healthResponseSchema.parse(health.body).status, "ok");
  assert.equal(health.headers["x-powered-by"], undefined);
  assert.equal(
    health.headers["access-control-allow-origin"],
    "http://localhost:3000",
  );
  assert.equal((await request(app).get("/healthz")).body.db, true);
  assert.equal((await request(app).get("/api/admin/content")).status, 401);
  assert.equal((await request(app).post("/api/contact").send({})).status, 400);
  assert.equal(
    (
      await request(app)
        .post("/api/admin/login")
        .set("Origin", "https://evil.example")
        .send({})
    ).status,
    403,
  );
});
test("real password and TOTP, replay protection, HttpOnly session and CSRF", async () => {
  assert.equal(
    (
      await agent
        .post("/api/admin/login")
        .send({ email: "rifki", password: "wrong" })
    ).status,
    401,
  );
  const first = await agent
    .post("/api/admin/login")
    .send({ email: "rifki", password });
  assert.equal(first.status, 200);
  assert.equal(first.body.needs2fa, true);
  assert.equal((await agent.get("/api/admin/content")).status, 401);
  assert.equal(
    (await agent.post("/api/admin/login/2fa").send({ code: "bad" })).status,
    401,
  );
  const code = totp.generate(),
    second = await agent.post("/api/admin/login/2fa").send({ code });
  assert.equal(second.status, 200);
  csrf = second.body.csrfToken;
  assert.equal(csrf.length, 64);
  assert.ok(
    (second.headers["set-cookie"] as unknown as string[]).some(
      (s) =>
        s.startsWith("rf_session=") &&
        s.includes("HttpOnly") &&
        s.includes("SameSite=Lax"),
    ),
  );
  assert.equal((await agent.get("/api/admin/me")).body.csrfToken, csrf);
  const other = request.agent(app);
  await other.post("/api/admin/login").send({ email: "rifki", password });
  assert.equal(
    (await other.post("/api/admin/login/2fa").send({ code })).status,
    401,
  );
  assert.equal(
    (await agent.patch("/api/admin/projects/1").send({ title: "No CSRF" }))
      .status,
    403,
  );
});
test("draft isolation, complete diffs, stale review, slug validation, publish and rollback", async () => {
  let review = await agent.get("/api/admin/publish/preview");
  assert.deepEqual(review.body.changes, []);
  const original = (await request(app).get("/api/public/content")).body
    .projects[0].title;
  assert.equal(
    (
      await agent
        .patch("/api/admin/projects/1")
        .set("X-CSRF-Token", csrf)
        .send({ title: "Changed in draft" })
    ).status,
    200,
  );
  assert.equal(
    (await request(app).get("/api/public/content")).body.projects[0].title,
    original,
  );
  review = await agent.get("/api/admin/publish/preview");
  assert.equal(
    review.body.changes[0].fields.find(
      (f: { name: string }) => f.name === "title",
    ).to,
    "Changed in draft",
  );
  await agent
    .patch("/api/admin/projects/1")
    .set("X-CSRF-Token", csrf)
    .send({ description: "Second draft change" });
  assert.equal(
    (
      await agent
        .post("/api/admin/publish")
        .set("X-CSRF-Token", csrf)
        .send({ revision: review.body.revision })
    ).status,
    409,
  );
  review = await agent.get("/api/admin/publish/preview");
  const published = await agent
    .post("/api/admin/publish")
    .set("X-CSRF-Token", csrf)
    .send({ revision: review.body.revision });
  assert.equal(published.status, 200);
  assert.equal(published.body.revalidated, false);
  assert.equal(
    (await request(app).get("/api/public/content")).body.projects[0].title,
    "Changed in draft",
  );
  assert.equal(
    (
      await agent
        .post("/api/admin/snapshots/1/rollback")
        .set("X-CSRF-Token", csrf)
        .send({})
    ).status,
    200,
  );
  assert.equal(
    (await request(app).get("/api/public/content")).body.projects[0].title,
    original,
  );
  assert.equal(
    (await agent.get("/api/admin/content")).body.projects[0].title,
    "Changed in draft",
  );
  for (const patch of [
    { description: "<script>alert(1)</script>" },
    { liveUrl: "javascript:alert(1)" },
    { repoUrl: "http://insecure.example" },
    { imageId: 999999 },
  ])
    assert.equal(
      (
        await agent
          .patch("/api/admin/projects/1")
          .set("X-CSRF-Token", csrf)
          .send(patch)
      ).status,
      400,
    );
  assert.equal(
    (
      await agent
        .patch("/api/admin/projects/2")
        .set("X-CSRF-Token", csrf)
        .send({ slug: "task-manager-app" })
    ).status,
    409,
  );
  const created = await agent
    .post("/api/admin/projects")
    .set("X-CSRF-Token", csrf)
    .send({ title: "New entry" });
  assert.equal(created.status, 201);
  assert.equal(created.body.slug, "new-entry");
  assert.equal(
    (
      await agent
        .put("/api/admin/projects/order")
        .set("X-CSRF-Token", csrf)
        .send({ ids: [1, 1] })
    ).status,
    400,
  );
  assert.equal(
    (
      await agent
        .delete("/api/admin/projects/" + created.body.id)
        .set("X-CSRF-Token", csrf)
    ).status,
    200,
  );
});
test("every content resource supports canonical fields and translations", async () => {
  for (const [resource, data] of Object.entries({
    experience: {
      role: "Test role",
      company: "Example",
      translations: { id: { role: "Peran uji" } },
    },
    certificates: { name: "Test certificate" },
    "stack-groups": { name: "Tools", items: ["TypeScript"] },
    "assistant-presets": {
      question: "Hello?",
      answer: "Hi",
      command: "/hello",
    },
  })) {
    const row = await agent
      .post("/api/admin/" + resource)
      .set("X-CSRF-Token", csrf)
      .send(data);
    assert.equal(row.status, 201, resource);
    assert.equal((await agent.get("/api/admin/" + resource)).status, 200);
    assert.equal(
      (
        await agent
          .delete("/api/admin/" + resource + "/" + row.body.id)
          .set("X-CSRF-Token", csrf)
      ).status,
      200,
    );
  }
  const settings = await agent.get("/api/admin/settings");
  assert.equal(
    (
      await agent
        .put("/api/admin/settings")
        .set("X-CSRF-Token", csrf)
        .send({ ...settings.body, availability: "Open for projects" })
    ).status,
    200,
  );
});
test("contact reaches owner inbox, normalizes phone, enforces consent, read/delete and honeypot", async () => {
  const message = {
    name: "Integration Visitor",
    email: "visitor@example.com",
    phone: "0812 3456 7890",
    message: "A real integration test message.",
    consent: true,
  };
  assert.equal(contactSubmissionSchema.parse(message).phone, "+6281234567890");
  for (const input of [
    { ...message, consent: false },
    { ...message, message: "<b>invalid message</b>" },
    { ...message, phone: "invalid" },
  ])
    assert.equal(
      (await request(app).post("/api/contact").send(input)).status,
      400,
    );
  assert.equal(
    (await request(app).post("/api/contact").send(message)).status,
    201,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/contact")
        .send({ ...message, website: "spam" })
    ).status,
    202,
  );
  let inbox = await agent.get("/api/admin/messages");
  assert.equal(inbox.body.total, 1);
  assert.equal(inbox.body.items[0].phone, "+6281234567890");
  assert.equal(inbox.body.unread, 1);
  const id = inbox.body.items[0].id;
  await agent
    .patch("/api/admin/messages/" + id)
    .set("X-CSRF-Token", csrf)
    .send({ read: true });
  inbox = await agent.get("/api/admin/messages");
  assert.equal(inbox.body.unread, 0);
  const [rows] = await root.query<mysql.RowDataPacket[]>(
    "SELECT ip_hash FROM messages",
  );
  assert.match(rows[0].ip_hash, /^[a-f0-9]{64}$/);
  assert.equal(
    (await agent.delete("/api/admin/messages/" + id).set("X-CSRF-Token", csrf))
      .status,
    200,
  );
});
test("image verification, WebP conversion, resize, metadata removal and reference protection", async () => {
  assert.equal(
    (
      await agent
        .post("/api/admin/media")
        .set("X-CSRF-Token", csrf)
        .attach(
          "file",
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
          { filename: "fake.png", contentType: "image/png" },
        )
    ).status,
    400,
  );
  const png = await sharp({
      create: { width: 1800, height: 900, channels: 3, background: "#f5b800" },
    })
      .png()
      .toBuffer(),
    upload = await agent
      .post("/api/admin/media")
      .set("X-CSRF-Token", csrf)
      .field("alt", "Test image")
      .attach("file", png, "test.png");
  assert.equal(upload.status, 201);
  assert.equal(upload.body.mime, "image/webp");
  assert.equal(upload.body.width, 1600);
  assert.equal(
    (
      await sharp(
        await readFile(
          path.join(process.env.UPLOAD_DIR!, upload.body.filename),
        ),
      ).metadata()
    ).exif,
    undefined,
  );
  const update = await agent
    .patch("/api/admin/projects/1")
    .set("X-CSRF-Token", csrf)
    .send({
      imageId: upload.body.id,
      imageUrl: "https://wrong.example/image.png",
    });
  assert.equal(update.status, 200);
  assert.equal(update.body.imageUrl, upload.body.url);
  assert.equal(
    (
      await agent
        .delete("/api/admin/media/" + upload.body.id)
        .set("X-CSRF-Token", csrf)
    ).status,
    409,
  );
  await agent
    .patch("/api/admin/projects/1")
    .set("X-CSRF-Token", csrf)
    .send({ imageId: null, imageUrl: "" });
  assert.equal(
    (
      await agent
        .delete("/api/admin/media/" + upload.body.id)
        .set("X-CSRF-Token", csrf)
    ).status,
    200,
  );
  assert.equal(
    (
      await agent
        .post("/api/admin/media")
        .set("X-CSRF-Token", csrf)
        .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), {
          filename: "large.png",
          contentType: "image/png",
        })
    ).status,
    413,
  );
});
test("analytics count daily uniques once, strip queries/referrer details, ignore bots and DNT", async () => {
  const ua = "Mozilla/5.0 Integration Browser";
  for (const path of ["/", "/?secret=private", "/projects"])
    assert.equal(
      (
        await request(app)
          .post("/api/track")
          .set("User-Agent", ua)
          .send({ path, referrer: "https://example.com/private?secret=hidden" })
      ).status,
      204,
    );
  await request(app)
    .post("/api/track")
    .set("User-Agent", ua)
    .set("DNT", "1")
    .send({ path: "/projects/task-manager-app" });
  await request(app)
    .post("/api/track")
    .set("User-Agent", "Googlebot")
    .send({ path: "/" });
  const stats = await agent.get("/api/admin/analytics");
  assert.equal(stats.status, 200);
  assert.equal(stats.body.today, 1);
  assert.equal(stats.body.daily.at(-1).views, 3);
  assert.equal(stats.body.referrers[0].source, "example.com");
  assert.equal(
    stats.body.topPages.find((p: { path: string }) => p.path === "/").views,
    2,
  );
});
test("successful passwords do not consume the limit; fourth failed login and fourth contact submission are throttled", async () => {
  for (let i = 0; i < 4; i++)
    assert.equal(
      (
        await request(limited)
          .post("/api/admin/login")
          .send({ email: "owner@test.example", password })
      ).status,
      200,
    );
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await request(limited)
          .post("/api/admin/login")
          .send({ email: "unknown@example.com", password: "bad" })
      ).status,
      401,
    );
  const blocked = await request(limited)
    .post("/api/admin/login")
    .send({ email: "unknown@example.com", password: "bad" });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.body.retryAfter > 0 && blocked.body.retryAfter <= 900);
  assert.equal(Number(blocked.headers["retry-after"]), blocked.body.retryAfter);
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await request(limited).post("/api/contact").send({
          name: "Limited",
          email: "limited@example.com",
          message: "Throttle test message",
          consent: true,
        })
      ).status,
      201,
    );
  assert.equal(
    (
      await request(limited).post("/api/contact").send({
        name: "Limited",
        email: "limited@example.com",
        message: "Throttle test message",
        consent: true,
      })
    ).status,
    429,
  );
});
test("owner credentials require CSRF, current password and fresh TOTP, rotate sessions and support edited username/email", async () => {
  const account = await agent.get("/api/admin/credentials");
  assert.equal(account.status, 200);
  assert.equal(account.body.username, "rifki");
  assert.equal(account.body.totpEnabled, true);
  assert.match(account.headers["cache-control"], /no-store/);
  assert.deepEqual(Object.keys(account.body).sort(), [
    "email",
    "totpEnabled",
    "username",
  ]);
  assert.equal((await request(app).get("/api/admin/credentials")).status, 401);
  const nextPassword = "Updated-owner-password!123";
  const input = {
    username: "new-owner",
    email: "changed@test.example",
    newPassword: nextPassword,
    currentPassword: password,
    code: totp.generate({ timestamp: Date.now() + 30_000 }),
  };
  assert.equal(
    (await agent.patch("/api/admin/credentials").send(input)).status,
    403,
  );
  assert.equal(
    (
      await agent
        .patch("/api/admin/credentials")
        .set("X-CSRF-Token", csrf)
        .set("Origin", "https://evil.example")
        .send(input)
    ).status,
    403,
  );
  for (const patch of [
    { currentPassword: "wrong" },
    { code: "bad" },
    { username: "a" },
    { newPassword: "short" },
    { email: "invalid" },
  ])
    assert.equal(
      (
        await agent
          .patch("/api/admin/credentials")
          .set("X-CSRF-Token", csrf)
          .send({ ...input, ...patch })
      ).status,
      400,
    );
  assert.equal(
    (await agent.get("/api/admin/credentials")).body.username,
    "rifki",
  );
  const [before] = await root.query<mysql.RowDataPacket[]>(
    "SELECT id FROM users LIMIT 1",
  );
  await connection.db
    .insert((await import("./db/schema.js")).sessions)
    .values({
      tokenHash: "f".repeat(64),
      userId: before[0].id,
      csrfToken: "e".repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
  const updated = await agent
    .patch("/api/admin/credentials")
    .set("X-CSRF-Token", csrf)
    .send(input);
  assert.equal(updated.status, 200);
  assert.notEqual(updated.body.csrfToken, csrf);
  const oldCsrf = csrf;
  csrf = updated.body.csrfToken;
  assert.equal((await agent.get("/api/admin/me")).body.email, input.email);
  const [counts] = await root.query<mysql.RowDataPacket[]>(
    "SELECT (SELECT COUNT(*) FROM sessions) AS sessions, (SELECT COUNT(*) FROM login_challenges) AS challenges",
  );
  assert.equal(counts[0].sessions, 1);
  assert.equal(counts[0].challenges, 0);
  assert.equal(
    (
      await agent
        .patch("/api/admin/credentials")
        .set("X-CSRF-Token", oldCsrf)
        .send(input)
    ).status,
    403,
  );
  assert.equal(
    (
      await agent
        .patch("/api/admin/credentials")
        .set("X-CSRF-Token", csrf)
        .send({ ...input, currentPassword: nextPassword })
    ).status,
    409,
  );
  for (const login of [input.username, input.email])
    assert.equal(
      (
        await request(app)
          .post("/api/admin/login")
          .send({ email: login, password: nextPassword })
      ).status,
      200,
    );
  for (const login of ["rifki", "owner@test.example"])
    assert.equal(
      (
        await request(app)
          .post("/api/admin/login")
          .send({ email: login, password: nextPassword })
      ).status,
      401,
    );
  assert.equal(
    (
      await request(app)
        .post("/api/admin/login")
        .send({ email: input.email, password })
    ).status,
    401,
  );
  // Simulate a fresh code interval in this disposable database to exercise keeping the password.
  await root.query("UPDATE users SET last_totp_step=0");
  const kept = await agent
    .patch("/api/admin/credentials")
    .set("X-CSRF-Token", csrf)
    .send({
      ...input,
      newPassword: "",
      currentPassword: nextPassword,
      code: totp.generate(),
    });
  assert.equal(kept.status, 200);
  csrf = kept.body.csrfToken;
  assert.equal(
    (
      await request(app)
        .post("/api/admin/login")
        .send({ email: input.username, password: nextPassword })
    ).status,
    200,
  );
  const [log] = await root.query<mysql.RowDataPacket[]>(
    "SELECT meta FROM audit_log WHERE action='credentials_updated'",
  );
  assert.equal(log.length, 2);
  assert.ok(log.every((row) => row.meta === null));
});

test("retention removes expired personal data and sessions, preserves aggregate counts", async () => {
  await root.query(
    "UPDATE messages SET created_at = DATE_SUB(NOW(), INTERVAL 366 DAY)",
  );
  await root.query("UPDATE visitors_daily SET day = '2020-01-01'");
  const { maintenance } = await import("./services/maintenance.js");
  await maintenance();
  assert.equal((await agent.get("/api/admin/messages")).body.total, 0);
  assert.equal((await agent.get("/api/admin/analytics")).body.today, 1);
  await root.query(
    "UPDATE sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR)",
  );
  assert.equal((await agent.get("/api/admin/me")).status, 401);
});
