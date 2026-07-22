import "server-only";

import { NextResponse } from "next/server";

export function logServerError(
  context: string,
  error: unknown,
  details: Record<string, string> = {},
) {
  console.error(
    JSON.stringify({
      ...details,
      context,
      level: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function internalErrorResponse() {
  return NextResponse.json(
    { error: "Something went wrong. Please try again later." },
    { status: 500 },
  );
}
