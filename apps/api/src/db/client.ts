import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { config } from "../config.js";
import * as schema from "./schema.js";

if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required.");
export const pool = mysql.createPool({
  uri: config.DATABASE_URL,
  connectionLimit: 10,
  timezone: "Z",
  enableKeepAlive: true,
});
// Align TIMESTAMP defaults, SQL NOW(), and JS dates on non-UTC MySQL hosts.
pool.pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});
export const db = drizzle(pool, { schema, mode: "default" });
export type Database = MySql2Database<typeof schema>;
export type Executor = Pick<
  Database,
  "select" | "insert" | "update" | "delete" | "execute"
>;
