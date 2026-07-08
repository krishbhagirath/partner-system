import { NextResponse } from "next/server";

import { AuthenticationError, requireUser } from "@/server/auth";
import { getImportJobForUser } from "@/server/lab-partner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ImportStatusRouteContext = {
  params:
    | {
        jobId: string;
      }
    | Promise<{
        jobId: string;
      }>;
};

export async function GET(_request: Request, context: ImportStatusRouteContext) {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    throw error;
  }

  const { jobId } = await context.params;

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  const job = await getImportJobForUser(user.id, jobId);

  if (!job) {
    return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  }

  return NextResponse.json({
    job: {
      createdAt: job.createdAt.toISOString(),
      errorMessage: job.errorMessage,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      id: job.id,
      sectionsCount: job._count.sections,
      startedAt: job.startedAt?.toISOString() ?? null,
      status: job.status,
      updatedAt: job.updatedAt.toISOString(),
    },
  });
}
