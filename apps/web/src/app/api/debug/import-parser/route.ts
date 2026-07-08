import { NextResponse } from "next/server";
import { z } from "zod";

import { parseWeeklyScheduleHtmlForDebug } from "@/server/import-parser";

export const runtime = "nodejs";

const parseRequestSchema = z.object({
  html: z
    .string()
    .trim()
    .min(1, "Paste raw Mosaic weekly schedule HTML before parsing.")
    .max(1_000_000, "HTML is too large for the debug parser."),
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request.",
        issues: ["Send JSON with an html field."],
      },
      { status: 400 },
    );
  }

  const parsedRequest = parseRequestSchema.safeParse(body);

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
    return NextResponse.json({
      sections: parseWeeklyScheduleHtmlForDebug(parsedRequest.data.html),
    });
  } catch (error) {
    console.error("Debug import parser failed.", error);

    return NextResponse.json(
      {
        error: "Unable to parse the provided HTML.",
        issues: ["The parser could not read this markup. Check the pasted HTML and try again."],
      },
      { status: 422 },
    );
  }
}
