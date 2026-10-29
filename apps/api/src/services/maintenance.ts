import { lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { messages, visitors, sessions, challenges } from "../db/schema.js";

export async function maintenance() {
  const now = Date.now();
  await db
    .delete(messages)
    .where(lt(messages.createdAt, new Date(now - 365 * 86400_000)));
  await db
    .delete(visitors)
    .where(
      lt(
        visitors.day,
        new Date(now - 2 * 86400_000).toISOString().slice(0, 10),
      ),
    );
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.delete(challenges).where(lt(challenges.expiresAt, new Date()));
}
