import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit, rateLimitExceededResponse, rateLimitRules } from "@/lib/rate-limit";
import { internalErrorResponse, logServerError } from "@/server/api-error";
import { AuthenticationError, requireUser } from "@/server/auth";
import { PartnerRequestError, respondToPartnerRequest } from "@/server/lab-partner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updatePartnerRequestSchema = z
  .object({
    status: z.enum(["ACCEPTED", "DECLINED"]),
  })
  .strict();

type PartnerRequestRouteContext = {
  params:
    | {
        requestId: string;
      }
    | Promise<{
        requestId: string;
      }>;
};

export async function PATCH(request: Request, context: PartnerRequestRouteContext) {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    throw error;
  }

  const rateLimit = checkRateLimit(
    `partner-request-respond:${user.id}`,
    rateLimitRules.partnerRequestRespond,
  );

  if (!rateLimit.ok) {
    return rateLimitExceededResponse(rateLimit.retryAfterSeconds);
  }

  const { requestId } = await context.params;

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request.",
        issues: ["Send JSON with an ACCEPTED or DECLINED status."],
      },
      { status: 400 },
    );
  }

  const parsedRequest = updatePartnerRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: parsedRequest.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  try {
    const partnerRequest = await respondToPartnerRequest(
      user.id,
      requestId,
      parsedRequest.data.status,
    );

    return NextResponse.json({
      request: {
        id: partnerRequest.id,
        status: partnerRequest.status,
      },
    });
  } catch (error) {
    if (error instanceof PartnerRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    logServerError("PATCH /api/partner-requests/[requestId]", error, {
      requestId,
      userId: user.id,
    });

    return internalErrorResponse();
  }
}
