import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { formatDay, formatUserDisplayName, getInitials, toClockTime } from "@/lib/format";
import { avatarColorClass, statCard } from "@/lib/ui";
import { requirePageUser } from "@/server/auth";
import {
  countPendingIncomingRequests,
  listMatchesForUser,
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

  const [sectionsWithDiscoverability, discoverySections, pendingRequestsCount, matches] =
    await Promise.all([
      listSectionsWithDiscoverabilityForUser(user.id, activeTerm ?? undefined),
      listSectionDiscoveryForUser(user.id, activeTerm ?? undefined),
      countPendingIncomingRequests(user.id),
      listMatchesForUser(user.id, activeTerm ?? undefined),
    ]);

  const discoveryBySectionId = new Map(
    discoverySections.map((discoverySection) => [discoverySection.section.id, discoverySection]),
  );

  const lookingForSections = sectionsWithDiscoverability
    .filter((section) => section.discoverableSections[0]?.isActive)
    .map((section) => ({
      candidateCount: discoveryBySectionId.get(section.id)?.matches.length ?? 0,
      isMatched: Boolean(discoveryBySectionId.get(section.id)?.matchedPartner),
      section,
    }))
    .filter((entry) => !entry.isMatched);

  const seenCandidateIds = new Set<string>();
  const suggestedCandidates: Array<{
    id: string;
    initials: string;
    matchedCourseLabel: string;
    name: string;
  }> = [];

  for (const discoverySection of discoverySections) {
    if (discoverySection.matchedPartner) {
      continue;
    }

    for (const match of discoverySection.matches) {
      if (match.request || seenCandidateIds.has(match.user.id)) {
        continue;
      }

      seenCandidateIds.add(match.user.id);
      suggestedCandidates.push({
        id: match.user.id,
        initials: getInitials(formatUserDisplayName(match.user)),
        matchedCourseLabel: `${discoverySection.section.courseCode} — ${discoverySection.section.sectionCode}`,
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
      <h1 className="font-display text-2xl font-bold text-zinc-950">Welcome back, {firstName}</h1>
      <p className="mt-1 text-[15px] text-zinc-500">
        Here&apos;s what&apos;s happening across your sections.
      </p>

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <div className={statCard}>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Open sections</p>
          <p className="mt-2 font-display text-3xl font-bold text-zinc-950">
            {lookingForSections.length}
          </p>
        </div>
        <div className={statCard}>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Pending requests
          </p>
          <p className="mt-2 font-display text-3xl font-bold text-brand">{pendingRequestsCount}</p>
        </div>
        <div className={statCard}>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Confirmed matches
          </p>
          <p className="mt-2 font-display text-3xl font-bold text-gold-tint-text">
            {matches.length}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[15.5px] font-bold text-zinc-950">
              Your sections looking for a partner
            </h2>
            <Link className="text-sm font-semibold text-brand hover:underline" href="/settings">
              Edit
            </Link>
          </div>

          {lookingForSections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-stone-50 px-4 py-6 text-center text-sm text-zinc-500">
              {sectionsWithDiscoverability.length === 0 ? (
                <>
                  You haven&apos;t imported a timetable yet.{" "}
                  <Link className="font-bold text-brand hover:underline" href="/import">
                    Import from Mosaic
                  </Link>
                  .
                </>
              ) : (
                "No sections are currently marked as looking for a partner."
              )}
            </p>
          ) : (
            <div className="grid gap-2.5">
              {lookingForSections.map(({ candidateCount, section }) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-stone-50 px-4 py-3.5"
                  key={section.id}
                >
                  <div>
                    <p className="text-sm font-bold text-zinc-950">
                      {section.courseCode} — {section.componentType === "LAB" ? "Lab" : "Tutorial"}{" "}
                      {section.sectionCode}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {formatDay(section.dayOfWeek)} {toClockTime(section.startTime)}–
                      {toClockTime(section.endTime)} · {section.location || "Location TBA"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand">
                    {candidateCount} {candidateCount === 1 ? "candidate" : "candidates"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[15.5px] font-bold text-zinc-950">Suggested for you</h2>
            <Link className="text-sm font-semibold text-brand hover:underline" href="/sections">
              See all
            </Link>
          </div>

          {suggestedCandidates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-stone-50 px-4 py-6 text-center text-sm text-zinc-500">
              No new suggestions right now.
            </p>
          ) : (
            <div className="grid gap-3.5">
              {suggestedCandidates.map((candidate) => (
                <div className="flex items-center gap-3" key={candidate.id}>
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${avatarColorClass(candidate.id)}`}
                  >
                    {candidate.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-zinc-950">{candidate.name}</p>
                    <p className="truncate text-xs text-zinc-400">{candidate.matchedCourseLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
