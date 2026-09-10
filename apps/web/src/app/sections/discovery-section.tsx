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
import { avatarColorClass, badge, button, textarea } from "@/lib/ui";
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
    <div className={viewerTeam?.isComplete ? "bg-brand/[0.03]" : ""}>
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className={badge.brand}>{isLab ? "Lab" : "Tutorial"}</span>
        <span className="font-bold text-zinc-950">{section.sectionCode}</span>
        <span className="hidden text-sm text-zinc-500 sm:inline">
          {formatDay(section.dayOfWeek)} {toClockTime(section.startTime)}–
          {toClockTime(section.endTime)}
        </span>
        <span className="ml-auto flex items-center gap-2.5">
          {viewerTeam ? (
            viewerTeam.isComplete ? (
              <span className={badge.matched}>
                {viewerTeam.teammates.length === 1
                  ? "Matched"
                  : `Team of ${viewerTeam.teammates.length + 1}`}
              </span>
            ) : (
              <span className={badge.warning}>Looking for more</span>
            )
          ) : availableCount > 0 ? (
            <span className={badge.success}>{availableCount} available</span>
          ) : (
            <span className={badge.neutral}>None yet</span>
          )}
          <svg
            aria-hidden
            className={`size-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
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
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3">
          {viewerTeam ? (
            <div className="mb-3 max-w-md rounded-xl border border-brand/25 bg-brand/[0.04] px-4 py-3">
              <p className="text-xs font-bold uppercase text-brand">
                {viewerTeam.teammates.length === 1
                  ? "Confirmed partner"
                  : `Your team of ${viewerTeam.teammates.length + 1}`}
              </p>
              {viewerTeam.teammates.map((teammate) => (
                <div key={teammate.id}>
                  <h4 className="mt-1.5 font-bold text-zinc-950">
                    {formatUserDisplayName(teammate)}
                  </h4>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-600">{teammate.email}</p>
                </div>
              ))}
              <p className="mt-1 text-xs font-semibold text-zinc-500">
                Joined {formatDate(viewerTeam.joinedAt)} · manage in{" "}
                <Link className="font-bold text-brand hover:underline" href="/settings">
                  Settings
                </Link>
              </p>
            </div>
          ) : null}

          {viewerTeam?.isComplete ? null : availableCount === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-stone-50 px-4 py-4 text-sm text-zinc-500">
              No classmates have made this section discoverable yet.
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
    <article className="flex flex-col gap-2.5 rounded-lg border border-zinc-200 bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${avatarColorClass(candidate.user.id)}`}
        >
          {getInitials(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-950">{name}</p>
          <p className="truncate text-xs text-zinc-500">{programLabel || candidate.user.email}</p>
        </div>
      </div>

      {candidate.request ? (
        <p className="inline-flex w-fit rounded border border-zinc-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-600">
          Request {formatStatus(candidate.request.status)}
        </p>
      ) : (
        <form action={sendPartnerRequest} className="grid gap-2">
          <input name="receiverId" type="hidden" value={candidate.user.id} />
          <input name="sectionId" type="hidden" value={sectionId} />
          <textarea
            className={`${textarea} min-h-14 text-sm`}
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
    <article className="flex flex-col gap-2.5 rounded-lg border border-gold/40 bg-gold-tint/40 p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex -space-x-2">
          {team.members.slice(0, 3).map((member) => (
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-white ${avatarColorClass(member.user.id)}`}
              key={member.user.id}
            >
              {getInitials(formatUserDisplayName(member.user))}
            </span>
          ))}
          {memberCount > 3 ? (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-700 ring-2 ring-white">
              +{memberCount - 3}
            </span>
          ) : null}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-950">{names.join(", ")}</p>
          <p className="truncate text-xs font-semibold text-gold-tint-text">
            {`Team of ${memberCount} · looking for more`}
          </p>
        </div>
      </div>

      {team.request ? (
        <p className="inline-flex w-fit rounded border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-600">
          Request {formatStatus(team.request.status)}
        </p>
      ) : (
        <form action={sendPartnerRequest} className="grid gap-2">
          <input name="receiverId" type="hidden" value={team.contactUserId} />
          {/*
            No teamId is sent: the server resolves which team this joins from the
            contact's current membership at accept time, so a client-supplied id
            would be both redundant and untrustworthy.
          */}
          <input name="sectionId" type="hidden" value={sectionId} />
          <textarea
            className={`${textarea} min-h-14 text-sm`}
            maxLength={180}
            name="message"
            placeholder="Optional short message"
            rows={2}
          />
          <PendingButton className={`${button.primary} w-full`} pendingLabel="Sending...">
            Ask to join
          </PendingButton>
        </form>
      )}
    </article>
  );
}
