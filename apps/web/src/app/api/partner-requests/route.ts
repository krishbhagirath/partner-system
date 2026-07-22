import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit, rateLimitExceededResponse, rateLimitRules } from "@/lib/rate-limit";
import { internalErrorResponse, logServerError } from "@/server/api-error";
import { AuthenticationError, requireUser } from "@/server/auth";
import {
  createPartnerRequest,
  getPartnerRequestsForUser,
  PartnerRequestError,
} from "@/server/lab-partner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createPartnerRequestSchema = z
  .object({
    message: z.string().trim().max(180).optional(),
    receiverId: z.string().min(1),
    sectionId: z.string().min(1),
  })
  .strict();

export async function GET() {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    throw error;
  }

  let requests: Awaited<ReturnType<typeof getPartnerRequestsForUser>>;

  try {
    requests = await getPartnerRequestsForUser(user.id);
  } catch (error) {
    logServerError("GET /api/partner-requests", error, { userId: user.id });

    return internalErrorResponse();
  }

  return NextResponse.json({
    requests: requests.map((request) => ({
      createdAt: request.createdAt.toISOString(),
      id: request.id,
      note: request.note,
      receiver: serializeRequestUser(request.receiver),
      section: serializeRequestSection(request.section),
      sender: serializeRequestUser(request.sender),
      status: request.status,
      updatedAt: request.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
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
    `partner-request-create:${user.id}`,
    rateLimitRules.partnerRequestCreate,
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
        issues: ["Send JSON with receiverId, sectionId, and optional message fields."],
      },
      { status: 400 },
    );
  }

  const parsedRequest = createPartnerRequestSchema.safeParse(body);

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
    const partnerRequest = await createPartnerRequest(
      user.id,
      parsedRequest.data.receiverId,
      parsedRequest.data.sectionId,
      parsedRequest.data.message,
    );

    return NextResponse.json(
      {
        request: {
          id: partnerRequest.id,
          status: partnerRequest.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PartnerRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    logServerError("POST /api/partner-requests", error, { userId: user.id });

    return internalErrorResponse();
  }
}

function serializeRequestUser(user: {
  displayName: string | null;
  email: string;
  id: string;
  image: string | null;
  name: string | null;
}) {
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    image: user.image,
    name: user.name,
  };
}

function serializeRequestSection(section: {
  componentType: string;
  courseCode: string;
  dayOfWeek: string;
  endTime: Date;
  id: string;
  location: string;
  sectionCode: string;
  startTime: Date;
  term: string;
}) {
  return {
    componentType: section.componentType,
    courseCode: section.courseCode,
    dayOfWeek: section.dayOfWeek,
    endTime: section.endTime.toISOString().slice(11, 16),
    id: section.id,
    location: section.location,
    sectionCode: section.sectionCode,
    startTime: section.startTime.toISOString().slice(11, 16),
    term: section.term,
  };
}
