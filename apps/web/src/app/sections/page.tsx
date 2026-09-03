import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { formatTerm } from "@/lib/format";
import { badge, button, statCard } from "@/lib/ui";
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
    (count, discoverySection) => count + discoverySection.matches.length,
    0,
  );
  const discoverableSectionCount = discoverySections.filter(
    (discoverySection) => discoverySection.matches.length > 0,
  ).length;
  const matchedSectionCount = discoverySections.filter(
    (discoverySection) => discoverySection.matchedPartner !== null,
  ).length;

  return (
    <AppShell active="discovery" activeTerm={activeTerm} pageTitle="Find partners" terms={terms} user={user}>
      <h1 className="font-display text-2xl font-bold text-zinc-950">Find partners</h1>
      <p className="mt-1 text-[15px] text-zinc-500">
        Browse classmates who are actively looking for partners in your imported labs and
        tutorials.
      </p>

      <NoticeBanner clearHref="/sections" notice={notice} />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={statCard}>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Your sections</p>
          <p className="mt-1 font-display text-2xl font-bold text-zinc-950">
            {discoverySections.length}
          </p>
        </div>
        <div className={statCard}>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Matched sections
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-brand">{matchedSectionCount}</p>
        </div>
        <div className={statCard}>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Sections with classmates
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-brand">
            {discoverableSectionCount}
          </p>
        </div>
        <div className={statCard}>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Available classmates
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-zinc-950">
            {availableClassmatesCount}
          </p>
        </div>
      </div>

      {discoverySections.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white px-5 py-8 text-center shadow-sm">
          <h2 className="text-xl font-black text-zinc-950">No sections to browse yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600">
            Import your schedule first. Once your labs and tutorials are saved, this page will show
            classmates who made matching sections discoverable.
          </p>
          <Link className={`${button.primary} mt-5`} href="/import">
            Import schedule
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

          <div className="mt-6 grid gap-4">
            {visibleGroups.map((group) => (
              <section
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
                key={`${group.term}-${group.courseCode}`}
              >
                <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-stone-50/60 px-4 py-2.5">
                  <h2 className="font-display text-base font-bold text-zinc-950">
                    {group.courseCode}
                    <span className="ml-2 text-xs font-semibold text-brand">
                      {formatTerm(group.term)}
                    </span>
                  </h2>
                  <span className={badge.neutral}>
                    {group.sections.length} {group.sections.length === 1 ? "section" : "sections"}
                  </span>
                </header>

                <div className="divide-y divide-zinc-100">
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
  return `rounded-full border px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
    active
      ? "border-brand bg-brand text-white"
      : "border-zinc-200 bg-white text-zinc-600 hover:border-brand hover:text-brand"
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
