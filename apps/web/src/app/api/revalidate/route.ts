import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET || "",
    supplied = request.headers.get("x-revalidate-secret") || "";
  if (
    !secret ||
    secret.length !== supplied.length ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (
    !body ||
    !Array.isArray(body.paths) ||
    body.paths.length > 1000 ||
    body.paths.some(
      (p: unknown) =>
        typeof p !== "string" || !/^\/(?:projects(?:\/[a-z0-9-]+)?)?$/.test(p),
    )
  )
    return Response.json({ error: "Invalid paths" }, { status: 400 });
  revalidateTag("portfolio-content", { expire: 0 });
  for (const path of body.paths) revalidatePath(path);
  return Response.json({ revalidated: true });
}
