import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { formatTerm } from "@/lib/format";
import { button, pageLede, pageTitle } from "@/lib/ui";
import { requirePageUser } from "@/server/auth";
import { listSectionDiscoveryForUser, resolveActiveTerm } from "@/server/lab-partner";

import { DiscoverySection } from "./discovery-section";

export const metadata: Metadata = {
  title: "Find partners | PartnerUp",
};

type DiscoverySection = Awaited<ReturnType<typeof listSectionDiscoveryForUser>>[number];

type DiscoveryCourseGroup = {
  courseCode: string;
  sections: DiscoverySection[];
  term: string;
};

type SectionsPageProps = {
  searchParams?: Promise<{
    course?: string;
    notice?: string;
    term?: string;
  }>;
};

export default async function SectionsPage({ searchParams }: SectionsPageProps) {
  const user = await requirePageUser();
  const resolvedSearchParams = await searchParams;
  const notice = resolvedSearchParams?.notice;
  const activeCourse = resolvedSearchParams?.course;
  const { activeTerm, terms } = await resolveActiveTerm(user.id, resolvedSearchParams?.term);
  const discoverySections = await listSectionDiscoveryForUser(user.id, activeTerm ?? undefined);
  const groupedSections = groupDiscoverySections(discoverySections);
  const courseOptions = [...new Set(discoverySections.map((entry) => entry.section.courseCode))].sort();
  const visibleGroups = activeCourse
    ? groupedSections.filter((group) => group.courseCode === activeCourse)
    : groupedSections;

  const availableClassmatesCount = discoverySections.reduce(
    (count, discoverySection) =>
      count +
      discoverySection.candidates.length +
      discoverySection.openTeams.reduce((members, team) => members + team.members.length, 0),
    0,
  );
  const discoverableSectionCount = discoverySections.filter(
    (discoverySection) =>
      discoverySection.candidates.length + discoverySection.openTeams.length > 0,
  ).length;
  // Sections where you already have a settled team — the "you're done here" count.
  const matchedSectionCount = discoverySections.filter(
    (discoverySection) => discoverySection.viewerTeam?.isComplete === true,
  ).length;

  return (
    <AppShell active="discovery" activeTerm={activeTerm} pageTitle="Find partners" terms={terms} user={user}>
      <h1 className={pageTitle}>Find partners</h1>
      <p className={pageLede}>
        Classmates in your exact sections who are also looking. Expand a section to see them.
      </p>

      <NoticeBanner clearHref="/sections" notice={notice} />

      {/*
        Four counters used to sit here. They answered questions nobody asks. One line
        of prose says the same thing and gives the space back to the sections.
      */}
      {discoverySections.length > 0 ? (
        <p className="tnum mt-5 border-y border-rule py-3 text-sm text-muted">
          <strong className="font-semibold text-ink">{availableClassmatesCount}</strong>{" "}
          {availableClassmatesCount === 1 ? "classmate" : "classmates"} available across{" "}
          <strong className="font-semibold text-ink">{discoverableSectionCount}</strong> of your{" "}
          {discoverySections.length} {discoverySections.length === 1 ? "section" : "sections"}
          {matchedSectionCount > 0 ? `, and ${matchedSectionCount} already sorted` : ""}.
        </p>
      ) : null}

      {discoverySections.length === 0 ? (
        <div className="mt-8 max-w-[52ch]">
          <h2 className="font-display text-[19px] font-bold text-ink">
            Import your timetable to get started
          </h2>
          <p className="mt-2 text-[15px] leading-6 text-muted">
            Once your labs and tutorials are saved, this page fills up with the classmates in
            those exact sections who are also looking for a partner.
          </p>
          <Link className={`${button.primary} mt-5`} href="/import">
            Import your timetable
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link className={pillClass(!activeCourse)} href="/sections">
              All sections
            </Link>
            {courseOptions.map((course) => (
              <Link
                className={pillClass(activeCourse === course)}
                href={`/sections?course=${encodeURIComponent(course)}`}
                key={course}
              >
                {course}
              </Link>
            ))}
          </div>

          {/* One course per block, separated by space and a heading rather than by
              nesting a bordered card inside a bordered card. */}
          <div className="mt-8 grid gap-9">
            {visibleGroups.map((group) => (
              <section key={`${group.term}-${group.courseCode}`}>
                <header className="flex items-baseline justify-between gap-3 pb-2">
                  <h2 className="font-display text-[17px] font-bold text-ink">
                    {group.courseCode}
                  </h2>
                  <span className="text-[13px] text-muted">{formatTerm(group.term)}</span>
                </header>

                <div className="divide-y divide-rule overflow-hidden rounded-md border border-rule bg-surface">
                  {group.sections.map((discoverySection) => (
                    <DiscoverySection
                      discoverySection={discoverySection}
                      key={discoverySection.section.id}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

function pillClass(active: boolean) {
  return `rounded-md border px-3 py-1.5 text-[13.5px] font-semibold transition-colors ${
    active
      ? "border-brand bg-brand text-white"
      : "border-rule bg-surface text-ink-soft hover:border-ink-soft hover:text-ink"
  }`;
}

function groupDiscoverySections(discoverySections: DiscoverySection[]) {
  const groups = new Map<string, DiscoveryCourseGroup>();

  for (const discoverySection of discoverySections) {
    const { section } = discoverySection;
    const key = `${section.term}::${section.courseCode}`;
    const group = groups.get(key) ?? {
      courseCode: section.courseCode,
      sections: [],
      term: section.term,
    };

    group.sections.push(discoverySection);
    groups.set(key, group);
  }

  return [...groups.values()];
}
