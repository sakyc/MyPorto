import type { MetadataRoute } from "next";
import { getContent } from "@/lib/content";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL || "http://localhost:3000";
  return [
    "/",
    "/projects",
    ...(await getContent()).projects.map((p) => "/projects/" + p.slug),
  ].map((path) => ({
    url: base + path,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
