/**
 * Pure decision logic for teams.
 *
 * Deliberately free of `server-only`, `db` and every Prisma import: this is where the
 * genuinely tricky rules live, and keeping them dependency-free is what makes them
 * testable without a database or a React Server Component context.
 */

export type TeamState = {
  isComplete: boolean;
  memberUserIds: string[];
  teamId: string;
} | null;

export type JoinPlan =
  | { kind: "conflict"; message: string; statusCode: 409 }
  | { kind: "create-team" }
  | { joinerId: string; kind: "join-team"; teamId: string };

const COMPLETE_SENDER =
  "Your team for this section is complete. Mark it as looking for more people first.";
const COMPLETE_RECEIVER = "This student's team for this section is already complete.";
const BOTH_HAVE_TEAMS =
  "You both already have teams for this section. Leave yours first.";

function conflict(message: string): JoinPlan {
  return { kind: "conflict", message, statusCode: 409 };
}

/**
 * Decides what accepting a request between two people should do, given each side's
 * current team for that section. The full sender x receiver matrix over
 * {none, open, complete}:
 *
 *                 receiver: none        open              complete
 *   sender none   create a new team     sender joins      conflict
 *   sender open   receiver joins        conflict          conflict
 *   sender complete   conflict          conflict          conflict
 *
 * Merging two existing teams is deliberately not supported — it would need a consent
 * model from every member on both sides, which is a different feature.
 */
export function resolveJoinPlan({
  receiverId,
  receiverTeam,
  senderId,
  senderTeam,
}: {
  receiverId: string;
  receiverTeam: TeamState;
  senderId: string;
  senderTeam: TeamState;
}): JoinPlan {
  // Already teammates: nothing to do. Checked first so it can never be reported as a
  // conflict, which would be nonsense from the user's point of view.
  if (senderTeam && receiverTeam && senderTeam.teamId === receiverTeam.teamId) {
    return conflict("You are already on a team with this student for this section.");
  }

  if (senderTeam?.isComplete) {
    return conflict(COMPLETE_SENDER);
  }

  if (receiverTeam?.isComplete) {
    return conflict(COMPLETE_RECEIVER);
  }

  if (senderTeam && receiverTeam) {
    return conflict(BOTH_HAVE_TEAMS);
  }

  if (receiverTeam) {
    return { joinerId: senderId, kind: "join-team", teamId: receiverTeam.teamId };
  }

  if (senderTeam) {
    return { joinerId: receiverId, kind: "join-team", teamId: senderTeam.teamId };
  }

  return { kind: "create-team" };
}

/**
 * A team only exists once two people are on it. A single membership is reachable
 * transiently — a cascade from a deleted User or Section can strip the other member
 * before the prune runs — so every read path treats it as "no team" rather than
 * rendering a team of one.
 */
export function isRenderableTeam(team: { memberUserIds: string[] } | null): boolean {
  return team !== null && team.memberUserIds.length >= 2;
}

/**
 * Decides what a viewer may see for one section: their own team, the joinable teams,
 * and the solo classmates. Generic over the row shapes so it can be tested with
 * plain objects.
 */
export function shapeDiscoveryEntry<
  TCandidate extends { userId: string },
  TTeam extends { memberUserIds: string[]; teamId: string },
>({
  candidates,
  openTeams,
  teamedUserIds,
  teamsEnabled,
  viewerTeam,
}: {
  candidates: TCandidate[];
  openTeams: TTeam[];
  teamedUserIds: ReadonlySet<string>;
  teamsEnabled: boolean;
  viewerTeam: TeamState;
}): { candidates: TCandidate[]; openTeams: TTeam[]; viewerTeam: TeamState } {
  // Anyone already on a team — open or complete — is represented by their team, never
  // as a solo classmate. This replaces the old "drop already-matched users" filter.
  const soloCandidates = candidates.filter((candidate) => !teamedUserIds.has(candidate.userId));

  const effectiveViewerTeam = isRenderableTeam(viewerTeam) ? viewerTeam : null;

  // With the flag off no team can be open, so force that view even if open teams
  // exist from a previous enablement. Flipping the flag back off then degrades to
  // the pre-teams behaviour instead of leaking a half-built feature.
  const viewerTeamForDisplay =
    effectiveViewerTeam && !teamsEnabled
      ? { ...effectiveViewerTeam, isComplete: true }
      : effectiveViewerTeam;

  const joinableTeams = teamsEnabled
    ? openTeams.filter(
        (team) =>
          team.memberUserIds.length >= 2 && team.teamId !== effectiveViewerTeam?.teamId,
      )
    : [];

  if (viewerTeamForDisplay?.isComplete) {
    // Byte-for-byte the old behaviour: a matched viewer sees no candidates at all.
    return { candidates: [], openTeams: [], viewerTeam: viewerTeamForDisplay };
  }

  if (viewerTeamForDisplay) {
    // The viewer is recruiting: they may invite solo classmates, but cannot merge
    // their team into another one.
    return { candidates: soloCandidates, openTeams: [], viewerTeam: viewerTeamForDisplay };
  }

  return { candidates: soloCandidates, openTeams: joinableTeams, viewerTeam: null };
}

/**
 * Who a "ask to join" request should be addressed to. Earliest member, ties broken by
 * id so the choice is stable across requests and across servers.
 */
export function pickTeamContact<T extends { joinedAt: Date; userId: string }>(
  members: T[],
): T | null {
  if (members.length === 0) {
    return null;
  }

  return (
    [...members].sort((left, right) => {
      const byJoinedAt = left.joinedAt.getTime() - right.joinedAt.getTime();

      return byJoinedAt !== 0 ? byJoinedAt : left.userId.localeCompare(right.userId);
    })[0] ?? null
  );
}

/**
 * A two-person team is still "a partner" everywhere in the UI — that is what keeps
 * the app feeling unchanged for the pair-work majority.
 */
export function formatTeamNoun(memberCount: number) {
  return memberCount <= 2 ? "partner" : "team";
}
