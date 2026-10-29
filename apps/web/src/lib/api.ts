/**
 * Calls to /api/v1/* (same origin, through CloudFront to the Lambda Function URL).
 * CloudFront signs requests to Lambda with origin access control, which overwrites Authorization
 * and requires the SHA-256 of any request body in x-amz-content-sha256.
 */
import { accessToken } from "./auth";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Body plus the payload-hash header OAC needs (also for empty POST bodies). */
export async function signedBody(body: string): Promise<{ body: string; headers: Record<string, string> }> {
  return { body, headers: { "content-type": "application/json", "x-amz-content-sha256": await sha256Hex(body) } };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public problem: { type?: string; title?: string; detail?: string },
  ) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`);
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { accept: "application/json" };
  let body: string | undefined;
  if (method !== "GET") {
    const s = await signedBody(opts.body === undefined ? "" : JSON.stringify(opts.body));
    body = s.body;
    Object.assign(headers, s.headers);
  }
  if (opts.auth !== false) {
    const token = await accessToken();
    if (!token) throw new ApiError(401, { title: "Not signed in", detail: "Sign in to continue." });
    headers["x-vl-auth"] = `Bearer ${token}`;
  }
  const res = await fetch(path, { method, headers, body, credentials: "same-origin" });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data ?? {});
  return data as T;
}

/** The learner's IANA timezone, so streaks follow their own calendar day. */
export const tz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
