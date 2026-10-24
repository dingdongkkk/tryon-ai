import "server-only";
import { cookies, headers } from "next/headers";
import { hashSecret } from "./store";
import { safeEqual } from "./payment-rules";
import { config } from "./config";

// Shopper ownership: each order / stylist request gets a random secret stored as an
// httpOnly cookie. Only its sha256 is kept server-side.

const MAX_AGE = 60 * 60 * 24 * 90;

export async function grantAccess(kind: "o" | "s", id: string, token: string) {
  (await cookies()).set(`w${kind}_${id}`, token, {
    httpOnly: true,
    sameSite: "lax", // sent on the top-level redirect back from Pine Labs
    secure: config.appUrl.startsWith("https://"),
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function hasAccess(kind: "o" | "s", id: string, accessHash: string | undefined) {
  const token = (await cookies()).get(`w${kind}_${id}`)?.value;
  return Boolean(token && accessHash && safeEqual(hashSecret(token), accessHash));
}

/** Reject cross-site POSTs to shopper endpoints (CSRF defense on top of SameSite cookies). */
export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return; // same-origin fetches from older browsers / server-side calls
  if (new URL(origin).host !== h.get("host")) throw Object.assign(new Error("Cross-origin request blocked"), { status: 403 });
}

// Tiny fixed-window rate limiter (per process). Use Redis/Upstash when running multiple instances.
const buckets = new Map<string, { n: number; reset: number }>();
export async function rateLimit(key: string, limit: number, windowMs: number) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const k = `${key}:${ip}`;
  const t = Date.now();
  const b = buckets.get(k);
  if (!b || b.reset < t) {
    buckets.set(k, { n: 1, reset: t + windowMs });
    return;
  }
  if (++b.n > limit) throw Object.assign(new Error("Too many requests, slow down a little"), { status: 429 });
}
