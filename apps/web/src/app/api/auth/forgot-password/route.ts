import { NextResponse } from "next/server";
import { z } from "zod";

import {
  checkRateLimit,
  getClientIp,
  rateLimitExceededResponse,
  rateLimitRules,
} from "@/lib/rate-limit";
import { logServerError } from "@/server/api-error";
import { sendPasswordReset } from "@/server/password-reset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({ email: z.string().trim().toLowerCase().email() }).strict();

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    `forgot-password:${getClientIp(request)}`,
    rateLimitRules.authResendVerification,
  );
  if (!rateLimit.ok) {
    return rateLimitExceededResponse(rateLimit.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    await sendPasswordReset(parsed.data.email);
  } catch (error) {
    // Never surface errors or account existence — log and respond the same.
    logServerError("POST /api/auth/forgot-password", error);
  }

  // Always identical response so the endpoint can't be used to enumerate accounts.
  return NextResponse.json({ ok: true }, { status: 200 });
}
