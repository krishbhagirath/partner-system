import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { PendingButton } from "@/components/pending-button";
import { formatDate, formatDay, formatStatus, formatUserDisplayName, getInitials, toClockTime } from "@/lib/format";
import { avatarColorClass, badge, button, statCard, textarea } from "@/lib/ui";
import { requirePageUser } from "@/server/auth";
import { listSectionDiscoveryForUser, resolveActiveTerm } from "@/server/lab-partner";

import { sendPartnerRequest } from "./actions";

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
            Import your Mosaic schedule first. Once your labs and tutorials are saved, this page
            will show classmates who made matching sections discoverable.
          </p>
          <Link className={`${button.primary} mt-5`} href="/import">
            Import from Mosaic
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

          <div className="mt-6 grid gap-6">
            {visibleGroups.map((group) => (
              <section
                className="rounded-xl border border-zinc-200 bg-white shadow-sm"
                key={`${group.term}-${group.courseCode}`}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-brand">{group.term}</p>
                    <h2 className="font-display text-xl font-bold text-zinc-950">
                      {group.courseCode}
                    </h2>
                  </div>
                  <span className={badge.neutral}>
                    {group.sections.length} {group.sections.length === 1 ? "section" : "sections"}
                  </span>
                </header>

                <div className="divide-y divide-zinc-200">
                  {group.sections.map((discoverySection) => (
                    <DiscoverySectionBlock
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

function DiscoverySectionBlock({ discoverySection }: { discoverySection: DiscoverySection }) {
  const { matchedPartner, matches, section } = discoverySection;

  return (
    <div className="px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={badge.brand}>{section.componentType === "LAB" ? "Lab" : "Tutorial"}</span>
        <h3 className="font-bold text-zinc-950">{section.sectionCode}</h3>
        {matchedPartner ? (
          <span className={badge.matched}>Matched</span>
        ) : (
          <span className={badge.neutral}>
            {matches.length} {matches.length === 1 ? "classmate" : "classmates"}
          </span>
        )}
        <span className="text-sm text-zinc-500">
          {formatDay(section.dayOfWeek)} {toClockTime(section.startTime)}–
          {toClockTime(section.endTime)} · {section.location || "Location TBA"}
        </span>
      </div>

      <div className="mt-4">
        {matchedPartner ? (
          <article className="max-w-md rounded-xl border border-brand/25 bg-brand/[0.04] px-4 py-4">
            <p className="text-xs font-bold uppercase text-brand">Confirmed partner</p>
            <h4 className="mt-2 font-bold text-zinc-950">
              {formatUserDisplayName(matchedPartner.partner)}
            </h4>
            <p className="mt-1 text-sm font-semibold text-zinc-600">{matchedPartner.partner.email}</p>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              Matched on {formatDate(matchedPartner.matchedAt)}
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              You&apos;re partnered up for this section, so it no longer appears in discovery. Manage
              this from{" "}
              <Link className="font-bold text-brand hover:underline" href="/settings">
                Settings
              </Link>
              .
            </p>
          </article>
        ) : matches.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-stone-50 px-4 py-5 text-sm leading-6 text-zinc-500">
            No classmates have enabled discoverability for this section yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {matches.map((match) => (
              <CandidateCard
                key={match.discoverableSectionId}
                match={match}
                sectionId={section.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateCard({
  match,
  sectionId,
}: {
  match: DiscoverySection["matches"][number];
  sectionId: string;
}) {
  const name = formatUserDisplayName(match.user);
  const programLabel = [match.user.year, match.user.program].filter(Boolean).join(" · ");

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${avatarColorClass(match.user.id)}`}
        >
          {getInitials(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-zinc-950">{name}</p>
          <p className="truncate text-xs text-zinc-500">{programLabel || match.user.email}</p>
        </div>
      </div>

      <p className="flex-1 text-sm leading-6 text-zinc-600">
        {match.note ?? "No partner note provided."}
      </p>

      {match.request ? (
        <p className="inline-flex w-fit rounded border border-zinc-200 bg-stone-50 px-3 py-1 text-xs font-bold uppercase text-zinc-600">
          Request {formatStatus(match.request.status)}
        </p>
      ) : (
        <form action={sendPartnerRequest} className="grid gap-2">
          <input name="receiverId" type="hidden" value={match.user.id} />
          <input name="sectionId" type="hidden" value={sectionId} />
          <textarea
            className={`${textarea} min-h-16 text-sm`}
            maxLength={180}
            name="message"
            placeholder="Optional short message"
            rows={2}
          />
          <PendingButton className={`${button.primary} w-full`} pendingLabel="Sending...">
            Send request
          </PendingButton>
        </form>
      )}
    </article>
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
