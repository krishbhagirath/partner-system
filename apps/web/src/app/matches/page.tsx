import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import {
  TeamCompletePrompt,
  TeamCompletionControls,
  TeammateContact,
} from "@/components/team-controls";
import { formatDate, formatSectionLabel, formatUserDisplayName, getInitials } from "@/lib/format";
import { avatarColorClass, chip, pageLede, pageTitle } from "@/lib/ui";
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
      <h1 className={pageTitle}>Matches</h1>
      <p className={pageLede}>Your confirmed lab and tutorial teams.</p>

      <NoticeBanner clearHref="/matches" notice={resolvedSearchParams?.notice} />

      {promptTeam ? (
        <TeamCompletePrompt
          isComplete={promptTeam.isComplete}
          redirectTo="/matches"
          teamId={promptTeam.teamId}
        />
      ) : null}

      {teams.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-rule-strong bg-surface px-4 py-10 text-center text-sm text-muted">
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
                className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5"
                key={team.teamId}
              >
                {/* The section label was a bordered box inside a bordered card. It is
                    the card's subject, so it is now simply its heading. */}
                <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-ink">
                      {formatSectionLabel(team.section)}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {noun === "partner" ? "Your partner" : `Team of ${memberCount}`}
                    </p>
                  </div>
                  <span className={team.isComplete ? chip.team : chip.looking}>
                    {team.isComplete ? "Complete" : "Looking for more"}
                  </span>
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
                          <p className="truncate text-[15px] font-bold text-ink">{name}</p>
                          <p className="truncate text-xs text-muted">
                            {[teammate.year, teammate.program].filter(Boolean).join(" · ") ||
                              "No program set"}
                          </p>
                        </div>
                      </div>
                      <TeammateContact teammate={teammate} />
                    </div>
                  );
                })}

                <p className="text-xs text-muted">Joined on {formatDate(team.joinedAt)}</p>
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
