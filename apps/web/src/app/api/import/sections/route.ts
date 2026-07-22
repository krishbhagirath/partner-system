import { NextResponse } from "next/server";

import { internalErrorResponse, logServerError } from "@/server/api-error";
import { AuthenticationError, requireUser } from "@/server/auth";
import {
  buildCourseComponentKey,
  getPartnerNeedStatsForPairs,
  getPartnerNeedVotesForUser,
  listSectionsForUser,
} from "@/server/lab-partner";

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

  let sections: Awaited<ReturnType<typeof listSectionsForUser>>;
  let partnerNeedStats: Awaited<ReturnType<typeof getPartnerNeedStatsForPairs>>;
  let viewerVotes: Awaited<ReturnType<typeof getPartnerNeedVotesForUser>>;

  try {
    sections = await listSectionsForUser(user.id);
    [partnerNeedStats, viewerVotes] = await Promise.all([
      getPartnerNeedStatsForPairs(
        sections.map((section) => ({
          componentType: section.componentType,
          courseCode: section.courseCode,
        })),
      ),
      getPartnerNeedVotesForUser(user.id),
    ]);
  } catch (error) {
    logServerError("GET /api/import/sections", error, { userId: user.id });

    return internalErrorResponse();
  }

  return NextResponse.json({
    sections: sections.map((section) => {
      const key = buildCourseComponentKey(section.courseCode, section.componentType);
      const stats = partnerNeedStats.get(key);

      return {
        componentType: section.componentType,
        courseCode: section.courseCode,
        createdAt: section.createdAt.toISOString(),
        dayOfWeek: section.dayOfWeek,
        endTime: toClockTime(section.endTime),
        id: section.id,
        importJobId: section.importJobId,
        location: section.location,
        partnerNeedNoCount: stats?.noCount ?? null,
        partnerNeedYesCount: stats?.yesCount ?? null,
        rawTitle: section.rawTitle,
        sectionCode: section.sectionCode,
        startTime: toClockTime(section.startTime),
        term: section.term,
        updatedAt: section.updatedAt.toISOString(),
        viewerPartnerNeedResponse: viewerVotes.get(key) ?? null,
      };
    }),
  });
}

function toClockTime(date: Date) {
  return date.toISOString().slice(11, 16);
}
