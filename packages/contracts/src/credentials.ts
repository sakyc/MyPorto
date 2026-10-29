import { z } from "zod";

export const verificationMethodSchema = z.enum(["totp", "pin"]);
export type VerificationMethod = z.infer<typeof verificationMethodSchema>;

export const ownerCredentialsSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9][a-z0-9_.-]{2,31}$/,
        "Use 3–32 letters, numbers, dots, underscores or hyphens.",
      ),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email())
      .pipe(z.string().max(254)),
    newPassword: z
      .union([
        z.literal(""),
        z.string().min(12, "Use at least 12 characters.").max(128),
      ])
      .default(""),
    currentPassword: z.string().min(1, "Enter your current password.").max(256),
    verificationMethod: verificationMethodSchema.optional(),
    newPin: z.union([z.literal(""), z.string().regex(/^\d{6}$/, "Use a six-digit PIN.")]).default(""),
    authenticatorCode: z.union([z.literal(""), z.string().regex(/^\d{6}$/, "Enter the six-digit authenticator code.")]).default(""),
    code: z
      .string()
      .regex(/^\d{6}$/, "Enter your current six-digit verification code."),
  })
  .strict();

export type OwnerCredentialsInput = z.infer<typeof ownerCredentialsSchema>;
export interface OwnerCredentials {
  username: string;
  email: string;
  totpEnabled: boolean;
  verificationMethod: VerificationMethod;
  pinConfigured: boolean;
}

export const authenticatorQrSchema = z.object({
  currentPassword: z.string().min(1).max(256),
}).strict();

export interface AuthenticatorQr {
  qrDataUrl: string;
  email: string;
}
