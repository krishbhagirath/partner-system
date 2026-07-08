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
