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
  const { matchedPartner, matches, section } = discoverySection;
  const [open, setOpen] = useState(false);
  const isLab = section.componentType === "LAB";

  return (
    <div className={matchedPartner ? "bg-brand/[0.03]" : ""}>
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
          {matchedPartner ? (
            <span className={badge.matched}>Matched</span>
          ) : matches.length > 0 ? (
            <span className={badge.success}>
              {matches.length} {matches.length === 1 ? "match" : "matches"}
            </span>
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
          {matchedPartner ? (
            <div className="max-w-md rounded-xl border border-brand/25 bg-brand/[0.04] px-4 py-3">
              <p className="text-xs font-bold uppercase text-brand">Confirmed partner</p>
              <h4 className="mt-1.5 font-bold text-zinc-950">
                {formatUserDisplayName(matchedPartner.partner)}
              </h4>
              <p className="mt-0.5 text-sm font-semibold text-zinc-600">
                {matchedPartner.partner.email}
              </p>
              <p className="mt-1 text-xs font-semibold text-zinc-500">
                Matched {formatDate(matchedPartner.matchedAt)} · manage in{" "}
                <Link className="font-bold text-brand hover:underline" href="/settings">
                  Settings
                </Link>
              </p>
            </div>
          ) : matches.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-stone-50 px-4 py-4 text-sm text-zinc-500">
              No classmates have made this section discoverable yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
      ) : null}
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
    <article className="flex flex-col gap-2.5 rounded-lg border border-zinc-200 bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${avatarColorClass(match.user.id)}`}
        >
          {getInitials(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-950">{name}</p>
          <p className="truncate text-xs text-zinc-500">{programLabel || match.user.email}</p>
        </div>
      </div>

      {match.note ? <p className="text-xs leading-5 text-zinc-600">{match.note}</p> : null}

      {match.request ? (
        <p className="inline-flex w-fit rounded border border-zinc-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-600">
          Request {formatStatus(match.request.status)}
        </p>
      ) : (
        <form action={sendPartnerRequest} className="grid gap-2">
          <input name="receiverId" type="hidden" value={match.user.id} />
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
