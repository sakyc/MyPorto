import { and, asc, desc, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import {
  resourceNames,
  resourceSchemas,
  settingsSchema,
  contentSchema,
  type ResourceName,
  type SiteContent,
  type ContentEntry,
  type PublishPreview,
  type DiffChange,
} from "@rf/contracts";
import { db, type Executor } from "../db/client.js";
import {
  projects,
  experience,
  certificates,
  stackGroups,
  assistantPresets,
  settings,
  snapshots,
  auditLog,
  media,
} from "../db/schema.js";
import { HttpError } from "../lib/http.js";
import { config } from "../config.js";

export const resourceTables = {
  projects,
  experience,
  certificates,
  "stack-groups": stackGroups,
  "assistant-presets": assistantPresets,
};
export async function entries(resource: ResourceName, executor: Executor = db) {
  const table = resourceTables[resource];
  const rows = await executor
    .select({ id: table.id, data: table.data, sort: table.sort })
    .from(table)
    .orderBy(asc(table.sort), asc(table.id));
  return rows.map((row) => ({
    ...row.data,
    id: row.id,
    sort: row.sort,
  })) as ContentEntry[];
}
export async function draft(executor: Executor = db): Promise<SiteContent> {
  const [p, e, c, s, a, [setting]] = await Promise.all([
    entries("projects", executor),
    entries("experience", executor),
    entries("certificates", executor),
    entries("stack-groups", executor),
    entries("assistant-presets", executor),
    executor.select().from(settings).where(eq(settings.id, 1)),
  ]);
  if (!setting)
    throw new HttpError(
      503,
      "Content is not initialized. Run the seed command.",
    );
  return contentSchema.parse({
    projects: p,
    experience: e,
    certificates: c,
    stack: s,
    assistant: a,
    settings: setting.data,
  });
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export const revision = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
export async function latest(executor: Executor = db) {
  const [snapshot] = await executor
    .select()
    .from(snapshots)
    .orderBy(desc(snapshots.version))
    .limit(1);
  if (!snapshot) throw new HttpError(503, "No published content yet.");
  return snapshot;
}
export function published(content: SiteContent): SiteContent {
  return {
    ...content,
    projects: content.projects.filter(
      (project) => project.status === "published",
    ),
  };
}
const groups = [
  "projects",
  "experience",
  "certificates",
  "stack",
  "assistant",
] as const;
export function diff(previous: SiteContent, next: SiteContent): DiffChange[] {
  const changes: DiffChange[] = [];
  for (const group of groups) {
    const before = previous[group],
      after = next[group];
    for (const entry of after) {
      const old = before.find((item) => item.id === entry.id);
      const object = entry as unknown as Record<string, unknown>,
        prior = old as unknown as Record<string, unknown> | undefined;
      const fields = Object.keys(object)
        .filter(
          (key) =>
            key !== "id" &&
            revision(prior?.[key] ?? null) !== revision(object[key] ?? null),
        )
        .map((name) => ({
          name,
          from: prior?.[name] ?? null,
          to: object[name],
        }));
      if (fields.length)
        changes.push({
          kind: old ? "modified" : "new",
          entity: group,
          slug: String(
            object.slug ||
              object.title ||
              object.name ||
              object.role ||
              object.question ||
              entry.id,
          ),
          fields,
        });
    }
    for (const entry of before)
      if (!after.some((item) => item.id === entry.id))
        changes.push({
          kind: "deleted",
          entity: group,
          slug: String((entry as { slug?: string }).slug || entry.id),
          fields: [{ name: "entry", from: entry, to: null }],
        });
  }
  const fields = Object.keys(next.settings)
    .filter(
      (key) =>
        revision(previous.settings[key as keyof typeof previous.settings]) !==
        revision(next.settings[key as keyof typeof next.settings]),
    )
    .map((name) => ({
      name,
      from: previous.settings[name as keyof typeof previous.settings],
      to: next.settings[name as keyof typeof next.settings],
    }));
  if (fields.length)
    changes.push({
      kind: "modified",
      entity: "settings",
      slug: "profile",
      fields,
    });
  return changes;
}
export function pathsFor(...contents: SiteContent[]) {
  return [
    ...new Set([
      "/",
      "/projects",
      ...contents.flatMap((content) =>
        content.projects.map((project) => "/projects/" + project.slug),
      ),
    ]),
  ];
}
export async function preview(
  executor: Executor = db,
): Promise<PublishPreview> {
  const [current, snapshot] = await Promise.all([
    draft(executor),
    latest(executor),
  ]);
  return {
    changes: diff(snapshot.payload, published(current)),
    revalidate: pathsFor(snapshot.payload, current),
    revision: revision(current),
  };
}
export async function lockContent(executor: Executor) {
  await executor
    .select({ id: settings.id })
    .from(settings)
    .where(eq(settings.id, 1))
    .for("update");
}
export async function save(
  resource: ResourceName,
  id: number | null,
  input: Record<string, unknown>,
) {
  return db.transaction(async (tx) => {
    await lockContent(tx);
    const existing = id
      ? (await entries(resource, tx)).find((entry) => entry.id === id)
      : undefined;
    if (id && !existing) throw new HttpError(404, "Entry not found.");
    const candidate: Record<string, unknown> = { ...existing, ...input };
    if (
      (resource === "projects" || resource === "certificates") &&
      candidate.imageId
    ) {
      const id = Number(candidate.imageId);
      if (!Number.isSafeInteger(id) || id < 1)
        throw new HttpError(400, "Choose a valid uploaded image.");
      const [image] = await tx.select().from(media).where(eq(media.id, id));
      if (!image)
        throw new HttpError(400, "This uploaded image no longer exists.");
      candidate.imageUrl =
        config.API_PUBLIC_URL.replace(/\/$/, "") + "/media/" + image.filename;
    }
    if (resource === "projects" && !candidate.slug) {
      const base =
        String(candidate.title || "untitled")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 125) || "untitled";
      let slug = base,
        suffix = 2;
      while (
        (
          await tx
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.slug, slug))
        ).some((row) => row.id !== id)
      )
        slug = base + "-" + suffix++;
      candidate.slug = slug;
    }
    const data = resourceSchemas[resource].parse(candidate);
    const payload = { ...data } as Record<string, unknown>;
    delete payload.id;
    let entryId = id;
    if (resource === "projects") {
      const value = {
        data: payload,
        sort: data.sort,
        slug: (data as { slug: string }).slug,
      };
      if (id) await tx.update(projects).set(value).where(eq(projects.id, id));
      else {
        const [created] = await tx.insert(projects).values(value);
        entryId = created.insertId;
      }
    } else {
      const table = resourceTables[resource];
      if (id)
        await tx
          .update(table)
          .set({ data: payload, sort: data.sort })
          .where(eq(table.id, id));
      else {
        const [created] = await tx
          .insert(table)
          .values({ data: payload, sort: data.sort });
        entryId = created.insertId;
      }
    }
    await tx.insert(auditLog).values({
      action: id ? "update" : "create",
      entity: resource,
      entityId: String(entryId),
    });
    return { ...data, id: entryId! };
  });
}
export async function remove(resource: ResourceName, id: number) {
  return db.transaction(async (tx) => {
    await lockContent(tx);
    const table = resourceTables[resource];
    const [result] = await tx.delete(table).where(eq(table.id, id));
    if (!result.affectedRows) throw new HttpError(404, "Entry not found.");
    await tx
      .insert(auditLog)
      .values({ action: "delete", entity: resource, entityId: String(id) });
  });
}
export async function reorder(resource: ResourceName, ids: number[]) {
  await db.transaction(async (tx) => {
    await lockContent(tx);
    const current = await entries(resource, tx);
    if (
      new Set(ids).size !== current.length ||
      ids.length !== current.length ||
      current.some((entry) => !ids.includes(entry.id!))
    )
      throw new HttpError(400, "Provide every entry ID once.");
    const table = resourceTables[resource];
    for (let sort = 0; sort < ids.length; sort++)
      await tx.update(table).set({ sort }).where(eq(table.id, ids[sort]));
    await tx.insert(auditLog).values({ action: "reorder", entity: resource });
  });
}
export async function saveSettings(input: unknown) {
  const data = settingsSchema.parse(input);
  await db.transaction(async (tx) => {
    await lockContent(tx);
    await tx.update(settings).set({ data }).where(eq(settings.id, 1));
    await tx.insert(auditLog).values({ action: "update", entity: "settings" });
  });
  return data;
}
export async function revalidate(paths: string[]) {
  if (!config.REVALIDATE_URL) return false;
  try {
    const response = await fetch(config.REVALIDATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": config.REVALIDATE_SECRET,
      },
      body: JSON.stringify({ paths }),
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
export async function publish(expected: string) {
  const result = await db.transaction(async (tx) => {
    await lockContent(tx);
    const current = await draft(tx),
      before = await latest(tx);
    if (revision(current) !== expected)
      throw new HttpError(
        409,
        "Drafts changed. Review the latest changes before publishing.",
      );
    const payload = published(current),
      summary = diff(before.payload, payload);
    if (!summary.length)
      throw new HttpError(409, "No public changes to publish.");
    const commitHash = randomBytes(6).toString("hex");
    const [created] = await tx
      .insert(snapshots)
      .values({ payload, summary, commitHash });
    await tx.insert(auditLog).values({
      action: "publish",
      entity: "snapshot",
      entityId: String(created.insertId),
      meta: { commitHash },
    });
    return {
      version: created.insertId,
      commitHash,
      changes: summary,
      paths: pathsFor(before.payload, payload),
    };
  });
  return { ...result, revalidated: await revalidate(result.paths) };
}
export async function rollback(version: number) {
  const result = await db.transaction(async (tx) => {
    await lockContent(tx);
    const [target] = await tx
      .select()
      .from(snapshots)
      .where(eq(snapshots.version, version));
    if (!target) throw new HttpError(404, "Version not found.");
    const before = await latest(tx),
      commitHash = randomBytes(6).toString("hex"),
      summary = diff(before.payload, target.payload);
    const [created] = await tx
      .insert(snapshots)
      .values({ payload: target.payload, summary, commitHash });
    await tx.insert(auditLog).values({
      action: "rollback",
      entity: "snapshot",
      entityId: String(created.insertId),
      meta: { sourceVersion: version },
    });
    return {
      version: created.insertId,
      commitHash,
      paths: pathsFor(before.payload, target.payload),
    };
  });
  return { ...result, revalidated: await revalidate(result.paths) };
}
export { resourceNames };
