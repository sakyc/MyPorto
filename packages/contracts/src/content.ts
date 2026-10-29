import { z } from "zod";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => !/<[^>]*>/.test(value),
      "Use plain text, without HTML tags.",
    );
const url = z.union([
  z.literal(""),
  z.url().refine((value) => value.startsWith("https://"), "Use an HTTPS URL."),
]);
const translations = z
  .object({ id: z.record(z.string(), text(4000)).default({}) })
  .default({ id: {} });
const imageUrl = z
  .string()
  .max(1000)
  .refine(
    (value) =>
      !value ||
      value.startsWith("https://") ||
      /^\/design\/[a-zA-Z0-9._/-]+$/.test(value) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/media\/[a-f0-9]+\.webp$/.test(
        value,
      ),
    "Use an uploaded image or an HTTPS image URL.",
  );
const common = {
  id: z.number().int().positive().optional(),
  sort: z.number().int().min(0).default(0),
  translations,
};
export const categoryKeys = [
  "php",
  "javascript",
  "mobile",
  "website",
  "web-app",
  "desktop",
  "api",
  "devops",
] as const;
export const projectSchema = z
  .object({
    ...common,
    slug: z
      .string()
      .max(140)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: text(120).min(1),
    description: text(600).default(""),
    role: text(120).default(""),
    type: text(80).default("web app"),
    contribution: text(2000).default(""),
    challenge: text(2000).default(""),
    results: text(2000).default(""),
    tech: text(200).default(""),
    categories: z.array(z.enum(categoryKeys)).max(8).default([]),
    status: z.enum(["draft", "published"]).default("draft"),
    featured: z.boolean().default(false),
    featuredOrder: z.number().int().min(0).default(0),
    isExample: z.boolean().default(true),
    imageId: z.number().int().positive().nullable().default(null),
    imageUrl: imageUrl.default(""),
    liveUrl: url.default(""),
    repoUrl: url.default(""),
  })
  .strict();
export const experienceSchema = z
  .object({
    ...common,
    role: text(120).min(1),
    company: text(120).default(""),
    period: text(80).default(""),
    description: text(2000).default(""),
    isExample: z.boolean().default(true),
  })
  .strict();
export const certificateSchema = z
  .object({
    ...common,
    name: text(120).min(1),
    issuer: text(120).default(""),
    year: text(20).default(""),
    credentialId: text(120).default(""),
    credentialUrl: url.default(""),
    imageId: z.number().int().positive().nullable().default(null),
    imageUrl: imageUrl.default(""),
    isExample: z.boolean().default(true),
  })
  .strict();
export const stackSchema = z
  .object({
    ...common,
    name: text(120).min(1),
    items: z.array(text(100).min(1)).max(40).default([]),
  })
  .strict();
export const assistantSchema = z
  .object({
    ...common,
    question: text(200).min(1),
    answer: text(800).default(""),
    command: z
      .string()
      .max(80)
      .regex(/^\/[a-z0-9-]*$/)
      .default("/hello"),
    label: text(80).default("Say hello"),
    goSection: z
      .enum([
        "",
        "about",
        "stack",
        "projects",
        "experience",
        "certificates",
        "contact",
      ])
      .default(""),
  })
  .strict();
export const resourceSchemas = {
  projects: projectSchema,
  experience: experienceSchema,
  certificates: certificateSchema,
  "stack-groups": stackSchema,
  "assistant-presets": assistantSchema,
};
export const resourceNames = [
  "projects",
  "experience",
  "certificates",
  "stack-groups",
  "assistant-presets",
] as const;
export type ResourceName = (typeof resourceNames)[number];
export type Project = z.infer<typeof projectSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Certificate = z.infer<typeof certificateSchema>;
export type StackGroup = z.infer<typeof stackSchema>;
export type AssistantPreset = z.infer<typeof assistantSchema>;
export type ContentEntry =
  Project | Experience | Certificate | StackGroup | AssistantPreset;
export const settingsSchema = z
  .object({
    siteTitle: text(160).default("Rifki Fadhil — Fullstack Developer"),
    availability: text(200).default(""),
    profile: z.object({
      name: text(120),
      firstName: text(60),
      lastName: text(60),
      role: text(120),
      location: text(120),
      description: text(600),
      aboutCopy: text(2000),
      portraitUrl: imageUrl.default(""),
    }),
    contact: z
      .array(
        z.object({
          label: text(80),
          value: text(254),
          url: z
            .string()
            .max(1000)
            .refine(
              (value) => !value || /^(https:\/\/|mailto:)/.test(value),
              "Use HTTPS or mailto.",
            ),
          isExample: z.boolean(),
        }),
      )
      .max(10),
    translations,
    copy: z
      .record(z.string(), z.object({ en: text(4000), id: text(4000) }))
      .default({}),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const contentSchema = z.object({
  projects: z.array(projectSchema),
  experience: z.array(experienceSchema),
  certificates: z.array(certificateSchema),
  stack: z.array(stackSchema),
  assistant: z.array(assistantSchema),
  settings: settingsSchema,
});
export type SiteContent = z.infer<typeof contentSchema>;
export interface Message {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  body: string;
  consent: boolean;
  read: boolean;
  createdAt: string;
}
export interface Media {
  id: number;
  url: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  alt: string;
}
export interface DiffChange {
  kind: "new" | "modified" | "deleted";
  entity: string;
  slug: string;
  fields: { name: string; from: unknown; to: unknown }[];
}
export interface PublishPreview {
  changes: DiffChange[];
  revalidate: string[];
  revision: string;
}
export interface SnapshotInfo {
  version: number;
  commitHash: string;
  summary: DiffChange[];
  publishedAt: string;
}
export interface Analytics {
  today: number;
  last7: number;
  total: number;
  daily: { day: string; uniques: number; views: number }[];
  topPages: { path: string; views: number }[];
  referrers: { source: string; views: number }[];
}
