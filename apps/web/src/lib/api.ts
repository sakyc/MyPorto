// Owner cookies stay first-party on Vercel, even when the API is on a VPS.
const base = process.env.NEXT_PUBLIC_ADMIN_API_URL || "";
let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string> = {},
    public retryAfter: number = 0,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET" && csrf)
    headers.set("X-CSRF-Token", csrf);
  const response = await fetch(base + "/api/admin" + path, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("rf-session-expired"));
    throw new ApiError(
      body.error || "Please try again.",
      response.status,
      body.fields,
      Number(body.retryAfter || response.headers.get("Retry-After")) || 0,
    );
  }
  return body as T;
}
