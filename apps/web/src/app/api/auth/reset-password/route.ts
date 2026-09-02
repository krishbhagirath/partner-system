import { NextResponse } from "next/server";
import { z } from "zod";

import {
  checkRateLimit,
  getClientIp,
  rateLimitExceededResponse,
  rateLimitRules,
} from "@/lib/rate-limit";
import { internalErrorResponse, logServerError } from "@/server/api-error";
import { resetPasswordWithToken } from "@/server/password-reset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z
  .object({
    token: z.string().min(1).max(200),
    password: z
      .string()
      .min(10, "Password must be at least 10 characters.")
      .max(100, "Password must be at most 100 characters."),
  })
  .strict();

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    `reset-password:${getClientIp(request)}`,
    rateLimitRules.authSignIn,
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
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join(" ") || "Invalid request." },
      { status: 400 },
    );
  }

  try {
    const result = await resetPasswordWithToken(parsed.data.token, parsed.data.password);

    if (result.status === "ok") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json(
      {
        error:
          result.status === "expired"
            ? "This reset link has expired. Request a new one."
            : "This reset link is invalid. Request a new one.",
      },
      { status: 400 },
    );
  } catch (error) {
    logServerError("POST /api/auth/reset-password", error);
    return internalErrorResponse();
  }
}
