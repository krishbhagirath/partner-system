"use client";

import Link from "next/link";
import { useState } from "react";

import { PendingButton } from "@/components/pending-button";
import {
  formatDate,
  formatDay,
  formatStatus,
  formatUserDisplayName,
  getInitials,
  toClockTime,
} from "@/lib/format";
import {
  avatarColorClass,
  button,
  chip,
  componentMark,
  emptyState,
  personCard,
  textarea,
} from "@/lib/ui";
import type { listSectionDiscoveryForUser } from "@/server/lab-partner";

import { sendPartnerRequest } from "./actions";

type DiscoverySection = Awaited<ReturnType<typeof listSectionDiscoveryForUser>>[number];

// A collapsed, clickable row per section. Click to expand and see classmates.
export function DiscoverySection({ discoverySection }: { discoverySection: DiscoverySection }) {
  const { candidates, openTeams, section, viewerTeam } = discoverySection;
  const availableCount = candidates.length + openTeams.length;
  const [open, setOpen] = useState(false);
  const isLab = section.componentType === "LAB";

  return (
    <div className={viewerTeam?.isComplete ? "bg-brand-tint/40" : ""}>
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-paper"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className={componentMark}>{isLab ? "Lab" : "Tutorial"}</span>
        <span className="font-semibold text-ink">{section.sectionCode}</span>
        <span className="tnum hidden text-[13.5px] text-muted sm:inline">
          {formatDay(section.dayOfWeek)} {toClockTime(section.startTime)}–
          {toClockTime(section.endTime)}
        </span>
        <span className="ml-auto flex items-center gap-2.5">
          {viewerTeam ? (
            viewerTeam.isComplete ? (
              <span className={chip.team}>
                {viewerTeam.teammates.length === 1
                  ? "Partnered"
                  : `Team of ${viewerTeam.teammates.length + 1}`}
              </span>
            ) : (
              <span className={chip.looking}>Looking for more</span>
            )
          ) : availableCount > 0 ? (
            <span className={chip.active}>{availableCount} available</span>
          ) : (
            <span className={chip.neutral}>None yet</span>
          )}
          <svg
            aria-hidden
            className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="border-t border-rule px-4 pb-4 pt-3">
          {viewerTeam ? (
            <div className="mb-4 max-w-md rounded-md border border-brand/25 bg-brand-tint px-4 py-3">
              <p className="text-[13px] font-bold text-brand">
                {viewerTeam.teammates.length === 1
                  ? "Confirmed partner"
                  : `Your team of ${viewerTeam.teammates.length + 1}`}
              </p>
              {viewerTeam.teammates.map((teammate) => (
                <div key={teammate.id}>
                  <h4 className="mt-1.5 font-semibold text-ink">
                    {formatUserDisplayName(teammate)}
                  </h4>
                  <p className="mt-0.5 text-sm text-ink-soft">{teammate.email}</p>
                </div>
              ))}
              <p className="mt-2 text-[13px] text-muted">
                Joined {formatDate(viewerTeam.joinedAt)} · manage in{" "}
                <Link className="font-bold text-brand hover:underline" href="/settings">
                  Settings
                </Link>
              </p>
            </div>
          ) : null}

          {viewerTeam?.isComplete ? null : availableCount === 0 ? (
            <p className={emptyState}>
              Nobody in this section is looking yet. You will show up here for them as long as
              this section is marked as looking.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {openTeams.map((team) => (
                <TeamCard key={team.teamId} sectionId={section.id} team={team} />
              ))}
              {candidates.map((candidate) => (
                <CandidateCard
                  candidate={candidate}
                  key={candidate.discoverableSectionId}
                  sectionId={section.id}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CandidateCard({
  candidate,
  sectionId,
}: {
  candidate: DiscoverySection["candidates"][number];
  sectionId: string;
}) {
  const name = formatUserDisplayName(candidate.user);
  const programLabel = [candidate.user.year, candidate.user.program].filter(Boolean).join(" · ");

  return (
    <article className={personCard}>
      {/* The person leads. The message field used to be the heaviest element here,
          which put a form above the human being it was about. */}
      <div className="flex items-center gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white ${avatarColorClass(candidate.user.id)}`}
        >
          {getInitials(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{name}</p>
          <p className="truncate text-[13px] text-muted">{programLabel || candidate.user.email}</p>
        </div>
      </div>

      {candidate.note ? (
        <p className="mt-3 border-l-2 border-rule-strong pl-3 text-[13.5px] leading-6 text-ink-soft">
          {candidate.note}
        </p>
      ) : null}

      {candidate.request ? (
        <p className={`${chip.neutral} mt-4 self-start`}>
          Request {formatStatus(candidate.request.status).toLowerCase()}
        </p>
      ) : (
        <form action={sendPartnerRequest} className="mt-4 grid gap-2">
          <input name="receiverId" type="hidden" value={candidate.user.id} />
          <input name="sectionId" type="hidden" value={sectionId} />
          <label className="sr-only" htmlFor={`note-${candidate.discoverableSectionId}`}>
            Message to {name}
          </label>
          <textarea
            className={`${textarea} min-h-[38px] bg-surface text-[13.5px]`}
            id={`note-${candidate.discoverableSectionId}`}
            maxLength={180}
            name="message"
            placeholder="Add a note (optional)"
            rows={1}
          />
          <PendingButton className={`${button.primary} w-full`} pendingLabel="Sending...">
            Send request
          </PendingButton>
        </form>
      )}
    </article>
  );
}

/**
 * A team with room in it. The request is addressed to one named member (the earliest
 * joiner) so there is always a specific person accountable for answering — same
 * mental model as requesting an individual.
 */
function TeamCard({
  sectionId,
  team,
}: {
  sectionId: string;
  team: DiscoverySection["openTeams"][number];
}) {
  const memberCount = team.members.length;
  const names = team.members.map((member) => formatUserDisplayName(member.user));

  return (
    <article className={personCard}>
      <div className="flex items-center gap-3">
        <span className="flex -space-x-2">
          {team.members.slice(0, 3).map((member) => (
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white ring-2 ring-surface ${avatarColorClass(member.user.id)}`}
              key={member.user.id}
            >
              {getInitials(formatUserDisplayName(member.user))}
            </span>
          ))}
          {memberCount > 3 ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rule text-[13px] font-bold text-ink-soft ring-2 ring-surface">
              +{memberCount - 3}
            </span>
          ) : null}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{names.join(", ")}</p>
          <p className="truncate text-[13px] text-muted">
            Team of {memberCount}, looking for more
          </p>
        </div>
      </div>

      {team.request ? (
        <p className={`${chip.neutral} mt-4 self-start`}>
          Request {formatStatus(team.request.status).toLowerCase()}
        </p>
      ) : (
        <form action={sendPartnerRequest} className="mt-4 grid gap-2">
          <input name="receiverId" type="hidden" value={team.contactUserId} />
          {/*
            No teamId is sent: the server resolves which team this joins from the
            contact's current membership at accept time, so a client-supplied id
            would be both redundant and untrustworthy.
          */}
          <input name="sectionId" type="hidden" value={sectionId} />
          <label className="sr-only" htmlFor={`note-team-${team.teamId}`}>
            Message to this team
          </label>
          <textarea
            className={`${textarea} min-h-[38px] bg-surface text-[13.5px]`}
            id={`note-team-${team.teamId}`}
            maxLength={180}
            name="message"
            placeholder="Add a note (optional)"
            rows={1}
          />
          <PendingButton className={`${button.primary} w-full`} pendingLabel="Sending...">
            Ask to join
          </PendingButton>
        </form>
      )}
    </article>
  );
}
