import { NextResponse } from "next/server";
import { z } from "zod";

import {
  checkRateLimit,
  rateLimitExceededResponse,
  rateLimitRules,
} from "@/lib/rate-limit";
import { internalErrorResponse, logServerError } from "@/server/api-error";
import { AuthenticationError, requireUser } from "@/server/auth";
import { replaceSectionsForTerm } from "@/server/lab-partner";
import { VsbImportError, parseVsbShareLink } from "@/server/vsb-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({ link: z.string().trim().min(1).max(2000) }).strict();

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    throw error;
  }

  const rateLimit = checkRateLimit(`import-vsb:${user.id}`, rateLimitRules.importStart);
  if (!rateLimit.ok) {
    return rateLimitExceededResponse(rateLimit.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with a `link` field." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join(" ") || "Invalid request." },
      { status: 400 },
    );
  }

  try {
    const { term, sections } = await parseVsbShareLink(parsed.data.link);
    // Re-import replaces this term's sections (wipe + rewrite), never duplicates.
    const result = await replaceSectionsForTerm(user.id, term, sections);

    return NextResponse.json(
      { imported: result.count, found: sections.length, term },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof VsbImportError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    logServerError("POST /api/import/vsb", error, { userId: user.id });
    return internalErrorResponse();
  }
}
