import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import {
  WeekOverview,
  type SectionStatus,
  type WeekSection,
} from "@/components/week-overview";
import { formatUserDisplayName, getInitials } from "@/lib/format";
import { avatarColorClass, emptyState, pageLede, pageTitle, sectionHeading } from "@/lib/ui";
import { requirePageUser } from "@/server/auth";
import {
  countPendingIncomingRequests,
  listTeamsForUser,
  listSectionDiscoveryForUser,
  listSectionsWithDiscoverabilityForUser,
  resolveActiveTerm,
} from "@/server/lab-partner";

export const metadata: Metadata = {
  title: "Dashboard | PartnerUp",
};

type DashboardPageProps = {
  searchParams?: Promise<{ term?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requirePageUser();
  const resolvedSearchParams = await searchParams;
  const { activeTerm, terms } = await resolveActiveTerm(user.id, resolvedSearchParams?.term);

  const [sectionsWithDiscoverability, discoverySections, pendingRequestsCount, teams] =
    await Promise.all([
      listSectionsWithDiscoverabilityForUser(user.id, activeTerm ?? undefined),
      listSectionDiscoveryForUser(user.id, activeTerm ?? undefined),
      countPendingIncomingRequests(user.id),
      listTeamsForUser(user.id, activeTerm ?? undefined),
    ]);

  const discoveryBySectionId = new Map(
    discoverySections.map((discoverySection) => [discoverySection.section.id, discoverySection]),
  );

  const lookingForSections = sectionsWithDiscoverability
    .filter((section) => section.discoverableSections[0]?.isActive)
    .map((section) => ({
      candidateCount:
        (discoveryBySectionId.get(section.id)?.candidates.length ?? 0) +
        (discoveryBySectionId.get(section.id)?.openTeams.length ?? 0),
      // A section is "done" only once the team is complete. A team still looking for
      // more people is very much still looking.
      isSettled: discoveryBySectionId.get(section.id)?.viewerTeam?.isComplete === true,
      section,
    }))
    .filter((entry) => !entry.isSettled);

  /**
   * Every imported section, with the one status that matters for glancing at a week.
   * Discoverability is the difference between "looking" and "private"; a complete
   * team outranks both, because at that point the section is settled.
   */
  const weekSections: WeekSection[] = sectionsWithDiscoverability.map((section) => {
    const discovery = discoveryBySectionId.get(section.id);
    const isDiscoverable = Boolean(section.discoverableSections[0]?.isActive);
    const candidateCount =
      (discovery?.candidates.length ?? 0) + (discovery?.openTeams.length ?? 0);

    let status: SectionStatus = "private";
    let statusLabel = "Not looking";

    if (discovery?.viewerTeam?.isComplete) {
      const memberCount = discovery.viewerTeam.teammates.length + 1;
      status = "partnered";
      statusLabel = memberCount === 2 ? "Partnered" : `Team of ${memberCount}`;
    } else if (discovery?.viewerTeam) {
      status = "available";
      statusLabel = "Looking for more";
    } else if (isDiscoverable && candidateCount > 0) {
      status = "available";
      statusLabel = `${candidateCount} available`;
    } else if (isDiscoverable) {
      status = "looking";
      statusLabel = "None yet";
    }

    return {
      componentType: section.componentType,
      courseCode: section.courseCode,
      dayOfWeek: section.dayOfWeek,
      id: section.id,
      sectionCode: section.sectionCode,
      startTime: section.startTime,
      status,
      statusLabel,
    };
  });

  const seenCandidateIds = new Set<string>();
  const suggestedCandidates: Array<{
    id: string;
    initials: string;
    matchedCourseLabel: string;
    name: string;
  }> = [];

  for (const discoverySection of discoverySections) {
    if (discoverySection.viewerTeam?.isComplete) {
      continue;
    }

    for (const match of discoverySection.candidates) {
      if (match.request || seenCandidateIds.has(match.user.id)) {
        continue;
      }

      seenCandidateIds.add(match.user.id);
      suggestedCandidates.push({
        id: match.user.id,
        initials: getInitials(formatUserDisplayName(match.user)),
        matchedCourseLabel: `${discoverySection.section.courseCode} · ${discoverySection.section.sectionCode}`,
        name: formatUserDisplayName(match.user),
      });

      if (suggestedCandidates.length >= 3) {
        break;
      }
    }

    if (suggestedCandidates.length >= 3) {
      break;
    }
  }

  const displayName = user.name ?? user.email;
  const firstName = displayName.split(" ")[0];

  return (
    <AppShell active="dashboard" activeTerm={activeTerm} pageTitle="Dashboard" terms={terms} user={user}>
      <h1 className={pageTitle}>Welcome back, {firstName}</h1>
      <p className={pageLede}>
        {pendingRequestsCount > 0
          ? `${pendingRequestsCount} ${pendingRequestsCount === 1 ? "person is" : "people are"} waiting on your answer.`
          : "Here's where things stand across your labs and tutorials."}
      </p>

      {/*
        A row of counters was the first thing on this page, and for a new student it
        read "1, 0, 0". The numbers now sit inline as a single quiet line, and the
        space goes to the thing that actually needs a decision.
      */}
      <p className="tnum mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-rule py-3 text-sm text-muted">
        <span>
          <strong className="font-semibold text-ink">{lookingForSections.length}</strong>{" "}
          {lookingForSections.length === 1 ? "section" : "sections"} looking
        </span>
        <span>
          <strong className="font-semibold text-ink">{pendingRequestsCount}</strong> pending{" "}
          {pendingRequestsCount === 1 ? "request" : "requests"}
        </span>
        <span>
          <strong className="font-semibold text-ink">{teams.length}</strong>{" "}
          {teams.length === 1 ? "team" : "teams"} confirmed
        </span>
      </p>

      {/*
        The week replaces the "Sections looking for a partner" list that used to sit
        here — it is the same set of sections, laid out by day and carrying the same
        status, so keeping both would have listed everything twice. Full detail
        (room, end time) lives on Find partners, one click away.
      */}
      {weekSections.length === 0 ? (
        <p className={`${emptyState} mt-8`}>
          Import your timetable and PartnerUp will show you who else is in your labs.{" "}
          <Link className="font-semibold text-brand hover:underline" href="/import">
            Import your timetable
          </Link>
        </p>
      ) : (
        <WeekOverview sections={weekSections} />
      )}

      {lookingForSections.length === 0 && weekSections.length > 0 ? (
        <p className={`${emptyState} mt-6`}>
          None of your sections are marked as looking yet.{" "}
          <Link className="font-semibold text-brand hover:underline" href="/settings">
            Choose which ones
          </Link>
        </p>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
        <section>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className={sectionHeading}>Classmates you could ask</h2>
            <Link className="text-sm font-semibold text-brand hover:underline" href="/sections">
              See all
            </Link>
          </div>

          {suggestedCandidates.length === 0 ? (
            <p className={`${emptyState} mt-3`}>
              Nobody new in your sections right now. Check back after add/drop.
            </p>
          ) : (
            <ul className="divide-y divide-rule border-t border-rule">
              {suggestedCandidates.map((candidate) => (
                <li className="flex items-center gap-3 py-3" key={candidate.id}>
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${avatarColorClass(candidate.id)}`}
                  >
                    {candidate.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-ink">
                      {candidate.name}
                    </p>
                    <p className="truncate text-[13px] text-muted">
                      {candidate.matchedCourseLabel}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
