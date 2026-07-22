import { NextResponse } from "next/server";
import { z } from "zod";

import { internalErrorResponse, logServerError } from "@/server/api-error";
import { AuthenticationError, requireUser } from "@/server/auth";
import { toggleDiscoverableSection } from "@/server/lab-partner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateDiscoverabilitySchema = z
  .object({
    isActive: z.boolean(),
    note: z.string().trim().max(180).optional(),
    partnerNeedResponse: z.enum(["YES", "NO", "UNSURE"]).optional(),
  })
  .strict();

type SectionRouteContext = {
  params:
    | {
        sectionId: string;
      }
    | Promise<{
        sectionId: string;
      }>;
};

export async function PATCH(request: Request, context: SectionRouteContext) {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    throw error;
  }

  const { sectionId } = await context.params;

  if (!sectionId) {
    return NextResponse.json({ error: "sectionId is required." }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request.", issues: ["Send JSON with an isActive boolean."] },
      { status: 400 },
    );
  }

  const parsedBody = updateDiscoverabilitySchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: parsedBody.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  try {
    await toggleDiscoverableSection(
      user.id,
      sectionId,
      parsedBody.data.isActive,
      parsedBody.data.note,
      parsedBody.data.partnerNeedResponse,
    );
  } catch (error) {
    logServerError("PATCH /api/sections/[sectionId]/discoverability", error, {
      sectionId,
      userId: user.id,
    });

    return internalErrorResponse();
  }

  return NextResponse.json({ ok: true });
}
