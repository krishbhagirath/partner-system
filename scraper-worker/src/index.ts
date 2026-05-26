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
const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.post("/scrape", async (request, response) => {
  if (!isAuthorized(request.get("WORKER_SECRET") ?? request.get("x-worker-secret") ?? "")) {
    response.status(401).json({ error: "Unauthorized" });
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
    response.status(500).json({
      error: error instanceof Error ? error.message : "Scrape failed.",
      ok: false,
    });
  }
});

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`scraper-worker listening on port ${port}`);
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

async function shutdown(signal: "SIGINT" | "SIGTERM") {
  console.log(`received ${signal}, shutting down`);

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
