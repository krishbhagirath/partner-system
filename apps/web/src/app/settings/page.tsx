import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { NoticeBanner } from "@/components/notice-banner";
import { PendingButton } from "@/components/pending-button";
import { SignOutButton } from "@/components/sign-out-button";
import { formatDate, formatUserDisplayName } from "@/lib/format";
import { badge, button, textarea as textareaClass } from "@/lib/ui";
import { requirePageUser } from "@/server/auth";
import {
  buildCourseComponentKey,
  buildSectionDiscoveryKey,
  getLatestSuccessfulImportJobForUser,
  getMatchedPartnersBySectionKeyForUser,
  getPartnerNeedStatsForPairs,
  getPartnerNeedVotesForUser,
  getUserProfile,
  listSectionsWithDiscoverabilityForUser,
  type MatchedPartner,
  type PartnerNeedStats,
} from "@/server/lab-partner";
import type { PartnerNeedResponse } from "@/generated/prisma/client";

import {
  deleteOwnAccount,
  unmatchPartner,
  updateNotificationPreferencesAction,
  updateSectionDiscoverability,
} from "./actions";

export const metadata: Metadata = {
  title: "Settings | PartnerUp",
};

type SettingsSection = Awaited<ReturnType<typeof listSectionsWithDiscoverabilityForUser>>[number];

type SettingsPageProps = {
  searchParams?: Promise<{
    notice?: string;
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requirePageUser();
  const notice = (await searchParams)?.notice;

  const [latestImportJob, sections, matchedPartnersBySectionKey, profile, partnerNeedVotes] =
    await Promise.all([
      getLatestSuccessfulImportJobForUser(user.id),
      listSectionsWithDiscoverabilityForUser(user.id),
      getMatchedPartnersBySectionKeyForUser(user.id),
      getUserProfile(user.id),
      getPartnerNeedVotesForUser(user.id),
    ]);
  const partnerNeedStats = await getPartnerNeedStatsForPairs(
    sections.map((section) => ({ componentType: section.componentType, courseCode: section.courseCode })),
  );

  const groupedSections = groupSectionsByCourse(sections);

  return (
    <AppShell active="settings" pageTitle="Settings" user={user}>
      <h1 className="font-display text-2xl font-bold text-zinc-950">Settings</h1>

      <NoticeBanner clearHref="/settings" notice={notice} />

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-display text-[15px] font-bold text-zinc-950">Mosaic connection</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-800">Timetable last synced</p>
            <p className="mt-0.5 text-sm text-zinc-500">
              {latestImportJob
                ? `${formatDate(latestImportJob.finishedAt ?? latestImportJob.createdAt)} · ${latestImportJob._count.sections} sections found`
                : "You haven't imported a timetable yet."}
            </p>
          </div>
          <Link className={button.secondary} href="/import">
            {latestImportJob ? "Re-import" : "Import from Mosaic"}
          </Link>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-display text-[15px] font-bold text-zinc-950">Your sections</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Choose which imported labs and tutorials are visible to classmates.
        </p>

        {sections.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-stone-50 px-4 py-6 text-center text-sm text-zinc-500">
            No imported sections yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-5">
            {groupedSections.map((group) => (
              <div key={`${group.term}-${group.courseCode}`}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">
                  {group.term} · {group.courseCode}
                </p>
                <div className="grid gap-2.5">
                  {group.sections.map((section) => {
                    const courseComponentKey = buildCourseComponentKey(
                      section.courseCode,
                      section.componentType,
                    );

                    return (
                      <DiscoverabilitySectionForm
                        existingVote={partnerNeedVotes.get(courseComponentKey) ?? null}
                        key={section.id}
                        matchedPartner={
                          matchedPartnersBySectionKey.get(buildSectionDiscoveryKey(section)) ??
                          null
                        }
                        section={section}
                        stats={partnerNeedStats.get(courseComponentKey) ?? null}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-display text-[15px] font-bold text-zinc-950">Notifications</h2>
        <form action={updateNotificationPreferencesAction} className="mt-4 grid gap-3">
          <ToggleRow
            defaultChecked={profile?.notifyOnRequest ?? true}
            label="Email me about new requests"
            name="notifyOnRequest"
          />
          <ToggleRow
            defaultChecked={profile?.notifyOnMatch ?? true}
            label="Notify me when a match is confirmed"
            name="notifyOnMatch"
          />
          <PendingButton
            className={`${button.primary} mt-1 justify-self-start`}
            pendingLabel="Saving..."
          >
            Save preferences
          </PendingButton>
        </form>
      </section>

      <section className="mt-4 rounded-2xl border border-red-200 bg-white p-6">
        <h2 className="font-display text-[15px] font-bold text-red-700">Danger zone</h2>
        <p className="mt-1 text-sm text-zinc-500">Log out or permanently delete your account.</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <SignOutButton className={button.secondary} />
          <form action={deleteOwnAccount}>
            <ConfirmSubmitButton
              className={button.danger}
              confirmMessage={`Permanently delete your PartnerUp account (${user.email})? This removes your sections, requests, and matches and cannot be undone.`}
              pendingLabel="Deleting..."
            >
              Delete account
            </ConfirmSubmitButton>
          </form>
        </div>
      </section>
    </AppShell>
  );
}

function ToggleRow({
  defaultChecked,
  label,
  name,
}: {
  defaultChecked: boolean;
  label: string;
  name: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-zinc-800">{label}</span>
      <span className="relative inline-flex h-6 w-[42px] shrink-0 items-center">
        <input
          className="peer sr-only"
          defaultChecked={defaultChecked}
          name={name}
          type="checkbox"
        />
        <span className="absolute inset-0 rounded-full bg-zinc-300 transition-colors peer-checked:bg-brand" />
        <span className="relative size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-[19px]" />
      </span>
    </label>
  );
}

const partnerNeedOptions: Array<{ label: string; value: PartnerNeedResponse }> = [
  { label: "Yes", value: "YES" },
  { label: "No", value: "NO" },
  { label: "Not sure", value: "UNSURE" },
];

function DiscoverabilitySectionForm({
  existingVote,
  matchedPartner,
  section,
  stats,
}: {
  existingVote: PartnerNeedResponse | null;
  matchedPartner: MatchedPartner | null;
  section: SettingsSection;
  stats: PartnerNeedStats | null;
}) {
  const discoverability = section.discoverableSections[0] ?? null;
  const isDiscoverable = Boolean(discoverability?.isActive);
  const note = discoverability?.note ?? "";

  return (
    <article
      className={`grid gap-4 rounded-xl border border-zinc-200 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)] ${
        matchedPartner ? "bg-brand/[0.04]" : isDiscoverable ? "bg-emerald-50/40" : "bg-white"
      }`}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={badge.brand}>{section.componentType === "LAB" ? "Lab" : "Tutorial"}</span>
          <h3 className="font-bold text-zinc-950">{section.sectionCode}</h3>
          <span
            className={
              matchedPartner ? badge.matched : isDiscoverable ? badge.success : badge.neutral
            }
          >
            {matchedPartner ? "Matched" : isDiscoverable ? "Discoverable" : "Private"}
          </span>
        </div>
        {section.location ? (
          <p className="mt-2 text-sm text-zinc-500">{section.location}</p>
        ) : null}
      </div>

      {matchedPartner ? (
        <div className="rounded-lg border border-brand/25 bg-white px-4 py-4">
          <p className="text-xs font-bold uppercase text-brand">Confirmed partner</p>
          <h4 className="mt-2 font-bold text-zinc-950">
            {formatUserDisplayName(matchedPartner.partner)}
          </h4>
          <p className="mt-1 text-sm font-semibold text-zinc-600">{matchedPartner.partner.email}</p>
          {matchedPartner.partner.contactPhone ? (
            <p className="mt-1 text-sm text-zinc-600">📞 {matchedPartner.partner.contactPhone}</p>
          ) : null}
          {matchedPartner.partner.contactInstagram ? (
            <p className="mt-1 text-sm text-zinc-600">
              📷 {matchedPartner.partner.contactInstagram}
            </p>
          ) : null}
          {matchedPartner.partner.contactOther ? (
            <p className="mt-1 text-sm text-zinc-600">💬 {matchedPartner.partner.contactOther}</p>
          ) : null}
          <form action={unmatchPartner} className="mt-3">
            <input name="requestId" type="hidden" value={matchedPartner.requestId} />
            <ConfirmSubmitButton
              className={button.danger}
              confirmMessage="Remove this match? You will both reappear in discovery for this section if you are still marked as looking."
              pendingLabel="Removing..."
            >
              Unmatch
            </ConfirmSubmitButton>
          </form>
        </div>
      ) : (
        <form action={updateSectionDiscoverability} className="grid gap-2.5">
          <input name="sectionId" type="hidden" value={section.id} />
          <label className="flex items-center justify-between gap-4 rounded border border-zinc-200 bg-white px-3 py-2.5 text-sm font-bold text-zinc-900">
            <span>Looking for a partner</span>
            <input
              className="size-5 accent-brand"
              defaultChecked={isDiscoverable}
              name="isActive"
              type="checkbox"
            />
          </label>

          <div className="rounded border border-zinc-200 bg-white px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-zinc-700">
                Does this class need a partner?
              </span>
              <div className="flex gap-1.5">
                {partnerNeedOptions.map((option) => (
                  <label className="cursor-pointer" key={option.value}>
                    <input
                      className="peer sr-only"
                      defaultChecked={existingVote === option.value}
                      name="partnerNeedResponse"
                      type="radio"
                      value={option.value}
                    />
                    <span className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-600 transition-colors peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {stats ? (
              <p className="mt-1.5 text-xs font-semibold text-brand">
                {stats.yesCount}/{stats.yesCount + stats.noCount} students say yes
              </p>
            ) : null}
          </div>

          <textarea
            className={`${textareaClass} min-h-16 text-sm`}
            defaultValue={note}
            maxLength={180}
            name="note"
            placeholder="Preferred meeting times or contact preferences"
            rows={2}
          />
          <PendingButton className={`${button.primary} justify-self-start`} pendingLabel="Saving...">
            Save
          </PendingButton>
        </form>
      )}
    </article>
  );
}

function groupSectionsByCourse(sections: SettingsSection[]) {
  const groups = new Map<
    string,
    { courseCode: string; sections: SettingsSection[]; term: string }
  >();

  for (const section of sections) {
    const key = `${section.term}::${section.courseCode}`;
    const group = groups.get(key) ?? {
      courseCode: section.courseCode,
      sections: [],
      term: section.term,
    };

    group.sections.push(section);
    groups.set(key, group);
  }

  return [...groups.values()];
}
