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
  // Per-account, and only consumed by FAILED attempts, so a legitimate user who knows
  // their password can never be locked out of their own account by an attacker
  // burning the budget. This is the limit that survives IP rotation.
  authSignInAccount: { limit: 5, windowMs: 15 * 60_000 },
  authResendVerification: { limit: 3, windowMs: 15 * 60_000 },
  importStart: { limit: 3, windowMs: 10 * 60_000 },
  partnerRequestCreate: { limit: 20, windowMs: 60_000 },
  partnerRequestRespond: { limit: 30, windowMs: 60_000 },
  teamUpdate: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

/**
 * Reports whether a key is over its limit WITHOUT counting an attempt. Pair with
 * consumeRateLimit when only some outcomes should count against the budget.
 */
export function peekRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const state = windows.get(key);
  const now = Date.now();

  if (!state || state.resetAt <= now || state.count < rule.limit) {
    return { ok: true };
  }

  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
  };
}

/** Counts one attempt against a key. Use after the outcome is known. */
export function consumeRateLimit(key: string, rule: RateLimitRule) {
  const now = Date.now();

  if (windows.size >= MAX_TRACKED_WINDOWS) {
    pruneExpiredWindows(now);
  }

  const state = windows.get(key);

  if (!state || state.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });

    return;
  }

  state.count += 1;
}

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

/**
 * Headers we are willing to derive a rate-limit key from, most trustworthy first.
 *
 * `x-real-ip` is deliberately NOT in this list. The previous implementation preferred
 * it on the assumption that clients could not spoof it, but Vercel only documents the
 * anti-spoofing guarantee for `x-forwarded-for` ("we overwrite the X-Forwarded-For
 * header and do not forward external IPs ... to prevent IP spoofing"). A client-sent
 * `x-real-ip` was therefore trusted verbatim, and rotating it defeated every per-IP
 * limit in the app — confirmed locally against the sign-in endpoint.
 *
 * `x-vercel-forwarded-for` comes first because it is the one value a proxy layered on
 * top of Vercel cannot overwrite.
 */
const TRUSTED_IP_HEADERS = ["x-vercel-forwarded-for", "x-forwarded-for"] as const;

/**
 * Resolve the client IP for rate-limit keys.
 *
 * Takes the right-most hop, which is the value appended by the nearest trusted proxy.
 * The left-most value is client-supplied and must never be used for a security
 * decision. Returns "unknown" rather than falling back to anything client-controlled,
 * so that local development shares one bucket instead of silently having none.
 *
 * Note this is still only as good as the host: behind campus NAT an entire residence
 * shares one address, so IP is a coarse signal. Anything that protects a specific
 * account should also be limited per account — see the sign-in route.
 */
export function getClientIp(request: Request) {
  for (const header of TRUSTED_IP_HEADERS) {
    const hops = request.headers
      .get(header)
      ?.split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const nearestProxyHop = hops?.at(-1);

    if (nearestProxyHop) {
      return nearestProxyHop;
    }
  }

  return "unknown";
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
