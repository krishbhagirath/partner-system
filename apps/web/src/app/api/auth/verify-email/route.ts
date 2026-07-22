import { NextResponse } from "next/server";

import { logServerError } from "@/server/api-error";
import { consumeEmailVerificationToken } from "@/server/email-verification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/auth/verify-email?error=invalid-token", request.url),
    );
  }

  try {
    const result = await consumeEmailVerificationToken(token);

    if (result.status === "expired") {
      return NextResponse.redirect(
        new URL("/auth/verify-email?error=expired-token", request.url),
      );
    }

    if (result.status === "invalid") {
      return NextResponse.redirect(
        new URL("/auth/verify-email?error=invalid-token", request.url),
      );
    }

    return NextResponse.redirect(new URL("/auth/signin?verified=1", request.url));
  } catch (error) {
    logServerError("GET /api/auth/verify-email", error);

    return NextResponse.redirect(
      new URL("/auth/verify-email?error=invalid-token", request.url),
    );
  }
}
