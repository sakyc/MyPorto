import {
  boolean,
  char,
  index,
  int,
  json,
  mysqlTable,
  timestamp,
  varchar,
  text,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import type { SiteContent, Settings, DiffChange } from "@rf/contracts";

const stamp = () => ({
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
const entries = (name: string) =>
  mysqlTable(name, {
    id: int("id").autoincrement().primaryKey(),
    data: json("data").$type<Record<string, unknown>>().notNull(),
    sort: int("sort").default(0).notNull(),
    ...stamp(),
  });
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  data: json("data").$type<Record<string, unknown>>().notNull(),
  sort: int("sort").default(0).notNull(),
  ...stamp(),
});
export const experience = entries("experience");
export const certificates = entries("certificates");
export const stackGroups = entries("stack_groups");
export const assistantPresets = entries("assistant_presets");
export const settings = mysqlTable("settings", {
  id: int("id").primaryKey(),
  data: json("data").$type<Settings>().notNull(),
  ...stamp(),
});
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 32 })
    .notNull()
    .default("rifki")
    .unique(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  totpSecret: text("totp_secret").notNull(),
  lastTotpStep: int("last_totp_step").default(0).notNull(),
  failedLogins: int("failed_logins").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  ...stamp(),
});
export const sessions = mysqlTable(
  "sessions",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    csrfToken: char("csrf_token", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("sessions_expiry_idx").on(table.expiresAt)],
);
export const challenges = mysqlTable("login_challenges", {
  tokenHash: char("token_hash", { length: 64 }).primaryKey(),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: int("attempts").default(0).notNull(),
});
export const snapshots = mysqlTable("snapshots", {
  version: int("version").autoincrement().primaryKey(),
  payload: json("payload").$type<SiteContent>().notNull(),
  commitHash: char("commit_hash", { length: 12 }).notNull(),
  summary: json("summary").$type<DiffChange[]>().notNull(),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
});
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 80 }).notNull(),
  entityId: varchar("entity_id", { length: 140 }),
  meta: json("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const media = mysqlTable("media", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 100 }).notNull().unique(),
  mime: varchar("mime", { length: 40 }).notNull(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  bytes: int("bytes").notNull(),
  alt: varchar("alt", { length: 250 }).default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const pageViews = mysqlTable(
  "page_views_daily",
  {
    id: int("id").autoincrement().primaryKey(),
    day: char("day", { length: 10 }).notNull(),
    path: varchar("path", { length: 200 }).notNull(),
    views: int("views").default(0).notNull(),
    uniques: int("uniques").default(0).notNull(),
  },
  (table) => [uniqueIndex("page_day_path_idx").on(table.day, table.path)],
);
export const referrers = mysqlTable(
  "referrers_daily",
  {
    id: int("id").autoincrement().primaryKey(),
    day: char("day", { length: 10 }).notNull(),
    source: varchar("source", { length: 200 }).notNull(),
    views: int("views").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("referrer_day_source_idx").on(table.day, table.source),
  ],
);
export const visitors = mysqlTable(
  "visitors_daily",
  {
    id: int("id").autoincrement().primaryKey(),
    day: char("day", { length: 10 }).notNull(),
    visitorHash: char("visitor_hash", { length: 64 }).notNull(),
    path: varchar("path", { length: 200 }).notNull(),
  },
  (table) => [
    uniqueIndex("visitor_day_hash_path_idx").on(
      table.day,
      table.visitorHash,
      table.path,
    ),
  ],
);
