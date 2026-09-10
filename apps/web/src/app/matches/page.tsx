import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import {
  TeamCompletePrompt,
  TeamCompletionControls,
  TeammateContact,
} from "@/components/team-controls";
import { formatDate, formatSectionLabel, formatUserDisplayName, getInitials } from "@/lib/format";
import { avatarColorClass, badge } from "@/lib/ui";
import { requirePageUser } from "@/server/auth";
import { listTeamsForUser, resolveActiveTerm } from "@/server/lab-partner";
import { formatTeamNoun } from "@/server/team-rules";

export const metadata: Metadata = {
  title: "Teams | PartnerUp",
};

type MatchesPageProps = {
  searchParams?: Promise<{ notice?: string; team?: string; term?: string }>;
};

export default async function MatchesPage({ searchParams }: MatchesPageProps) {
  const user = await requirePageUser();
  const resolvedSearchParams = await searchParams;
  const { activeTerm, terms } = await resolveActiveTerm(user.id, resolvedSearchParams?.term);
  const teams = await listTeamsForUser(user.id, activeTerm ?? undefined);
  const promptTeam = teams.find((team) => team.teamId === resolvedSearchParams?.team);

  return (
    <AppShell active="matches" activeTerm={activeTerm} pageTitle="Matches" terms={terms} user={user}>
      <h1 className="font-display text-2xl font-bold text-zinc-950">Matches</h1>
      <p className="mt-1 text-[15px] text-zinc-500">Your confirmed lab and tutorial teams.</p>

      <NoticeBanner clearHref="/matches" notice={resolvedSearchParams?.notice} />

      {promptTeam ? (
        <TeamCompletePrompt
          isComplete={promptTeam.isComplete}
          redirectTo="/matches"
          teamId={promptTeam.teamId}
        />
      ) : null}

      {teams.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">
          No confirmed matches yet. Accept a request from{" "}
          <a className="font-bold text-brand hover:underline" href="/requests">
            Requests
          </a>{" "}
          to see it here.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const memberCount = team.teammates.length + 1;
            const noun = formatTeamNoun(memberCount);

            return (
              <article
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5"
                key={team.teamId}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-zinc-950">
                    {noun === "partner" ? "Your partner" : `Team of ${memberCount}`}
                  </p>
                  <span className={team.isComplete ? badge.gold : badge.warning}>
                    {team.isComplete ? "Complete" : "Looking for more"}
                  </span>
                </div>

                <div className="rounded-lg border border-zinc-100 bg-stone-50 px-3 py-2 text-xs font-bold text-brand">
                  {formatSectionLabel(team.section)}
                </div>

                {team.teammates.map((teammate) => {
                  const name = formatUserDisplayName(teammate);

                  return (
                    <div className="grid gap-2" key={teammate.id}>
                      <div className="flex items-center gap-3">
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${avatarColorClass(teammate.id)}`}
                        >
                          {getInitials(name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-bold text-zinc-950">{name}</p>
                          <p className="truncate text-xs text-zinc-400">
                            {[teammate.year, teammate.program].filter(Boolean).join(" · ") ||
                              "No program set"}
                          </p>
                        </div>
                      </div>
                      <TeammateContact teammate={teammate} />
                    </div>
                  );
                })}

                <p className="text-xs text-zinc-400">Joined on {formatDate(team.joinedAt)}</p>
                <TeamCompletionControls
                  isComplete={team.isComplete}
                  redirectTo="/matches"
                  teamId={team.teamId}
                />
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
