import { z } from "zod";
export * from "./content.js";
export * from "./credentials.js";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("rf-api"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Validation shared by the Contact UI and its Express endpoint.
const plainText = (value: string) => !/<[^>]*>/.test(value);
export const contactSubmissionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please add your name (up to 80 characters).")
    .max(80, "Please add your name (up to 80 characters).")
    .refine(plainText, "Please use plain text, without HTML tags."),
  email: z
    .email("Please enter a valid email address.")
    .max(254, "Please enter a valid email address."),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .default("")
    .transform((value) => {
      let phone = value.replace(/[\s().-]/g, "");
      if (!phone) return "";
      if (phone.startsWith("00")) phone = "+" + phone.slice(2);
      else if (phone.startsWith("0")) phone = "+62" + phone.slice(1);
      else if (/^62\d+$/.test(phone)) phone = "+" + phone;
      else if (/^\d+$/.test(phone)) phone = "+62" + phone;
      return phone;
    })
    .refine(
      (value) => !value || /^\+[1-9]\d{7,14}$/.test(value),
      "Please use a valid phone number, like +62 812 3456 7890.",
    ),
  message: z
    .string()
    .trim()
    .min(10, "Please write between 10 and 2,000 characters.")
    .max(2000, "Please write between 10 and 2,000 characters.")
    .refine(plainText, "Please use plain text, without HTML tags."),
  consent: z.literal(true, {
    error: "Please tick the box so I can use your details to reply.",
  }),
  website: z.string().max(200).optional().default(""),
});

export type ContactSubmission = z.input<typeof contactSubmissionSchema>;
