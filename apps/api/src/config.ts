import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  ANALYTICS_SALT_SECRET: z.string().min(32),
  REVALIDATE_SECRET: z.string().min(32),
  REVALIDATE_URL: z.url().optional(),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  API_PUBLIC_URL: z.url().default("http://localhost:4000"),
  OWNER_EMAIL: z.email().default("owner@nuansua.local"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAME_SITE: z.enum(["lax", "none"]).default("lax"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  // Report field names, never potentially sensitive environment values.
  throw new Error(
    `Invalid environment fields: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
  );
}
export const config = result.data;
