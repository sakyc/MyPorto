import { verify } from "@node-rs/argon2";
import { TOTP } from "otpauth";
import { decrypt } from "./crypto.js";
import type { users } from "../db/schema.js";

export async function checkVerification(owner: typeof users.$inferSelect, code: string) {
  if (owner.verificationMethod === "pin") {
    const valid = !!owner.pinHash && await verify(owner.pinHash, code).catch(() => false);
    return { valid, replay: false, step: owner.lastTotpStep };
  }
  const totp = new TOTP({ secret: decrypt(owner.totpSecret), digits: 6, period: 30, algorithm: "SHA1" });
  const delta = totp.validate({ token: code, window: 1 });
  const step = Math.floor(Date.now() / 30_000) + (delta ?? 0);
  const replay = delta !== null && step <= owner.lastTotpStep;
  return { valid: delta !== null && !replay, replay, step };
}
