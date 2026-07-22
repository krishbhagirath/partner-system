import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit, rateLimitExceededResponse, rateLimitRules } from "@/lib/rate-limit";
import { internalErrorResponse, logServerError } from "@/server/api-error";
import { sendEmailVerification } from "@/server/email-verification";
import { RegistrationError, registerUser } from "@/server/registration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const registerRequestSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Display name must be at least 2 characters.")
      .max(80, "Display name must be at most 80 characters."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email address.")
      .endsWith("@mcmaster.ca", "Use your @mcmaster.ca email address."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(100, "Password must be at most 100 characters."),
  })
  .strict();

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    `auth-register:${getClientIp(request)}`,
    rateLimitRules.authRegister,
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
        issues: ["Send JSON with displayName, email, and password fields."],
      },
      { status: 400 },
    );
  }

  const parsedRequest = registerRequestSchema.safeParse(body);

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
    const user = await registerUser(parsedRequest.data);

    try {
      await sendEmailVerification(user.email);
    } catch (error) {
      // The account exists either way — a failed send just means the
      // "Resend email" button on the verify-email screen is their recovery
      // path, so this shouldn't fail the registration itself.
      logServerError("POST /api/auth/register (sendEmailVerification)", error, {
        userId: user.id,
      });
    }

    return NextResponse.json({ user: { email: user.email, id: user.id } }, { status: 201 });
  } catch (error) {
    if (error instanceof RegistrationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    logServerError("POST /api/auth/register", error);

    return internalErrorResponse();
  }
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}
