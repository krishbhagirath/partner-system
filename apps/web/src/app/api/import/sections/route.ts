import { NextResponse } from "next/server";

import { AuthenticationError, requireUser } from "@/server/auth";
import { listSectionsForUser } from "@/server/lab-partner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const sections = await listSectionsForUser(user.id);

  return NextResponse.json({
    sections: sections.map((section) => ({
      componentType: section.componentType,
      courseCode: section.courseCode,
      createdAt: section.createdAt.toISOString(),
      dayOfWeek: section.dayOfWeek,
      endTime: toClockTime(section.endTime),
      id: section.id,
      importJobId: section.importJobId,
      location: section.location,
      rawTitle: section.rawTitle,
      sectionCode: section.sectionCode,
      startTime: toClockTime(section.startTime),
      term: section.term,
      updatedAt: section.updatedAt.toISOString(),
    })),
  });
}

function toClockTime(date: Date) {
  return date.toISOString().slice(11, 16);
}
