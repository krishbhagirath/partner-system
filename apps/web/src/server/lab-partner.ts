import "server-only";

import { cookies } from "next/headers";

import type {
  ComponentType,
  DayOfWeek,
  ImportJobStatus,
  PartnerNeedResponse,
  PartnerRequestStatus,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatSectionLabel } from "@/lib/format";
// Request emails are intentionally not sent (notifyIncomingPartnerRequest stays in
// partner-notifications.ts to re-enable later). Match emails still fire.
import { notifyPartnerMatched } from "@/server/partner-notifications";

export type SectionCreateInput = {
  importJobId?: string | null;
  term: string;
  courseCode: string;
  componentType: ComponentType;
  sectionCode: string;
  dayOfWeek: DayOfWeek;
  startTime: Date;
  endTime: Date;
  location: string;
  rawTitle?: string | null;
};

type SectionDiscoveryKeyInput = {
  term: string;
  courseCode: string;
  componentType: ComponentType;
  sectionCode: string;
  dayOfWeek: DayOfWeek;
  startTime: Date;
  endTime: Date;
};

export type PartnerUserSummary = {
  displayName: string | null;
  email: string;
  id: string;
  image: string | null;
  name: string | null;
  program: string | null;
  year: string | null;
};

// Contact details beyond the account email are only ever selected for a
// *confirmed* match (see matchedPartnerSelect below) — never for discovery
// candidates or pending/sent requests — so they can't leak pre-match.
export type MatchedPartnerContact = PartnerUserSummary & {
  contactInstagram: string | null;
  contactOther: string | null;
  contactPhone: string | null;
};

export type MatchedPartner = {
  matchedAt: Date;
  partner: MatchedPartnerContact;
  requestId: string;
};

const partnerUserSelect = {
  displayName: true,
  email: true,
  id: true,
  image: true,
  name: true,
  program: true,
  year: true,
} as const;

const matchedPartnerSelect = {
  ...partnerUserSelect,
  contactInstagram: true,
  contactOther: true,
  contactPhone: true,
} as const;

const terminalImportJobStatuses = new Set<ImportJobStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

export class PartnerRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "PartnerRequestError";
  }
}

export function createImportJob(userId: string) {
  return db.importJob.create({
    data: {
      userId,
    },
  });
}

export function getImportJobForUser(userId: string, jobId: string) {
  return db.importJob.findFirst({
    include: {
      _count: {
        select: {
          sections: true,
        },
      },
    },
    where: {
      id: jobId,
      userId,
    },
  });
}

export function getLatestSuccessfulImportJobForUser(userId: string) {
  return db.importJob.findFirst({
    include: {
      _count: {
        select: {
          sections: true,
        },
      },
    },
    orderBy: {
      finishedAt: "desc",
    },
    where: {
      status: "SUCCEEDED",
      userId,
    },
  });
}

export function updateImportJobStatus(
  jobId: string,
  status: ImportJobStatus,
  errorMessage?: string,
) {
  const now = new Date();

  return db.importJob.update({
    data: {
      status,
      ...(status === "RUNNING" ? { startedAt: now, finishedAt: null } : {}),
      ...(terminalImportJobStatuses.has(status) ? { finishedAt: now } : {}),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    },
    where: {
      id: jobId,
    },
  });
}

export function createSectionsForUser(userId: string, sections: SectionCreateInput[]) {
  return db.section.createMany({
    data: sections.map((section) => ({
      ...section,
      userId,
    })),
    skipDuplicates: true,
  });
}

/**
 * Re-importing a semester is a clean replace: delete this user's sections for
 * that term (which cascades their discoverability + partner requests for those
 * sections) and insert the fresh set, atomically. Other semesters are untouched.
 */
export function replaceSectionsForTerm(
  userId: string,
  term: string,
  sections: SectionCreateInput[],
) {
  return db.$transaction(async (tx) => {
    await tx.section.deleteMany({ where: { term, userId } });

    return tx.section.createMany({
      data: sections.map((section) => ({ ...section, userId })),
      skipDuplicates: true,
    });
  });
}

export function countSectionsForUser(userId: string) {
  return db.section.count({
    where: {
      userId,
    },
  });
}

export function listSectionsForUser(userId: string, term?: string) {
  return db.section.findMany({
    orderBy: [
      { term: "asc" },
      { courseCode: "asc" },
      { componentType: "asc" },
      { sectionCode: "asc" },
      { dayOfWeek: "asc" },
      { startTime: "asc" },
    ],
    where: {
      userId,
      ...(term ? { term } : {}),
    },
  });
}

/** Distinct terms a user has imported, most-recent first (string order). */
export async function listTermsForUser(userId: string): Promise<string[]> {
  const rows = await db.section.findMany({
    distinct: ["term"],
    orderBy: { term: "desc" },
    select: { term: true },
    where: { userId },
  });

  return rows.map((row) => row.term);
}

/**
 * Resolves which term the app should show. Priority: an explicit ?term= request,
 * then the user's last picked term (remembered in the `partnerup_term` cookie so
 * the selection sticks across navigation), then their most-recent term. Returns
 * null only if they have no terms. Used by pages to scope queries + drive the nav
 * term switcher.
 */
export async function resolveActiveTerm(
  userId: string,
  requested?: string,
): Promise<{ terms: string[]; activeTerm: string | null }> {
  const terms = await listTermsForUser(userId);

  const rawCookie = (await cookies()).get("partnerup_term")?.value;
  const remembered = rawCookie ? decodeURIComponent(rawCookie) : undefined;

  let activeTerm: string | null = null;
  if (requested && terms.includes(requested)) {
    activeTerm = requested;
  } else if (remembered && terms.includes(remembered)) {
    activeTerm = remembered;
  } else {
    activeTerm = terms[0] ?? null;
  }

  return { activeTerm, terms };
}

export function listSectionsWithDiscoverabilityForUser(userId: string, term?: string) {
  return db.section.findMany({
    include: {
      discoverableSections: {
        take: 1,
        where: {
          userId,
        },
      },
    },
    orderBy: [
      { term: "asc" },
      { courseCode: "asc" },
      { componentType: "asc" },
      { sectionCode: "asc" },
      { dayOfWeek: "asc" },
      { startTime: "asc" },
    ],
    where: {
      userId,
      ...(term ? { term } : {}),
    },
  });
}

export async function removeImportedSection(userId: string, sectionId: string) {
  const section = await db.section.findFirst({
    select: {
      id: true,
    },
    where: {
      id: sectionId,
      userId,
    },
  });

  if (!section) {
    throw new PartnerRequestError("Section not found for this user.", 404);
  }

  await db.section.delete({
    where: {
      id: sectionId,
    },
  });
}

export async function listSectionDiscoveryForUser(userId: string, term?: string) {
  const sections = await listSectionsForUser(userId, term);

  if (sections.length === 0) {
    return [];
  }

  const sectionFilters = sections.map((section) => ({
    componentType: section.componentType,
    courseCode: section.courseCode,
    dayOfWeek: section.dayOfWeek,
    endTime: section.endTime,
    sectionCode: section.sectionCode,
    startTime: section.startTime,
    term: section.term,
  }));
  const discoverableSections = await db.discoverableSection.findMany({
    include: {
      section: true,
      user: {
        select: partnerUserSelect,
      },
    },
    where: {
      isActive: true,
      section: {
        is: {
          OR: sectionFilters,
        },
      },
      userId: {
        not: userId,
      },
    },
  });
  const acceptedRequests = await db.partnerRequest.findMany({
    include: {
      receiver: {
        select: matchedPartnerSelect,
      },
      section: true,
      sender: {
        select: matchedPartnerSelect,
      },
    },
    where: {
      section: {
        is: {
          OR: sectionFilters,
        },
      },
      status: "ACCEPTED",
    },
  });
  const matchedUserIdsBySectionKey = new Map<string, Set<string>>();
  const viewerMatchBySectionKey = new Map<string, MatchedPartner>();

  for (const acceptedRequest of acceptedRequests) {
    const sectionKey = buildSectionDiscoveryKey(acceptedRequest.section);
    const matchedUserIds = matchedUserIdsBySectionKey.get(sectionKey) ?? new Set<string>();

    matchedUserIds.add(acceptedRequest.senderId);
    matchedUserIds.add(acceptedRequest.receiverId);
    matchedUserIdsBySectionKey.set(sectionKey, matchedUserIds);

    if (acceptedRequest.senderId === userId || acceptedRequest.receiverId === userId) {
      viewerMatchBySectionKey.set(sectionKey, {
        matchedAt: acceptedRequest.updatedAt,
        partner:
          acceptedRequest.senderId === userId ? acceptedRequest.receiver : acceptedRequest.sender,
        requestId: acceptedRequest.id,
      });
    }
  }
  const receiverIds = [...new Set(discoverableSections.map((section) => section.userId))];
  const existingRequests =
    receiverIds.length === 0
      ? []
      : await db.partnerRequest.findMany({
          include: {
            section: true,
          },
          where: {
            OR: [
              {
                receiverId: {
                  in: receiverIds,
                },
                section: {
                  is: {
                    OR: sectionFilters,
                  },
                },
                senderId: userId,
              },
              {
                receiverId: userId,
                section: {
                  is: {
                    OR: sectionFilters,
                  },
                },
                senderId: {
                  in: receiverIds,
                },
              },
            ],
          },
        });
  // Canceled requests (withdrawn or auto-canceled by a match that has since
  // dissolved) are dead: they must not block sending a fresh request.
  const existingRequestBySectionAndReceiver = new Map(
    existingRequests
      .filter((request) => request.status !== "CANCELED")
      .map((request) => [
        `${buildSectionDiscoveryKey(request.section)}::${
          request.senderId === userId ? request.receiverId : request.senderId
        }`,
        request,
      ]),
  );
  const matchesBySectionKey = new Map<
    string,
    Array<{
      discoverableSectionId: string;
      note: string | null;
      user: PartnerUserSummary;
    }>
  >();
  const seenMatchKeys = new Set<string>();

  for (const discoverableSection of discoverableSections) {
    const sectionKey = buildSectionDiscoveryKey(discoverableSection.section);
    const matchKey = `${sectionKey}::${discoverableSection.userId}`;

    if (seenMatchKeys.has(matchKey)) {
      continue;
    }

    seenMatchKeys.add(matchKey);

    if (matchedUserIdsBySectionKey.get(sectionKey)?.has(discoverableSection.userId)) {
      continue;
    }

    const matches = matchesBySectionKey.get(sectionKey) ?? [];
    matches.push({
      discoverableSectionId: discoverableSection.id,
      note: discoverableSection.note,
      user: discoverableSection.user,
    });
    matchesBySectionKey.set(sectionKey, matches);
  }

  return sections.map((section) => {
    const sectionKey = buildSectionDiscoveryKey(section);
    const matchedPartner = viewerMatchBySectionKey.get(sectionKey) ?? null;

    return {
      matchedPartner,
      matches: matchedPartner
        ? []
        : sortDiscoveryMatches(
            (matchesBySectionKey.get(sectionKey) ?? []).map((match) => ({
              ...match,
              request:
                existingRequestBySectionAndReceiver.get(`${sectionKey}::${match.user.id}`) ?? null,
            })),
          ),
      section,
    };
  });
}

export async function toggleDiscoverableSection(
  userId: string,
  sectionId: string,
  isActive: boolean,
  note?: string | null,
  partnerNeedResponse?: PartnerNeedResponse,
) {
  const section = await db.section.findFirst({
    select: {
      componentType: true,
      courseCode: true,
      id: true,
    },
    where: {
      id: sectionId,
      userId,
    },
  });

  if (!section) {
    throw new Error("Section not found for this user.");
  }

  if (partnerNeedResponse) {
    await recordPartnerNeedVote(
      userId,
      section.courseCode,
      section.componentType,
      partnerNeedResponse,
    );
  }

  const notePatch = note === undefined ? {} : { note };

  return db.discoverableSection.upsert({
    create: {
      isActive,
      note: note ?? null,
      sectionId,
      userId,
    },
    update: {
      isActive,
      ...notePatch,
    },
    where: {
      userId_sectionId: {
        sectionId,
        userId,
      },
    },
  });
}

export function recordPartnerNeedVote(
  userId: string,
  courseCode: string,
  componentType: ComponentType,
  response: PartnerNeedResponse,
) {
  return db.partnerNeedVote.upsert({
    create: {
      componentType,
      courseCode,
      response,
      userId,
    },
    update: {
      response,
    },
    where: {
      userId_courseCode_componentType: {
        componentType,
        courseCode,
        userId,
      },
    },
  });
}

export function buildCourseComponentKey(courseCode: string, componentType: ComponentType) {
  return `${courseCode}::${componentType}`;
}

// The viewer's own prior answer for each course+component they've imported,
// so the onboarding wizard / settings can pre-select their existing vote
// instead of re-asking from scratch.
export async function getPartnerNeedVotesForUser(userId: string) {
  const votes = await db.partnerNeedVote.findMany({
    where: {
      userId,
    },
  });

  return new Map(
    votes.map((vote) => [buildCourseComponentKey(vote.courseCode, vote.componentType), vote.response]),
  );
}

export type PartnerNeedStats = {
  noCount: number;
  yesCount: number;
};

// A minimum sample size before showing the aggregate as a hint — a single
// vote shouldn't read as "the class has decided."
const MIN_VOTES_FOR_HINT = 3;

export async function getPartnerNeedStatsForPairs(
  pairs: Array<{ componentType: ComponentType; courseCode: string }>,
): Promise<Map<string, PartnerNeedStats>> {
  if (pairs.length === 0) {
    return new Map();
  }

  const votes = await db.partnerNeedVote.findMany({
    select: {
      componentType: true,
      courseCode: true,
      response: true,
    },
    where: {
      OR: pairs.map((pair) => ({
        componentType: pair.componentType,
        courseCode: pair.courseCode,
      })),
    },
  });

  const stats = new Map<string, PartnerNeedStats>();

  for (const vote of votes) {
    if (vote.response === "UNSURE") {
      continue;
    }

    const key = buildCourseComponentKey(vote.courseCode, vote.componentType);
    const current = stats.get(key) ?? { noCount: 0, yesCount: 0 };

    if (vote.response === "YES") {
      current.yesCount += 1;
    } else {
      current.noCount += 1;
    }

    stats.set(key, current);
  }

  for (const [key, value] of stats) {
    if (value.yesCount + value.noCount < MIN_VOTES_FOR_HINT) {
      stats.delete(key);
    }
  }

  return stats;
}

function buildSectionIdentityFilter(section: SectionDiscoveryKeyInput) {
  return {
    componentType: section.componentType,
    courseCode: section.courseCode,
    dayOfWeek: section.dayOfWeek,
    endTime: section.endTime,
    sectionCode: section.sectionCode,
    startTime: section.startTime,
    term: section.term,
  };
}

export function buildSectionDiscoveryKey(section: SectionDiscoveryKeyInput) {
  return [
    section.term,
    section.courseCode,
    section.componentType,
    section.sectionCode,
    section.dayOfWeek,
    section.startTime.toISOString(),
    section.endTime.toISOString(),
  ].join("::");
}

function sortDiscoveryMatches<
  T extends { user: { displayName: string | null; email: string; name: string | null } },
>(matches: T[]) {
  return [...matches].sort((first, second) => {
    const firstName = first.user.displayName ?? first.user.name ?? first.user.email;
    const secondName = second.user.displayName ?? second.user.name ?? second.user.email;

    return firstName.localeCompare(secondName);
  });
}

export async function createPartnerRequest(
  senderId: string,
  receiverId: string,
  sectionId: string,
  note?: string | null,
) {
  if (senderId === receiverId) {
    throw new PartnerRequestError("A user cannot create a partner request for themselves.", 400);
  }

  const senderSection = await db.section.findFirst({
    where: {
      id: sectionId,
      userId: senderId,
    },
  });

  if (!senderSection) {
    throw new PartnerRequestError("Section not found for this user.", 404);
  }

  const sectionIdentityFilter = buildSectionIdentityFilter(senderSection);
  const receiverDiscoverableSection = await db.discoverableSection.findFirst({
    select: {
      id: true,
    },
    where: {
      isActive: true,
      section: {
        is: sectionIdentityFilter,
      },
      userId: receiverId,
    },
  });

  if (!receiverDiscoverableSection) {
    throw new PartnerRequestError("This student is not discoverable for that section.", 403);
  }

  const normalizedNote = note?.trim() || null;
  const existingActivePairRequest = await db.partnerRequest.findFirst({
    where: {
      OR: [
        {
          receiverId,
          senderId,
        },
        {
          receiverId: senderId,
          senderId: receiverId,
        },
      ],
      section: {
        is: sectionIdentityFilter,
      },
      status: {
        in: ["PENDING", "ACCEPTED"],
      },
    },
  });

  if (existingActivePairRequest) {
    return existingActivePairRequest;
  }

  const existingMatchForEitherUser = await db.partnerRequest.findFirst({
    where: {
      OR: [
        { senderId: { in: [senderId, receiverId] } },
        { receiverId: { in: [senderId, receiverId] } },
      ],
      section: {
        is: sectionIdentityFilter,
      },
      status: "ACCEPTED",
    },
  });

  if (existingMatchForEitherUser) {
    throw new PartnerRequestError(
      existingMatchForEitherUser.senderId === senderId ||
        existingMatchForEitherUser.receiverId === senderId
        ? "You already have a confirmed partner for this section."
        : "This student already has a confirmed partner for this section.",
      409,
    );
  }

  const existingRequest = await db.partnerRequest.findUnique({
    where: {
      senderId_receiverId_sectionId: {
        receiverId,
        sectionId,
        senderId,
      },
    },
  });

  if (existingRequest?.status === "PENDING" || existingRequest?.status === "ACCEPTED") {
    return existingRequest;
  }

  const request = existingRequest
    ? await db.partnerRequest.update({
        data: {
          note: normalizedNote,
          status: "PENDING",
        },
        where: {
          id: existingRequest.id,
        },
      })
    : await db.partnerRequest.create({
        data: {
          note: normalizedNote,
          receiverId,
          sectionId,
          senderId,
        },
      });

  // Request emails disabled (deliverability to McMaster inboxes is unreliable and
  // the setting was removed). The in-app notification bell still shows the request.

  return request;
}

export async function respondToPartnerRequest(
  receiverId: string,
  requestId: string,
  status: Extract<PartnerRequestStatus, "ACCEPTED" | "DECLINED">,
) {
  const request = await db.partnerRequest.findFirst({
    include: {
      section: true,
    },
    where: {
      id: requestId,
      receiverId,
      status: "PENDING",
    },
  });

  if (!request) {
    throw new PartnerRequestError("Pending request not found for this user.", 404);
  }

  if (status === "DECLINED") {
    return db.partnerRequest.update({
      data: {
        status,
      },
      where: {
        id: requestId,
      },
    });
  }

  const participantIds = [request.senderId, request.receiverId];
  const sectionIdentityFilter = buildSectionIdentityFilter(request.section);

  try {
    const accepted = await db.$transaction(
      async (tx) => {
        const existingMatchForEitherUser = await tx.partnerRequest.findFirst({
          where: {
            OR: [{ senderId: { in: participantIds } }, { receiverId: { in: participantIds } }],
            section: {
              is: sectionIdentityFilter,
            },
            status: "ACCEPTED",
          },
        });

        if (existingMatchForEitherUser) {
          throw new PartnerRequestError(
            "One of you already has a confirmed partner for this section.",
            409,
          );
        }

        const acceptedRequest = await tx.partnerRequest.update({
          data: {
            status: "ACCEPTED",
          },
          where: {
            id: requestId,
          },
        });

        await tx.partnerRequest.updateMany({
          data: {
            status: "CANCELED",
          },
          where: {
            id: {
              not: requestId,
            },
            OR: [{ senderId: { in: participantIds } }, { receiverId: { in: participantIds } }],
            section: {
              is: sectionIdentityFilter,
            },
            status: "PENDING",
          },
        });

        return acceptedRequest;
      },
      // Serializable isolation stops two concurrent accepts from both passing
      // the "already matched?" check and creating a double match for one
      // section (the check-then-write is otherwise a phantom-read race).
      { isolationLevel: "Serializable" },
    );

    // Best-effort: email both participants they've matched; never breaks accept.
    await notifyPartnerMatched(accepted.id);

    return accepted;
  } catch (error) {
    if (error instanceof PartnerRequestError) {
      throw error;
    }

    // Postgres serialization failure (Prisma P2034): another accept won the
    // race. Surface it as a refreshable conflict instead of a 500.
    if (isTransactionConflict(error)) {
      throw new PartnerRequestError(
        "One of you just matched — refresh and try again.",
        409,
      );
    }

    throw error;
  }
}

function isTransactionConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2034"
  );
}

export async function withdrawPartnerRequest(senderId: string, requestId: string) {
  const request = await db.partnerRequest.findFirst({
    select: {
      id: true,
    },
    where: {
      id: requestId,
      senderId,
      status: "PENDING",
    },
  });

  if (!request) {
    throw new PartnerRequestError("Pending request not found for this user.", 404);
  }

  return db.partnerRequest.update({
    data: {
      status: "CANCELED",
    },
    where: {
      id: requestId,
    },
  });
}

export async function dissolveMatch(userId: string, requestId: string) {
  const request = await db.partnerRequest.findFirst({
    select: {
      id: true,
    },
    where: {
      id: requestId,
      OR: [{ senderId: userId }, { receiverId: userId }],
      status: "ACCEPTED",
    },
  });

  if (!request) {
    throw new PartnerRequestError("Match not found for this user.", 404);
  }

  // Both users keep their DiscoverableSection settings, so anyone who was
  // "looking" before the match automatically reappears in discovery.
  return db.partnerRequest.update({
    data: {
      status: "CANCELED",
    },
    where: {
      id: requestId,
    },
  });
}

export async function getMatchedPartnersBySectionKeyForUser(userId: string) {
  const acceptedRequests = await db.partnerRequest.findMany({
    include: {
      receiver: {
        select: matchedPartnerSelect,
      },
      section: true,
      sender: {
        select: matchedPartnerSelect,
      },
    },
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      status: "ACCEPTED",
    },
  });
  const matchedPartnersBySectionKey = new Map<string, MatchedPartner>();

  for (const acceptedRequest of acceptedRequests) {
    matchedPartnersBySectionKey.set(buildSectionDiscoveryKey(acceptedRequest.section), {
      matchedAt: acceptedRequest.updatedAt,
      partner:
        acceptedRequest.senderId === userId ? acceptedRequest.receiver : acceptedRequest.sender,
      requestId: acceptedRequest.id,
    });
  }

  return matchedPartnersBySectionKey;
}

export type MatchWithSection = {
  matchedAt: Date;
  partner: MatchedPartnerContact;
  requestId: string;
  section: {
    componentType: ComponentType;
    courseCode: string;
    sectionCode: string;
    term: string;
  };
};

export async function listMatchesForUser(
  userId: string,
  term?: string,
): Promise<MatchWithSection[]> {
  const acceptedRequests = await db.partnerRequest.findMany({
    include: {
      receiver: {
        select: matchedPartnerSelect,
      },
      section: true,
      sender: {
        select: matchedPartnerSelect,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      status: "ACCEPTED",
      ...(term ? { section: { term } } : {}),
    },
  });

  return acceptedRequests.map((acceptedRequest) => ({
    matchedAt: acceptedRequest.updatedAt,
    partner:
      acceptedRequest.senderId === userId ? acceptedRequest.receiver : acceptedRequest.sender,
    requestId: acceptedRequest.id,
    section: acceptedRequest.section,
  }));
}

export function countPendingIncomingRequests(userId: string) {
  return db.partnerRequest.count({
    where: {
      receiverId: userId,
      status: "PENDING",
    },
  });
}

export function getPartnerRequestsForUser(userId: string, term?: string) {
  return db.partnerRequest.findMany({
    include: {
      receiver: {
        select: partnerUserSelect,
      },
      section: true,
      sender: {
        select: partnerUserSelect,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      ...(term ? { section: { term } } : {}),
    },
  });
}

export type NotificationItem = {
  courseLabel: string;
  id: string;
  kind: "request_received" | "request_accepted";
  occurredAt: Date;
  otherUser: PartnerUserSummary;
};

export async function getRecentNotificationsForUser(
  userId: string,
  limit = 8,
): Promise<NotificationItem[]> {
  const [received, accepted] = await Promise.all([
    db.partnerRequest.findMany({
      include: {
        section: true,
        sender: {
          select: partnerUserSelect,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      where: {
        receiverId: userId,
        status: "PENDING",
      },
    }),
    db.partnerRequest.findMany({
      include: {
        receiver: {
          select: partnerUserSelect,
        },
        section: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: limit,
      where: {
        senderId: userId,
        status: "ACCEPTED",
      },
    }),
  ]);

  const items: NotificationItem[] = [
    ...received.map((request) => ({
      courseLabel: formatSectionLabel(request.section),
      id: `request-${request.id}`,
      kind: "request_received" as const,
      occurredAt: request.createdAt,
      otherUser: request.sender,
    })),
    ...accepted.map((request) => ({
      courseLabel: formatSectionLabel(request.section),
      id: `accepted-${request.id}`,
      kind: "request_accepted" as const,
      occurredAt: request.updatedAt,
      otherUser: request.receiver,
    })),
  ];

  items.sort((first, second) => second.occurredAt.getTime() - first.occurredAt.getTime());

  return items.slice(0, limit);
}

export function getUserProfile(userId: string) {
  return db.user.findUnique({
    select: {
      bio: true,
      contactInstagram: true,
      contactOther: true,
      contactPhone: true,
      displayName: true,
      email: true,
      id: true,
      name: true,
      notifyOnMatch: true,
      notifyOnRequest: true,
      program: true,
      year: true,
    },
    where: {
      id: userId,
    },
  });
}

export function updateUserProfile(
  userId: string,
  data: {
    bio: string | null;
    contactInstagram: string | null;
    contactOther: string | null;
    contactPhone: string | null;
    displayName: string;
    program: string | null;
    year: string | null;
  },
) {
  return db.user.update({
    data,
    where: {
      id: userId,
    },
  });
}

export function updateNotificationPreferences(
  userId: string,
  data: {
    notifyOnMatch: boolean;
    notifyOnRequest: boolean;
  },
) {
  return db.user.update({
    data,
    where: {
      id: userId,
    },
  });
}

export function deleteUser(userId: string) {
  return db.user.delete({
    where: {
      id: userId,
    },
  });
}
