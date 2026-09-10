import { describe, expect, it } from "vitest";

import {
  checkRateLimit,
  consumeRateLimit,
  getClientIp,
  getClientIp as resolveIp,
  peekRateLimit,
} from "@/lib/rate-limit";

function requestWith(headers: Record<string, string>) {
  return new Request("https://partnerup.example/api/auth/callback/credentials", { headers });
}

describe("getClientIp", () => {
  it("ignores a client-supplied x-real-ip", () => {
    // The old implementation preferred this header, so rotating it handed an attacker
    // a fresh rate-limit bucket per request.
    expect(resolveIp(requestWith({ "x-real-ip": "6.6.6.6" }))).toBe("unknown");
  });

  it("uses the forwarded value and not a spoofed x-real-ip alongside it", () => {
    expect(
      resolveIp(requestWith({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "6.6.6.6" })),
    ).toBe("203.0.113.7");
  });

  it("prefers x-vercel-forwarded-for, which a proxy on top of Vercel cannot overwrite", () => {
    expect(
      resolveIp(
        requestWith({
          "x-forwarded-for": "198.51.100.9",
          "x-vercel-forwarded-for": "203.0.113.7",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("takes the right-most hop, never the client-supplied left-most one", () => {
    expect(resolveIp(requestWith({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to a single shared bucket rather than anything spoofable", () => {
    expect(getClientIp(requestWith({}))).toBe("unknown");
  });
});

describe("peek vs consume", () => {
  const rule = { limit: 2, windowMs: 60_000 };

  it("peeking never spends the budget", () => {
    const key = `peek-${Math.random()}`;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(peekRateLimit(key, rule).ok).toBe(true);
    }
  });

  it("consuming does, and peek then reports the block", () => {
    const key = `consume-${Math.random()}`;

    consumeRateLimit(key, rule);
    expect(peekRateLimit(key, rule).ok).toBe(true);

    consumeRateLimit(key, rule);

    const blocked = peekRateLimit(key, rule);
    expect(blocked.ok).toBe(false);

    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("checkRateLimit keeps its original check-and-count behaviour", () => {
    const key = `check-${Math.random()}`;

    expect(checkRateLimit(key, rule).ok).toBe(true);
    expect(checkRateLimit(key, rule).ok).toBe(true);
    expect(checkRateLimit(key, rule).ok).toBe(false);
  });
});
