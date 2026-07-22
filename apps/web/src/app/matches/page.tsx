import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { formatDate, formatSectionLabel, formatUserDisplayName, getInitials } from "@/lib/format";
import { avatarColorClass, badge } from "@/lib/ui";
import { requirePageUser } from "@/server/auth";
import { listMatchesForUser } from "@/server/lab-partner";

export const metadata: Metadata = {
  title: "Matches | PartnerUp",
};

export default async function MatchesPage() {
  const user = await requirePageUser();
  const matches = await listMatchesForUser(user.id);

  return (
    <AppShell active="matches" pageTitle="Matches" user={user}>
      <h1 className="font-display text-2xl font-bold text-zinc-950">Matches</h1>
      <p className="mt-1 text-[15px] text-zinc-500">Confirmed lab and tutorial partners.</p>

      {matches.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">
          No confirmed matches yet. Accept a request from{" "}
          <a className="font-bold text-brand hover:underline" href="/requests">
            Requests
          </a>{" "}
          to see it here.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {matches.map((match) => {
            const name = formatUserDisplayName(match.partner);

            return (
              <article
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5"
                key={match.requestId}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${avatarColorClass(match.partner.id)}`}
                  >
                    {getInitials(name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-zinc-950">{name}</p>
                    <p className="truncate text-xs text-zinc-400">
                      {[match.partner.year, match.partner.program].filter(Boolean).join(" · ") ||
                        "No program set"}
                    </p>
                  </div>
                  <span className={badge.gold}>Matched</span>
                </div>

                <div className="rounded-lg border border-zinc-100 bg-stone-50 px-3 py-2 text-xs font-bold text-brand">
                  {formatSectionLabel(match.section)}
                </div>

                <div className="grid gap-1 text-sm text-zinc-500">
                  <p>✉ {match.partner.email}</p>
                  {match.partner.contactPhone ? <p>📞 {match.partner.contactPhone}</p> : null}
                  {match.partner.contactInstagram ? (
                    <p>📷 {match.partner.contactInstagram}</p>
                  ) : null}
                  {match.partner.contactOther ? <p>💬 {match.partner.contactOther}</p> : null}
                </div>
                <p className="text-xs text-zinc-400">Matched on {formatDate(match.matchedAt)}</p>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
