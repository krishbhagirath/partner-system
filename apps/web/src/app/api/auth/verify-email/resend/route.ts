import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { checkRateLimit, rateLimitExceededResponse, rateLimitRules } from "@/lib/rate-limit";
import { logServerError } from "@/server/api-error";
import { sendEmailVerification } from "@/server/email-verification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resendSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
  })
  .strict();

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request.", issues: ["Send JSON with an email field."] },
      { status: 400 },
    );
  }

  const parsedBody = resendSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: parsedBody.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const { email } = parsedBody.data;

  const rateLimit = checkRateLimit(
    `auth-resend-verification:${email}`,
    rateLimitRules.authResendVerification,
  );

  if (!rateLimit.ok) {
    return rateLimitExceededResponse(rateLimit.retryAfterSeconds);
  }

  // Always respond the same way whether or not the account exists / is
  // already verified, so this endpoint can't be used to enumerate accounts.
  try {
    const user = await db.user.findUnique({
      select: { emailVerified: true, id: true },
      where: { email },
    });

    if (user && !user.emailVerified) {
      await sendEmailVerification(email);
    }
  } catch (error) {
    logServerError("POST /api/auth/verify-email/resend", error, { email });
  }

  return NextResponse.json({ ok: true });
}
