import "server-only";

import { env } from "@/lib/env";

export function requireScraperConfig() {
  if (!env.SCRAPER_URL || !env.WORKER_SECRET) {
    throw new Error("SCRAPER_URL and WORKER_SECRET are required to start imports.");
  }

  // Imports forward the student's real MacID/Mosaic password to the worker, so
  // the transport must be encrypted in production. Only a loopback/private
  // tunnel is allowed to use plain HTTP.
  if (env.NODE_ENV === "production" && !isSecureScraperUrl(env.SCRAPER_URL)) {
    throw new Error(
      "SCRAPER_URL must use HTTPS in production — it carries MacID credentials.",
    );
  }

  return {
    scraperUrl: env.SCRAPER_URL,
    workerSecret: env.WORKER_SECRET,
  };
}

function isSecureScraperUrl(url: string) {
  if (url.startsWith("https://")) {
    return true;
  }

  try {
    const { hostname } = new URL(url);

    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

export function requireEmailConfig() {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required to send email.");
  }

  return {
    emailFrom: env.EMAIL_FROM,
    resendApiKey: env.RESEND_API_KEY,
  };
}
