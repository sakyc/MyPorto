import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { contentSchema, type ResourceName } from "@rf/contracts";
import { db, pool } from "./client.js";
import { users, settings, snapshots, projects } from "./schema.js";
import { resourceTables } from "../services/content.js";
import { encrypt } from "../auth/crypto.js";
import { config } from "../config.js";
import source from "./seed-content.json" with { type: "json" };

async function seed() {
  const data = contentSchema.parse(source);
  const [setting] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!setting) {
    await db.transaction(async (tx) => {
      await tx.insert(settings).values({ id: 1, data: data.settings });
      const groups: [
        ResourceName,
        (
          | typeof data.projects
          | typeof data.experience
          | typeof data.certificates
          | typeof data.stack
          | typeof data.assistant
        ),
      ][] = [
        ["projects", data.projects],
        ["experience", data.experience],
        ["certificates", data.certificates],
        ["stack-groups", data.stack],
        ["assistant-presets", data.assistant],
      ];
      for (const [resource, entries] of groups)
        for (const entry of entries) {
          const payload = { ...entry } as Record<string, unknown>;
          delete payload.id;
          if (resource === "projects")
            await tx.insert(projects).values({
              id: entry.id,
              slug: (entry as (typeof data.projects)[number]).slug,
              data: payload,
              sort: entry.sort,
            });
          else
            await tx
              .insert(resourceTables[resource])
              .values({ id: entry.id, data: payload, sort: entry.sort });
        }
      await tx.insert(snapshots).values({
        payload: data,
        commitHash: randomBytes(6).toString("hex"),
        summary: [],
      });
    });
    console.info("Initial example content and published snapshot created.");
  } else
    console.info(
      "Content already exists; existing drafts and publications were preserved.",
    );
  const [owner] = await db
    .select()
    .from(users)
    .limit(1);
  if (!owner) {
    const password = randomBytes(24).toString("base64url"),
      secret = new Secret({ size: 20 }).base32;
    const totp = new TOTP({
      issuer: "Nuansua Portfolio",
      label: config.OWNER_EMAIL,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });
    const passwordHash = await hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await db.insert(users).values({
      email: config.OWNER_EMAIL,
      passwordHash,
      totpSecret: encrypt(secret),
    });
    const local = path.resolve("../../.local");
    await mkdir(local, { recursive: true });
    await writeFile(
      path.join(local, "owner-access.json"),
      JSON.stringify(
        {
          email: config.OWNER_EMAIL,
          username: "rifki",
          password,
          totpSecret: secret,
          otpauthUrl: totp.toString(),
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    await QRCode.toFile(path.join(local, "owner-2fa.png"), totp.toString(), {
      width: 360,
      margin: 2,
    });
    await writeFile(
      path.join(local, "OWNER-ACCESS.md"),
      `# Akses pemilik lokal\n\nLogin: ${config.OWNER_EMAIL} (atau rifki)\n\nPassword: ${password}\n\nScan owner-2fa.png memakai aplikasi authenticator untuk kode enam digit. Secret manual ada di owner-access.json. Simpan file ini secara privat; jangan unggah atau commit ke Git.\n\nDB memakai akun aplikasi terpisah. Akun root MySQL lokal tidak diubah. Sebelum deploy, ganti email pemilik dengan alamatmu lewat perintah owner setup dan gunakan rahasia produksi terpisah.\n`,
      { mode: 0o600 },
    );
    console.info(
      "Owner created. Private credentials and authenticator enrollment saved in .local/OWNER-ACCESS.md and .local/owner-2fa.png.",
    );
  } else console.info("Owner already exists; password and 2FA were preserved.");
}
seed()
  .catch((error) => {
    console.error("Seed failed:", error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
