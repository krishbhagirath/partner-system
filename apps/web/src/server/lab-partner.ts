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
import { buildSectionDiscoveryKey, buildSectionIdentityFilter } from "@/server/section-key";
import {
  pickTeamContact,
  resolveJoinPlan,
  shapeDiscoveryEntry,
  type TeamState,
} from "@/server/team-rules";
import { TEAMS_ENABLED } from "@/lib/feature-flags";
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

// Re-exported so existing callers (app/settings/page.tsx) keep importing it from
// here; the implementation lives in section-key.ts because the teams backfill has
// to compute the same key from a plain tsx script, outside `server-only`.
export { buildSectionDiscoveryKey };

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

/**
 * The viewer's own team for a section. `teammates` carries contact details because
 * everyone here is a confirmed teammate; `joinedAt` is the viewer's own membership
 * date, which is more honest than the old `matchedAt` (that was the request row's
 * `updatedAt`, so it moved whenever anything touched the row).
 */
export type ViewerTeam = {
  isComplete: boolean;
  joinedAt: Date;
  teamId: string;
  teammates: MatchedPartnerContact[];
};

/** A joinable team in discovery. Deliberately carries no contact details. */
export type DiscoveryTeam = {
  contactUserId: string;
  members: Array<{ joinedAt: Date; user: PartnerUserSummary }>;
  openedAt: Date;
  request: { id: string; status: PartnerRequestStatus } | null;
  teamId: string;
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

export type SectionSyncResult = {
  added: number;
  kept: number;
  removed: number;
};

/**
 * Reconciles a term's sections against a freshly imported timetable.
 *
 * This used to delete every section for the term and re-insert, which meant a student
 * who re-imported after adding one course silently lost everything attached to the
 * courses they already had: discoverability, sent and received requests, and (since
 * teams cascade from Section) their team membership. The new rows were identical in
 * content but had new ids, so every relationship pointing at the old ones went with
 * them.
 *
 * Instead, match on the seven identity fields and touch only what actually changed:
 *   - unchanged sections keep their row, and therefore everything attached to them
 *   - genuinely new sections are inserted
 *   - sections no longer on the timetable are removed (the student dropped them)
 *
 * The wipe was never needed to avoid duplicates — Section already has a unique index
 * on (userId + the seven identity fields), so re-inserting is a no-op.
 */
export function syncSectionsForTerm(
  userId: string,
  term: string,
  sections: SectionCreateInput[],
): Promise<SectionSyncResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.section.findMany({ where: { term, userId } });
    const incomingByKey = new Map(
      sections.map((section) => [buildSectionDiscoveryKey({ ...section, term }), section]),
    );
    const existingKeys = new Set(existing.map(buildSectionDiscoveryKey));

    const removable = existing.filter(
      (section) => !incomingByKey.has(buildSectionDiscoveryKey(section)),
    );
    const additions = [...incomingByKey.entries()]
      .filter(([key]) => !existingKeys.has(key))
      .map(([, section]) => section);

    if (removable.length > 0) {
      // Collect team ids before the delete: TeamMember cascades from Section, so a
      // dropped course can leave a team with a single member behind.
      const affectedTeamIds = await findTeamIdsForUsers(tx, [userId]);

      await tx.section.deleteMany({
        where: { id: { in: removable.map((section) => section.id) } },
      });

      await pruneUndersizedTeams(tx, affectedTeamIds);
    }

    if (additions.length > 0) {
      await tx.section.createMany({
        data: additions.map((section) => ({ ...section, userId })),
        skipDuplicates: true,
      });
    }

    return {
      added: additions.length,
      kept: existing.length - removable.length,
      removed: removable.length,
    };
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

  await db.$transaction(async (tx) => {
    // TeamMember cascades from Section, so removing a section drops this user out of
    // any team for it. Prune afterwards so a team left with one member is deleted
    // rather than lingering.
    const affectedTeamIds = await findTeamIdsForUsers(tx, [userId]);

    await tx.section.delete({ where: { id: sectionId } });
    await pruneUndersizedTeams(tx, affectedTeamIds);
  });
}

export type DiscoveryEntry = {
  candidates: Array<{
    discoverableSectionId: string;
    note: string | null;
    request: { id: string; status: PartnerRequestStatus } | null;
    user: PartnerUserSummary;
    userId: string;
  }>;
  openTeams: DiscoveryTeam[];
  section: Awaited<ReturnType<typeof listSectionsForUser>>[number];
  viewerTeam: ViewerTeam | null;
};

/**
 * Everything a viewer may see for each of their sections: their own team, the teams
 * with room that they could ask to join, and the classmates who are not on a team.
 *
 * Contact details are kept safe *by construction*: the viewer's own team is loaded by
 * a separate query scoped to their membership (matchedPartnerSelect), while teams and
 * candidates in discovery only ever use partnerUserSelect. There is no code path that
 * could select a contact field for someone the viewer does not share a team with.
 */
export async function listSectionDiscoveryForUser(
  userId: string,
  term?: string,
): Promise<DiscoveryEntry[]> {
  const sections = await listSectionsForUser(userId, term);

  if (sections.length === 0) {
    return [];
  }

  const sectionFilters = sections.map(buildSectionIdentityFilter);
  const sectionKeys = sections.map(buildSectionDiscoveryKey);

  const [discoverableSections, teamMemberships, viewerTeamsBySectionKey] = await Promise.all([
    db.discoverableSection.findMany({
      include: {
        section: true,
        user: { select: partnerUserSelect },
      },
      where: {
        isActive: true,
        section: { is: { OR: sectionFilters } },
        userId: { not: userId },
      },
    }),
    // Every membership in these sections, so we know who is on a team (and therefore
    // must not appear as a solo classmate) and which teams have room.
    db.teamMember.findMany({
      orderBy: { joinedAt: "asc" },
      select: {
        joinedAt: true,
        sectionKey: true,
        team: { select: { id: true, isComplete: true, updatedAt: true } },
        user: { select: partnerUserSelect },
        userId: true,
      },
      where: { sectionKey: { in: sectionKeys } },
    }),
    getTeamsBySectionKeyForUser(userId),
  ]);

  const teamedUserIdsBySectionKey = new Map<string, Set<string>>();
  const openTeamsBySectionKey = new Map<string, Map<string, DiscoveryTeam>>();

  for (const membership of teamMemberships) {
    const teamed =
      teamedUserIdsBySectionKey.get(membership.sectionKey) ?? new Set<string>();
    teamed.add(membership.userId);
    teamedUserIdsBySectionKey.set(membership.sectionKey, teamed);

    if (membership.team.isComplete) {
      continue;
    }

    const teams = openTeamsBySectionKey.get(membership.sectionKey) ?? new Map<string, DiscoveryTeam>();
    const team = teams.get(membership.team.id) ?? {
      contactUserId: membership.userId,
      members: [],
      openedAt: membership.team.updatedAt,
      request: null,
      teamId: membership.team.id,
    };

    team.members.push({ joinedAt: membership.joinedAt, user: membership.user });
    teams.set(membership.team.id, team);
    openTeamsBySectionKey.set(membership.sectionKey, teams);
  }

  const receiverIds = [
    ...new Set([
      ...discoverableSections.map((section) => section.userId),
      ...teamMemberships.map((membership) => membership.userId),
    ]),
  ].filter((id) => id !== userId);

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
                receiverId: { in: receiverIds },
                section: { is: { OR: sectionFilters } },
                senderId: userId,
              },
              {
                receiverId: userId,
                section: { is: { OR: sectionFilters } },
                senderId: { in: receiverIds },
              },
            ],
          },
        });

  // Canceled requests (withdrawn, or auto-canceled when a team was marked complete)
  // are dead: they must not block sending a fresh one.
  const existingRequestBySectionAndUser = new Map(
    existingRequests
      .filter((request) => request.status !== "CANCELED")
      .map((request) => [
        `${buildSectionDiscoveryKey(request.section)}::${
          request.senderId === userId ? request.receiverId : request.senderId
        }`,
        { id: request.id, status: request.status },
      ]),
  );

  const candidatesBySectionKey = new Map<string, DiscoveryEntry["candidates"]>();
  const seenCandidateKeys = new Set<string>();

  for (const discoverableSection of discoverableSections) {
    const sectionKey = buildSectionDiscoveryKey(discoverableSection.section);
    const candidateKey = `${sectionKey}::${discoverableSection.userId}`;

    if (seenCandidateKeys.has(candidateKey)) {
      continue;
    }

    seenCandidateKeys.add(candidateKey);

    const candidates = candidatesBySectionKey.get(sectionKey) ?? [];

    candidates.push({
      discoverableSectionId: discoverableSection.id,
      note: discoverableSection.note,
      request: existingRequestBySectionAndUser.get(candidateKey) ?? null,
      user: discoverableSection.user,
      userId: discoverableSection.userId,
    });
    candidatesBySectionKey.set(sectionKey, candidates);
  }

  return sections.map((section, index) => {
    // Built from `sections` above, so index-aligned by construction.
    const sectionKey = sectionKeys[index] as string;
    const viewerTeam = viewerTeamsBySectionKey.get(sectionKey) ?? null;
    const openTeams = [...(openTeamsBySectionKey.get(sectionKey)?.values() ?? [])].map((team) => {
      const contact = pickTeamContact(
        team.members.map((member) => ({ joinedAt: member.joinedAt, userId: member.user.id })),
      );
      const contactUserId = contact?.userId ?? team.contactUserId;

      return {
        ...team,
        contactUserId,
        request: existingRequestBySectionAndUser.get(`${sectionKey}::${contactUserId}`) ?? null,
      };
    });

    const shaped = shapeDiscoveryEntry({
      candidates: sortDiscoveryMatches(candidatesBySectionKey.get(sectionKey) ?? []),
      openTeams: openTeams.map((team) => ({
        ...team,
        memberUserIds: team.members.map((member) => member.user.id),
      })),
      teamedUserIds: teamedUserIdsBySectionKey.get(sectionKey) ?? new Set<string>(),
      teamsEnabled: TEAMS_ENABLED,
      viewerTeam: viewerTeam
        ? {
            isComplete: viewerTeam.isComplete,
            memberUserIds: [userId, ...viewerTeam.teammates.map((teammate) => teammate.id)],
            teamId: viewerTeam.teamId,
          }
        : null,
    });

    return {
      candidates: shaped.candidates,
      // Newest-opened first, then the smallest team — a pair looking for a third is
      // the easiest ask to say yes to.
      openTeams: [...shaped.openTeams].sort(
        (left, right) =>
          right.openedAt.getTime() - left.openedAt.getTime() ||
          left.members.length - right.members.length,
      ),
      section,
      viewerTeam:
        shaped.viewerTeam && viewerTeam
          ? { ...viewerTeam, isComplete: shaped.viewerTeam.isComplete }
          : null,
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

function sortDiscoveryMatches<
  T extends { user: { displayName: string | null; email: string; name: string | null } },
>(matches: T[]) {
  return [...matches].sort((first, second) => {
    const firstName = first.user.displayName ?? first.user.name ?? first.user.email;
    const secondName = second.user.displayName ?? second.user.name ?? second.user.email;

    return firstName.localeCompare(secondName);
  });
}

type TeamTx = Parameters<Parameters<typeof db.$transaction>[0]>[0] | typeof db;

/**
 * The user's current team for one section identity, in the shape team-rules.ts wants.
 * Returns null when they have none, which is the normal state for a solo student —
 * teams are created lazily on the first accept and never exist with one member.
 */
async function getTeamStateForUser(
  tx: TeamTx,
  userId: string,
  sectionKey: string,
): Promise<TeamState> {
  const membership = await tx.teamMember.findUnique({
    select: {
      team: {
        select: {
          id: true,
          isComplete: true,
          members: { select: { userId: true } },
        },
      },
    },
    where: {
      userId_sectionKey: { sectionKey, userId },
    },
  });

  if (!membership) {
    return null;
  }

  return {
    isComplete: membership.team.isComplete,
    memberUserIds: membership.team.members.map((member) => member.userId),
    teamId: membership.team.id,
  };
}

/**
 * The sweep that used to run on accept (cancelling every other pending request for
 * both participants). It belongs to *becoming complete*, not to accepting: an open
 * team keeps taking join requests, and only closing it makes the rest dead.
 *
 * Generalised from two participants to N members, and still both directions — if
 * your team is complete, your outgoing asks are off too.
 */
function cancelPendingRequestsForMembers(
  tx: TeamTx,
  sectionIdentityFilter: ReturnType<typeof buildSectionIdentityFilter>,
  memberUserIds: string[],
  exceptRequestId?: string,
) {
  return tx.partnerRequest.updateMany({
    data: {
      status: "CANCELED",
    },
    where: {
      ...(exceptRequestId ? { id: { not: exceptRequestId } } : {}),
      OR: [{ senderId: { in: memberUserIds } }, { receiverId: { in: memberUserIds } }],
      section: {
        is: sectionIdentityFilter,
      },
      status: "PENDING",
    },
  });
}

/**
 * Deletes teams that no longer have two members. Cascades from User and Section can
 * strip a member without going through leaveTeam, so anything that deletes those
 * calls this afterwards rather than leaving a team of one behind.
 */
async function pruneUndersizedTeams(tx: TeamTx, teamIds: string[]) {
  if (teamIds.length === 0) {
    return;
  }

  const survivors = await tx.team.findMany({
    select: { _count: { select: { members: true } }, id: true },
    where: { id: { in: teamIds } },
  });

  const undersized = survivors
    .filter((team) => team._count.members < 2)
    .map((team) => team.id);

  if (undersized.length > 0) {
    await tx.team.deleteMany({ where: { id: { in: undersized } } });
  }
}

/** Team ids a set of users belong to, so callers can prune after a cascade. */
async function findTeamIdsForUsers(tx: TeamTx, userIds: string[]) {
  const memberships = await tx.teamMember.findMany({
    select: { teamId: true },
    where: { userId: { in: userIds } },
  });

  return [...new Set(memberships.map((membership) => membership.teamId))];
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
  const receiverSectionKey = buildSectionDiscoveryKey(senderSection);
  const [receiverDiscoverableSection, receiverOpenMembership] = await Promise.all([
    db.discoverableSection.findFirst({
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
    }),
    // A member of an open team is requestable even with their discoverability flag
    // off: they are rendered as part of a joinable team card, so refusing the
    // request would show an "Ask to join" button that always fails.
    db.teamMember.findUnique({
      select: { id: true },
      where: {
        team: { isComplete: false },
        userId_sectionKey: { sectionKey: receiverSectionKey, userId: receiverId },
      },
    }),
  ]);

  if (!receiverDiscoverableSection && !receiverOpenMembership) {
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

  // Replaces the old "either of you already has a confirmed partner" check. The
  // question is no longer "is anyone matched" but "can these two end up on the same
  // team" — see resolveJoinPlan for the full matrix. Re-checked inside the accept
  // transaction, since either side's team can change between asking and answering.
  const sectionKey = buildSectionDiscoveryKey(senderSection);
  const [senderTeam, receiverTeam] = await Promise.all([
    getTeamStateForUser(db, senderId, sectionKey),
    getTeamStateForUser(db, receiverId, sectionKey),
  ]);
  const joinPlan = resolveJoinPlan({ receiverId, receiverTeam, senderId, senderTeam });

  if (joinPlan.kind === "conflict") {
    throw new PartnerRequestError(joinPlan.message, joinPlan.statusCode);
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

  // Context only — which team the sender meant to join. Accept recomputes the real
  // target from the responder's team at that moment and overwrites this.
  const targetTeamId = joinPlan.kind === "join-team" ? joinPlan.teamId : null;

  const request = existingRequest
    ? await db.partnerRequest.update({
        data: {
          note: normalizedNote,
          status: "PENDING",
          targetTeamId,
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
          targetTeamId,
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

  const sectionIdentityFilter = buildSectionIdentityFilter(request.section);
  const sectionKey = buildSectionDiscoveryKey(request.section);

  try {
    const accepted = await db.$transaction(async (tx) => {
      // Re-resolved rather than trusting request.targetTeamId: either side may have
      // joined or left a team between sending and answering.
      const [senderTeam, receiverTeam] = await Promise.all([
        getTeamStateForUser(tx, request.senderId, sectionKey),
        getTeamStateForUser(tx, request.receiverId, sectionKey),
      ]);
      const plan = resolveJoinPlan({
        receiverId: request.receiverId,
        receiverTeam,
        senderId: request.senderId,
        senderTeam,
      });

      if (plan.kind === "conflict") {
        throw new PartnerRequestError(plan.message, plan.statusCode);
      }

      let teamId: string;
      let becameComplete: boolean;

      if (plan.kind === "join-team") {
        // Bump updatedAt *before* re-reading isComplete: that takes a row lock on the
        // team, so a concurrent "mark complete" serializes against this join under
        // plain READ COMMITTED. It also drives the recently-opened sort in discovery.
        const lockedTeam = await tx.team.update({
          data: { updatedAt: new Date() },
          select: { id: true, isComplete: true },
          where: { id: plan.teamId },
        });

        if (lockedTeam.isComplete) {
          throw new PartnerRequestError("That team just filled up.", 409);
        }

        const joinerSection = await tx.section.findFirst({
          select: { id: true },
          where: { ...sectionIdentityFilter, userId: plan.joinerId },
        });

        if (!joinerSection) {
          throw new PartnerRequestError(
            "You need to import this section before joining a team for it.",
            404,
          );
        }

        await tx.teamMember.create({
          data: {
            sectionId: joinerSection.id,
            sectionKey,
            teamId: lockedTeam.id,
            userId: plan.joinerId,
          },
        });

        teamId = lockedTeam.id;
        // An open team keeps accepting: no sweep here. That only happens when someone
        // marks the team complete.
        becameComplete = false;
      } else {
        const receiverSection = await tx.section.findFirst({
          select: { id: true },
          where: { ...sectionIdentityFilter, userId: request.receiverId },
        });

        if (!receiverSection) {
          throw new PartnerRequestError("Section not found for this user.", 404);
        }

        const team = await tx.team.create({
          data: {
            componentType: request.section.componentType,
            courseCode: request.section.courseCode,
            dayOfWeek: request.section.dayOfWeek,
            endTime: request.section.endTime,
            // Born complete: most labs are pairs, and a finished pair never comes back
            // to close their team, so the default has to be right for the user who
            // does nothing. "We need more people" is one explicit tap.
            isComplete: true,
            sectionCode: request.section.sectionCode,
            sectionKey,
            startTime: request.section.startTime,
            term: request.section.term,
          },
        });

        await tx.teamMember.createMany({
          data: [
            { sectionId: request.sectionId, sectionKey, teamId: team.id, userId: request.senderId },
            {
              sectionId: receiverSection.id,
              sectionKey,
              teamId: team.id,
              userId: request.receiverId,
            },
          ],
        });

        teamId = team.id;
        becameComplete = true;
      }

      const acceptedRequest = await tx.partnerRequest.update({
        data: {
          status: "ACCEPTED",
          targetTeamId: teamId,
        },
        where: {
          id: requestId,
        },
      });

      if (becameComplete) {
        const members = await tx.teamMember.findMany({
          select: { userId: true },
          where: { teamId },
        });

        await cancelPendingRequestsForMembers(
          tx,
          sectionIdentityFilter,
          members.map((member) => member.userId),
          requestId,
        );
      }

      return acceptedRequest;
    });

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
        "You just joined a team for this section — refresh and try again.",
        409,
      );
    }

    throw error;
  }
}

/**
 * P2002: the TeamMember (userId, sectionKey) unique index rejected a second
 * concurrent join for the same section. That index is the cardinality guard now,
 * which is why this transaction no longer needs Serializable isolation.
 * P2034: Postgres serialization failure, kept as insurance for any future
 * Serializable transaction in this file.
 */
function isTransactionConflict(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  return code === "P2002" || code === "P2034";
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

/**
 * Replaces dissolveMatch. Leaving a team of two deletes it, which is exactly what
 * dissolving a match used to do; leaving a larger team leaves the rest intact.
 *
 * A team that drops to one member is deleted rather than kept, because a team of one
 * is not a thing that exists here — the remaining person becomes an ordinary solo
 * student again. Their DiscoverableSection is deliberately untouched, so if they were
 * marked as looking they reappear in discovery with no extra writes.
 */
export async function leaveTeam(userId: string, teamId: string) {
  return db.$transaction(async (tx) => {
    const membership = await tx.teamMember.findFirst({
      select: { id: true },
      where: { teamId, userId },
    });

    if (!membership) {
      throw new PartnerRequestError("Team not found for this user.", 404);
    }

    await tx.teamMember.delete({ where: { id: membership.id } });

    const remaining = await tx.teamMember.count({ where: { teamId } });

    if (remaining < 2) {
      // Cascades the last membership row with it.
      await tx.team.delete({ where: { id: teamId } });
    }

    // Note: a team that loses a member is NOT auto-reopened. A trio that becomes a
    // pair is probably still a pair, and silently republishing them to discovery
    // would be a surprise. Reopening is one tap if they want it.
    return { teamId, teamDeleted: remaining < 2 };
  });
}

/**
 * Opens a team to new members, or closes it. Any member may do either.
 *
 * Closing is what runs the cancel-pending sweep — the one that used to fire on
 * accept. An open team keeps taking join requests; only closing makes the rest dead.
 */
export async function setTeamCompletion(userId: string, teamId: string, isComplete: boolean) {
  if (!TEAMS_ENABLED && !isComplete) {
    // With teams off, nothing may become open, so the app stays indistinguishable
    // from its pre-teams behaviour.
    throw new PartnerRequestError("Not available.", 404);
  }

  return db.$transaction(async (tx) => {
    const membership = await tx.teamMember.findFirst({
      select: { sectionKey: true },
      where: { teamId, userId },
    });

    if (!membership) {
      throw new PartnerRequestError("Team not found for this user.", 404);
    }

    const team = await tx.team.update({
      data: { isComplete, updatedAt: new Date() },
      where: { id: teamId },
    });

    if (isComplete) {
      const members = await tx.teamMember.findMany({
        select: { userId: true },
        where: { teamId },
      });

      await cancelPendingRequestsForMembers(
        tx,
        buildSectionIdentityFilter(team),
        members.map((member) => member.userId),
      );
    }

    return team;
  });
}

/**
 * The viewer's teams, keyed by section identity. Replaces
 * getMatchedPartnersBySectionKeyForUser.
 *
 * Still a Map, but for the first time that is actually correct: the unique index on
 * TeamMember(userId, sectionKey) guarantees at most one entry per key. The old
 * version silently overwrote a second match rather than being unable to have one.
 */
export async function getTeamsBySectionKeyForUser(userId: string) {
  const memberships = await db.teamMember.findMany({
    select: {
      joinedAt: true,
      sectionKey: true,
      team: {
        select: {
          id: true,
          isComplete: true,
          members: {
            orderBy: { joinedAt: "asc" },
            select: { user: { select: matchedPartnerSelect }, userId: true },
          },
        },
      },
    },
    where: { userId },
  });

  const teamsBySectionKey = new Map<string, ViewerTeam>();

  for (const membership of memberships) {
    const teammates = membership.team.members
      .filter((member) => member.userId !== userId)
      .map((member) => member.user);

    // A one-member team is transiently reachable via a cascade; render it as no team.
    if (teammates.length === 0) {
      continue;
    }

    teamsBySectionKey.set(membership.sectionKey, {
      isComplete: membership.team.isComplete,
      joinedAt: membership.joinedAt,
      teamId: membership.team.id,
      teammates,
    });
  }

  return teamsBySectionKey;
}

export type TeamWithSection = {
  isComplete: boolean;
  joinedAt: Date;
  section: {
    componentType: ComponentType;
    courseCode: string;
    sectionCode: string;
    term: string;
  };
  teamId: string;
  teammates: MatchedPartnerContact[];
};

/**
 * Replaces listMatchesForUser: one row per team rather than one per accepted request.
 * Term filtering is simpler than before because Team carries its own `term`, so this
 * no longer has to join through Section.
 */
export async function listTeamsForUser(
  userId: string,
  term?: string,
): Promise<TeamWithSection[]> {
  const memberships = await db.teamMember.findMany({
    orderBy: { joinedAt: "desc" },
    select: {
      joinedAt: true,
      team: {
        select: {
          componentType: true,
          courseCode: true,
          id: true,
          isComplete: true,
          members: {
            orderBy: { joinedAt: "asc" },
            select: { user: { select: matchedPartnerSelect }, userId: true },
          },
          sectionCode: true,
          term: true,
        },
      },
    },
    where: {
      userId,
      ...(term ? { team: { term } } : {}),
    },
  });

  return memberships
    .map((membership) => ({
      isComplete: membership.team.isComplete,
      joinedAt: membership.joinedAt,
      section: {
        componentType: membership.team.componentType,
        courseCode: membership.team.courseCode,
        sectionCode: membership.team.sectionCode,
        term: membership.team.term,
      },
      teamId: membership.team.id,
      teammates: membership.team.members
        .filter((member) => member.userId !== userId)
        .map((member) => member.user),
    }))
    .filter((team) => team.teammates.length > 0);
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

export async function deleteUser(userId: string) {
  return db.$transaction(async (tx) => {
    const affectedTeamIds = await findTeamIdsForUsers(tx, [userId]);

    const deleted = await tx.user.delete({ where: { id: userId } });

    await pruneUndersizedTeams(tx, affectedTeamIds);

    return deleted;
  });
}

