import { NextResponse } from "next/server";

import { internalErrorResponse, logServerError } from "@/server/api-error";
import { AuthenticationError, requireUser } from "@/server/auth";
import { PartnerRequestError, removeImportedSection } from "@/server/lab-partner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ImportSectionRouteContext = {
  params:
    | {
        sectionId: string;
      }
    | Promise<{
        sectionId: string;
      }>;
};

export async function DELETE(_request: Request, context: ImportSectionRouteContext) {
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

  try {
    await removeImportedSection(user.id, sectionId);
  } catch (error) {
    if (error instanceof PartnerRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    logServerError("DELETE /api/import/sections/[sectionId]", error, {
      sectionId,
      userId: user.id,
    });

    return internalErrorResponse();
  }

  return NextResponse.json({ ok: true });
}
