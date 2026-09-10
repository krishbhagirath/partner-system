import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { TeamCompletionControls } from "@/components/team-controls";
import { NoticeBanner } from "@/components/notice-banner";
import { PendingButton } from "@/components/pending-button";
import { SignOutButton } from "@/components/sign-out-button";
import { formatUserDisplayName } from "@/lib/format";
import { badge, button } from "@/lib/ui";
import { requirePageUser } from "@/server/auth";
import {
  buildSectionDiscoveryKey,
  getTeamsBySectionKeyForUser,
  getUserProfile,
  listSectionsWithDiscoverabilityForUser,
  type ViewerTeam,
} from "@/server/lab-partner";

import {
  deleteOwnAccount,
  leaveTeamAction,
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

  const [sections, teamsBySectionKey, profile] = await Promise.all([
    listSectionsWithDiscoverabilityForUser(user.id),
    getTeamsBySectionKeyForUser(user.id),
    getUserProfile(user.id),
  ]);

  const groupedSections = groupSectionsByCourse(sections);

  return (
    <AppShell active="settings" pageTitle="Settings" user={user}>
      <h1 className="font-display text-2xl font-bold text-zinc-950">Settings</h1>

      <NoticeBanner clearHref="/settings" notice={notice} />

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
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
                  {group.sections.map((section) => (
                    <DiscoverabilitySectionForm
                      key={section.id}
                      viewerTeam={
                        teamsBySectionKey.get(buildSectionDiscoveryKey(section)) ?? null
                      }
                      section={section}
                    />
                  ))}
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

      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-display text-[15px] font-bold text-zinc-950">Schedule import</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-800">Your imported sections</p>
            <p className="mt-0.5 text-sm text-zinc-500">
              {sections.length > 0
                ? `${sections.length} lab/tutorial section${sections.length === 1 ? "" : "s"} imported. Re-importing a semester replaces it.`
                : "You haven't imported a schedule yet."}
            </p>
          </div>
          <Link className={button.secondary} href="/import">
            {sections.length > 0 ? "Re-import" : "Import schedule"}
          </Link>
        </div>
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

function DiscoverabilitySectionForm({
  section,
  viewerTeam,
}: {
  viewerTeam: ViewerTeam | null;
  section: SettingsSection;
}) {
  const discoverability = section.discoverableSections[0] ?? null;
  const isDiscoverable = Boolean(discoverability?.isActive);

  return (
    <article
      className={`grid gap-4 rounded-xl border border-zinc-200 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)] ${
        viewerTeam ? "bg-brand/[0.04]" : isDiscoverable ? "bg-emerald-50/40" : "bg-white"
      }`}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={badge.brand}>{section.componentType === "LAB" ? "Lab" : "Tutorial"}</span>
          <h3 className="font-bold text-zinc-950">{section.sectionCode}</h3>
          <span
            className={
              viewerTeam
                ? viewerTeam.isComplete
                  ? badge.matched
                  : badge.warning
                : isDiscoverable
                  ? badge.success
                  : badge.neutral
            }
          >
            {viewerTeam
              ? viewerTeam.isComplete
                ? viewerTeam.teammates.length === 1
                  ? "Matched"
                  : `Team of ${viewerTeam.teammates.length + 1}`
                : "Looking for more"
              : isDiscoverable
                ? "Discoverable"
                : "Private"}
          </span>
        </div>
        {section.location ? (
          <p className="mt-2 text-sm text-zinc-500">{section.location}</p>
        ) : null}
      </div>

      {viewerTeam ? (
        <div className="rounded-lg border border-brand/25 bg-white px-4 py-4">
          <p className="text-xs font-bold uppercase text-brand">
            {viewerTeam.teammates.length === 1
              ? "Confirmed partner"
              : `Your team of ${viewerTeam.teammates.length + 1}`}
          </p>
          {viewerTeam.teammates.map((teammate) => (
            <div className="mt-2" key={teammate.id}>
              <h4 className="font-bold text-zinc-950">{formatUserDisplayName(teammate)}</h4>
              <p className="mt-1 text-sm font-semibold text-zinc-600">{teammate.email}</p>
              {teammate.contactPhone ? (
                <p className="mt-1 text-sm text-zinc-600">📞 {teammate.contactPhone}</p>
              ) : null}
              {teammate.contactInstagram ? (
                <p className="mt-1 text-sm text-zinc-600">📷 {teammate.contactInstagram}</p>
              ) : null}
              {teammate.contactOther ? (
                <p className="mt-1 text-sm text-zinc-600">💬 {teammate.contactOther}</p>
              ) : null}
            </div>
          ))}
          <TeamCompletionControls
            isComplete={viewerTeam.isComplete}
            redirectTo="/settings"
            teamId={viewerTeam.teamId}
          />
          <form action={leaveTeamAction} className="mt-3">
            <input name="teamId" type="hidden" value={viewerTeam.teamId} />
            <ConfirmSubmitButton
              className={button.danger}
              confirmMessage={
                viewerTeam.teammates.length === 1
                  ? "Remove this match? You will both reappear in discovery for this section if you are still marked as looking."
                  : "Leave this team? The others stay on it, and you'll reappear in discovery for this section if you are still marked as looking."
              }
              pendingLabel="Removing..."
            >
              {viewerTeam.teammates.length === 1 ? "Unmatch" : "Leave team"}
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
