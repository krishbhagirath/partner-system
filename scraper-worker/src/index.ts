import "./env.js";

import { timingSafeEqual } from "node:crypto";
import http from "node:http";

import express from "express";
import { z } from "zod";

import { disconnectDb, getUserForNotification, requireEnv } from "./db.js";
import { isEmailConfigured, sendImportCompletedEmail } from "./email.js";
import { createTaskQueue } from "./queue.js";
import { runScrapeJob, type ScrapeJobResult } from "./scraper.js";

const scrapeRequestSchema = z
  .object({
    jobId: z.string().min(1),
    macId: z.string().min(1),
    password: z.string().min(1),
    userId: z.string().min(1),
  })
  .strict();

const workerSecret = requireEnv("WORKER_SECRET");
const port = parsePort(process.env.PORT);
const maxConcurrency = parseMaxConcurrency(process.env.SCRAPER_MAX_CONCURRENCY);
const scrapeQueue = createTaskQueue(maxConcurrency);
const app = express();

// Basic global fixed-window rate limit. Only the web app calls this service,
// so a single shared window is enough to stop runaway or abusive callers.
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
let rateLimitWindowStart = 0;
let rateLimitCount = 0;

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_request, response) => {
  response.status(200).json({ ok: true });
});

app.post("/scrape", (request, response) => {
  if (!isAuthorized(request.get("WORKER_SECRET") ?? request.get("x-worker-secret") ?? "")) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const retryAfterSeconds = takeRateLimitSlot();

  if (retryAfterSeconds > 0) {
    logLine("warn", "scrape:rate_limited", { retryAfterSeconds });
    response
      .status(429)
      .set("Retry-After", String(retryAfterSeconds))
      .json({ error: "Too many scrape requests. Please try again later." });
    return;
  }

  const parsedRequest = scrapeRequestSchema.safeParse(request.body);

  if (!parsedRequest.success) {
    response.status(400).json({ error: "Invalid request body" });
    return;
  }

  const job = parsedRequest.data;

  // Run in the background behind the concurrency cap and respond immediately.
  // runScrapeJob writes RUNNING/SUCCEEDED/FAILED straight to the DB, which the
  // web app polls, so the caller doesn't need the scrape result in the response.
  void scrapeQueue
    .enqueue(async () => {
      const result = await runScrapeJob(job);
      await notifyImportComplete(job.userId, result);

      return result;
    })
    .catch(() => {
      // runScrapeJob already recorded FAILED (with credentials redacted) and
      // notifyImportComplete swallows its own errors; log at queue level only.
      logLine("error", "scrape:job_failed", { jobId: job.jobId });
    });

  logLine("info", "scrape:enqueued", {
    active: scrapeQueue.active,
    jobId: job.jobId,
    pending: scrapeQueue.pending,
  });

  response.status(202).json({ ok: true, pending: scrapeQueue.pending, queued: true });
});

async function notifyImportComplete(userId: string, result: ScrapeJobResult) {
  if (!isEmailConfigured()) {
    logLine("info", "email:skipped", { reason: "not_configured" });
    return;
  }

  try {
    const user = await getUserForNotification(userId);

    if (!user?.email) {
      logLine("warn", "email:skipped", { reason: "no_email" });
      return;
    }

    await sendImportCompletedEmail({
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
      displayName: user.displayName,
      sectionsCount: result.saveResult.created,
      to: user.email,
    });
    logLine("info", "email:sent", { userId });
  } catch (error) {
    logLine("error", "email:failed", {
      message: error instanceof Error ? error.message : "Unknown email error.",
    });
  }
}

const server = http.createServer(app);

server.listen(port, () => {
  logLine("info", "server:listening", { port });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown(signal).catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
  });
}

function isAuthorized(providedSecret: string) {
  const expected = Buffer.from(workerSecret);
  const provided = Buffer.from(providedSecret);

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

function parsePort(rawPort: string | undefined) {
  if (!rawPort) {
    return 8080;
  }

  const parsedPort = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${rawPort}".`);
  }

  return parsedPort;
}

function parseMaxConcurrency(rawValue: string | undefined) {
  if (!rawValue) {
    return 2;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(
      `SCRAPER_MAX_CONCURRENCY must be an integer >= 1, got "${rawValue}".`,
    );
  }

  return parsedValue;
}

function takeRateLimitSlot() {
  const now = Date.now();

  if (now - rateLimitWindowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitWindowStart = now;
    rateLimitCount = 0;
  }

  if (rateLimitCount >= RATE_LIMIT_MAX_REQUESTS) {
    return Math.max(1, Math.ceil((rateLimitWindowStart + RATE_LIMIT_WINDOW_MS - now) / 1000));
  }

  rateLimitCount += 1;

  return 0;
}

function logLine(
  level: "error" | "info" | "warn",
  step: string,
  details: Record<string, number | string> = {},
) {
  const line = JSON.stringify({
    ...details,
    level,
    step,
    timestamp: new Date().toISOString(),
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

async function shutdown(signal: "SIGINT" | "SIGTERM") {
  logLine("info", "server:shutdown", { signal });

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  await disconnectDb();
  process.exit(0);
}
