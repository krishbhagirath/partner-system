import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { TeamCompletionControls, TeammateContact } from "@/components/team-controls";
import { NoticeBanner } from "@/components/notice-banner";
import { PendingButton } from "@/components/pending-button";
import { SignOutButton } from "@/components/sign-out-button";
import { formatDay, formatTerm, formatUserDisplayName, toClockTime } from "@/lib/format";
import {
  button,
  chip,
  componentMark,
  emptyState,
  pageLede,
  pageTitle,
  sectionHeading,
} from "@/lib/ui";
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
      <h1 className={pageTitle}>Settings</h1>
      <p className={pageLede}>
        Choose which labs and tutorials classmates can find you in.
      </p>

      <NoticeBanner clearHref="/settings" notice={notice} />

      {/*
        Each of these used to be a bordered card, so the page read as four stacked
        boxes. They are now separated by rules and space — the heading tells you where
        you are, and the only remaining surfaces are the ones holding a real object.
      */}
      <section className="mt-9">
        <h2 className={sectionHeading}>Your sections</h2>
        <p className="mt-1 max-w-[62ch] text-[14.5px] text-muted">
          Turn a section on to appear in Find partners for the classmates in it.
        </p>

        {sections.length === 0 ? (
          <p className={`${emptyState} mt-4`}>
            Nothing imported yet.{" "}
            <Link className="font-semibold text-brand hover:underline" href="/import">
              Import your timetable
            </Link>
          </p>
        ) : (
          <div className="mt-5 grid gap-7">
            {groupedSections.map((group) => (
              <div key={`${group.term}-${group.courseCode}`}>
                <p className="mb-2.5 flex items-baseline gap-2 text-[14.5px] font-bold text-ink">
                  {group.courseCode}
                  <span className="font-normal text-[13px] text-muted">
                    {formatTerm(group.term)}
                  </span>
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

      <section className="mt-10 border-t border-rule pt-8">
        <h2 className={sectionHeading}>Notifications</h2>
        <form action={updateNotificationPreferencesAction} className="mt-4 grid max-w-xl gap-3">
          <ToggleRow
            defaultChecked={profile?.notifyOnMatch ?? true}
            label="Email me when a match is confirmed"
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

      <section className="mt-10 border-t border-rule pt-8">
        <h2 className={sectionHeading}>Your timetable</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[54ch] text-[14.5px] leading-6 text-muted">
            {sections.length > 0
              ? `${sections.length} lab and tutorial section${sections.length === 1 ? "" : "s"} imported. Re-importing a semester keeps the courses you already have, adds new ones, and removes any you have dropped.`
              : "You haven't imported a timetable yet."}
          </p>
          <Link className={button.secondary} href="/import">
            {sections.length > 0 ? "Re-import" : "Import your timetable"}
          </Link>
        </div>
      </section>

      <section className="mt-10 border-t border-rule pt-8">
        <h2 className={sectionHeading}>Your account</h2>
        <p className="mt-1 text-[14.5px] text-muted">
          Deleting is permanent and removes your sections, requests and teams.
        </p>
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
    <label className="flex items-center justify-between gap-4 rounded-lg border border-rule bg-surface px-4 py-3">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span className="relative inline-flex h-6 w-[42px] shrink-0 items-center">
        <input
          className="peer sr-only"
          defaultChecked={defaultChecked}
          name={name}
          type="checkbox"
        />
        <span className="absolute inset-0 rounded-full bg-rule-strong transition-colors peer-checked:bg-brand" />
        <span className="relative size-5 translate-x-0.5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-[19px]" />
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
      className={`grid gap-5 rounded-md border px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.9fr)] ${
        viewerTeam ? "border-brand/25 bg-brand-tint/50" : "border-rule bg-surface"
      }`}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={componentMark}>
            {section.componentType === "LAB" ? "Lab" : "Tutorial"}
          </span>
          <h3 className="font-semibold text-ink">{section.sectionCode}</h3>
          <span
            className={
              viewerTeam
                ? viewerTeam.isComplete
                  ? chip.team
                  : chip.looking
                : isDiscoverable
                  ? chip.active
                  : chip.neutral
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
        <p className="tnum mt-2 text-[13.5px] text-muted">
          {formatDay(section.dayOfWeek)} {toClockTime(section.startTime)}–
          {toClockTime(section.endTime)}
          {section.location ? ` · ${section.location}` : ""}
        </p>
      </div>

      {viewerTeam ? (
        // No inner border: this already sits inside a tinted, bordered row, and a
        // third box around it was the card-in-card-in-card this page suffered from.
        <div>
          <p className="text-[13px] font-bold text-brand">
            {viewerTeam.teammates.length === 1
              ? "Confirmed partner"
              : `Your team of ${viewerTeam.teammates.length + 1}`}
          </p>
          {viewerTeam.teammates.map((teammate) => (
            <div className="mt-2" key={teammate.id}>
              <h4 className="font-semibold text-ink">{formatUserDisplayName(teammate)}</h4>
              <div className="mt-1.5">
                <TeammateContact teammate={teammate} />
              </div>
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
          <label className="flex items-center justify-between gap-4 rounded border border-rule bg-surface px-3 py-2.5 text-sm font-bold text-ink">
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
