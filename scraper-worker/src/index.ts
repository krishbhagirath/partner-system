import "./env.js";

import { timingSafeEqual } from "node:crypto";
import http from "node:http";

import express from "express";
import { z } from "zod";

import { disconnectDb, requireEnv } from "./db.js";
import { runScrapeJob } from "./scraper.js";

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

app.post("/scrape", async (request, response) => {
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

  try {
    const result = await runScrapeJob(parsedRequest.data);

    response.status(200).json({
      ok: true,
      result,
    });
  } catch (error) {
    // runScrapeJob already redacts credentials from the error message.
    response.status(500).json({
      error: error instanceof Error ? error.message : "Scrape failed.",
      ok: false,
    });
  }
});

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
