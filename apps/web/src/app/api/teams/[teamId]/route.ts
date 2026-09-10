import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit, rateLimitExceededResponse, rateLimitRules } from "@/lib/rate-limit";
import { internalErrorResponse, logServerError } from "@/server/api-error";
import { AuthenticationError, requireUser } from "@/server/auth";
import { leaveTeam, PartnerRequestError, setTeamCompletion } from "@/server/lab-partner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateTeamSchema = z
  .object({
    isComplete: z.boolean(),
  })
  .strict();

type TeamRouteContext = {
  params: { teamId: string } | Promise<{ teamId: string }>;
};

async function authorize() {
  const user = await requireUser();
  const rateLimit = checkRateLimit(`team-update:${user.id}`, rateLimitRules.teamUpdate);

  if (!rateLimit.ok) {
    return { response: rateLimitExceededResponse(rateLimit.retryAfterSeconds), user: null };
  }

  return { response: null, user };
}

/** Opens a team to new members, or closes it. Any member may do either. */
export async function PATCH(request: Request, context: TeamRouteContext) {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    const authorized = await authorize();

    if (authorized.response) {
      return authorized.response;
    }

    user = authorized.user;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    throw error;
  }

  const { teamId } = await context.params;

  if (!teamId) {
    return NextResponse.json({ error: "teamId is required." }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request.", issues: ["Send JSON with an isComplete boolean."] },
      { status: 400 },
    );
  }

  const parsedRequest = updateTeamSchema.safeParse(body);

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
    const team = await setTeamCompletion(user.id, teamId, parsedRequest.data.isComplete);

    return NextResponse.json({ team: { id: team.id, isComplete: team.isComplete } });
  } catch (error) {
    if (error instanceof PartnerRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    logServerError("PATCH /api/teams/[teamId]", error, { teamId, userId: user.id });

    return internalErrorResponse();
  }
}

/** Leaves a team. A team left with fewer than two members is deleted. */
export async function DELETE(_request: Request, context: TeamRouteContext) {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    const authorized = await authorize();

    if (authorized.response) {
      return authorized.response;
    }

    user = authorized.user;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    throw error;
  }

  const { teamId } = await context.params;

  if (!teamId) {
    return NextResponse.json({ error: "teamId is required." }, { status: 400 });
  }

  try {
    const result = await leaveTeam(user.id, teamId);

    return NextResponse.json({ team: result });
  } catch (error) {
    if (error instanceof PartnerRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    logServerError("DELETE /api/teams/[teamId]", error, { teamId, userId: user.id });

    return internalErrorResponse();
  }
}
