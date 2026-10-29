import { contentSchema } from "@rf/contracts";
export async function getContent() {
  const response = await fetch(
    (process.env.API_URL || "http://127.0.0.1:4000") + "/api/public/content",
    {
      next: { revalidate: 3600, tags: ["portfolio-content"] },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) throw new Error("Published content is unavailable.");
  return contentSchema.parse(await response.json());
}
