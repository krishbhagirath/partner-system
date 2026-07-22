import { NextResponse } from "next/server";
import { z } from "zod";

import { requireScraperConfig } from "@/lib/config";
import { checkRateLimit, rateLimitExceededResponse, rateLimitRules } from "@/lib/rate-limit";
import { logServerError } from "@/server/api-error";
import { AuthenticationError, requireUser } from "@/server/auth";
import { createImportJob, updateImportJobStatus } from "@/server/lab-partner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startImportRequestSchema = z
  .object({
    macId: z.string().trim().min(1, "macId is required."),
    password: z.string().min(1, "password is required."),
  })
  .strict();

type StartImportInput = z.infer<typeof startImportRequestSchema>;

export async function POST(request: Request) {
  let authenticatedUser: Awaited<ReturnType<typeof requireUser>>;

  try {
    authenticatedUser = await requireUser();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    throw error;
  }

  const rateLimit = checkRateLimit(
    `import-start:${authenticatedUser.id}`,
    rateLimitRules.importStart,
  );

  if (!rateLimit.ok) {
    return rateLimitExceededResponse(rateLimit.retryAfterSeconds);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request.",
        issues: ["Send JSON with macId and password fields."],
      },
      { status: 400 },
    );
  }

  const parsedRequest = startImportRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: parsedRequest.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  let scraperConfig: ReturnType<typeof requireScraperConfig>;

  try {
    scraperConfig = requireScraperConfig();
  } catch {
    return NextResponse.json(
      {
        error: "Import worker is not configured.",
        issues: ["Set SCRAPER_URL and WORKER_SECRET before starting an import."],
      },
      { status: 500 },
    );
  }

  let jobId: string;
  try {
    const job = await createImportJob(authenticatedUser.id);

    jobId = job.id;
  } catch (error) {
    logServerError("POST /api/import/start", error, { userId: authenticatedUser.id });

    return NextResponse.json(
      {
        error: "Unable to create import job.",
        issues: ["Check that DATABASE_URL points to a migrated database with table permissions."],
      },
      { status: 500 },
    );
  }

  dispatchScraperWorker({
    ...parsedRequest.data,
    jobId,
    scraperConfig,
    userId: authenticatedUser.id,
  });

  return NextResponse.json({ jobId }, { status: 202 });
}

function dispatchScraperWorker(
  input: StartImportInput & {
    jobId: string;
    scraperConfig: ReturnType<typeof requireScraperConfig>;
    userId: string;
  },
) {
  const { scraperConfig, ...workerInput } = input;
  const endpoint = `${scraperConfig.scraperUrl.replace(/\/$/, "")}/scrape`;

  void fetch(endpoint, {
    body: JSON.stringify(workerInput),
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": scraperConfig.workerSecret,
    },
    method: "POST",
  })
    .then(async (response) => {
      if (!response.ok) {
        await markDispatchFailed(input.jobId, await getWorkerFailureMessage(response));
      }
    })
    .catch(async (error: unknown) => {
      logServerError("scraper dispatch", error, { jobId: input.jobId });
      await markDispatchFailed(input.jobId);
    });
}

async function markDispatchFailed(jobId: string, errorMessage = "Unable to start scraper worker.") {
  await updateImportJobStatus(jobId, "FAILED", errorMessage).catch(() => undefined);
}

async function getWorkerFailureMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: unknown };

    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // Fall through to the status-only message.
  }

  return `Scraper worker returned ${response.status}.`;
}
