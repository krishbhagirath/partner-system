import "server-only";

import { env } from "@/lib/env";

export function requireScraperConfig() {
  if (!env.SCRAPER_URL || !env.WORKER_SECRET) {
    throw new Error("SCRAPER_URL and WORKER_SECRET are required to start imports.");
  }

  return {
    scraperUrl: env.SCRAPER_URL,
    workerSecret: env.WORKER_SECRET,
  };
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
