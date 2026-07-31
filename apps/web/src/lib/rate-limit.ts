import "server-only";

import { NextResponse } from "next/server";

export type RateLimitRule = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

type WindowState = {
  count: number;
  resetAt: number;
};

// Fixed-window counters held in module scope. On serverless hosts each warm
// instance keeps its own counters, so this caps abuse per instance rather
// than globally — acceptable for basic protection without adding a store.
const windows = new Map<string, WindowState>();
const MAX_TRACKED_WINDOWS = 10_000;

export const rateLimitRules = {
  authRegister: { limit: 5, windowMs: 15 * 60_000 },
  authSignIn: { limit: 10, windowMs: 5 * 60_000 },
  authResendVerification: { limit: 3, windowMs: 15 * 60_000 },
  importStart: { limit: 3, windowMs: 10 * 60_000 },
  partnerRequestCreate: { limit: 20, windowMs: 60_000 },
  partnerRequestRespond: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();

  if (windows.size >= MAX_TRACKED_WINDOWS) {
    pruneExpiredWindows(now);
  }

  const state = windows.get(key);

  if (!state || state.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });

    return { ok: true };
  }

  if (state.count < rule.limit) {
    state.count += 1;

    return { ok: true };
  }

  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
  };
}

// Resolve the client IP for rate-limit keys. Prefer `x-real-ip`, which the
// hosting proxy (Vercel) sets to the true connecting IP and clients cannot
// spoof. Never trust the left-most `x-forwarded-for` value — that is the
// client-supplied hop and rotating it would defeat per-IP limits. Fall back to
// the right-most forwarded hop (added by the trusted proxy).
export function getClientIp(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();

  if (realIp) {
    return realIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const hops = forwardedFor
    ?.split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);

  return hops?.at(-1) ?? "unknown";
}

export function rateLimitExceededResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
      status: 429,
    },
  );
}

function pruneExpiredWindows(now: number) {
  for (const [key, state] of windows) {
    if (state.resetAt <= now) {
      windows.delete(key);
    }
  }
}
