import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { z } from "zod";
import { db, pool } from "./client.js";
import { users, sessions, challenges } from "./schema.js";
import { encrypt } from "../auth/crypto.js";

// Local-console recovery only. No HTTP reset endpoint and no password in argv.
async function rotate() {
  const email = z.email().parse(process.argv[2]);
  const output = path.resolve(
    process.argv[3] || "../../.local/recovered-owner",
  );
  const password = randomBytes(24).toString("base64url"),
    secret = new Secret({ size: 20 }).base32;
  const totp = new TOTP({
    issuer: "Nuansua Portfolio",
    label: email,
    secret,
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  });
  const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await mkdir(output, { recursive: true, mode: 0o700 });
  // Save recovery credentials first; refuse to overwrite an earlier enrollment.
  await writeFile(
    path.join(output, "owner-access.json"),
    JSON.stringify(
      {
        email,
        username: email,
        password,
        totpSecret: secret,
        otpauthUrl: totp.toString(),
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  await QRCode.toFile(path.join(output, "owner-2fa.png"), totp.toString(), {
    width: 360,
  });
  await db.transaction(async (tx) => {
    await tx.delete(sessions);
    await tx.delete(challenges);
    const existing = await tx.select().from(users);
    if (existing.length) {
      await tx.delete(users);
    }
    await tx
      .insert(users)
      .values({ email, passwordHash, totpSecret: encrypt(secret) });
  });
  console.info(
    "Owner credentials rotated and all sessions revoked. Private enrollment saved in the requested output directory. Set OWNER_EMAIL to the same email before restarting the API.",
  );
}
rotate()
  .catch((error) => {
    console.error(
      "Owner recovery failed:",
      error.code || "Check email, output directory, and database connection.",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
