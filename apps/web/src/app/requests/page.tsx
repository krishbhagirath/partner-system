import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { NoticeBanner } from "@/components/notice-banner";
import { PendingButton } from "@/components/pending-button";
import {
  formatSectionLabel,
  formatStatus,
  formatUserDisplayName,
  getInitials,
} from "@/lib/format";
import { avatarColorClass, button, chip, pageLede, pageTitle } from "@/lib/ui";
import { TeamCompletePrompt } from "@/components/team-controls";
import { requirePageUser } from "@/server/auth";
import {
  getPartnerRequestsForUser,
  getTeamsBySectionKeyForUser,
  resolveActiveTerm,
} from "@/server/lab-partner";

import { updatePartnerRequestStatus, withdrawSentRequest } from "./actions";

export const metadata: Metadata = {
  title: "Requests | PartnerUp",
};

type PartnerRequestItem = Awaited<ReturnType<typeof getPartnerRequestsForUser>>[number];

type RequestsPageProps = {
  searchParams?: Promise<{
    notice?: string;
    tab?: string;
    team?: string;
    term?: string;
  }>;
};

export default async function RequestsPage({ searchParams }: RequestsPageProps) {
  const user = await requirePageUser();
  const resolvedSearchParams = await searchParams;
  const notice = resolvedSearchParams?.notice;
  const tab = resolvedSearchParams?.tab === "sent" ? "sent" : "received";
  const { activeTerm, terms } = await resolveActiveTerm(user.id, resolvedSearchParams?.term);
  const promptTeamId = resolvedSearchParams?.team;
  const promptTeam = promptTeamId
    ? [...(await getTeamsBySectionKeyForUser(user.id)).values()].find(
        (team) => team.teamId === promptTeamId,
      )
    : undefined;

  const partnerRequests = await getPartnerRequestsForUser(user.id, activeTerm ?? undefined);
  const incomingRequests = partnerRequests.filter((request) => request.receiverId === user.id);
  const outgoingRequests = partnerRequests.filter((request) => request.senderId === user.id);
  const pendingIncomingCount = incomingRequests.filter(
    (request) => request.status === "PENDING",
  ).length;

  return (
    <AppShell active="requests" activeTerm={activeTerm} pageTitle="Requests" terms={terms} user={user}>
      <h1 className={pageTitle}>Requests</h1>
      <p className={pageLede}>
        Manage partner requests you&apos;ve sent and received.
      </p>

      <NoticeBanner clearHref={`/requests?tab=${tab}`} notice={notice} />

      {promptTeam ? (
        <TeamCompletePrompt
          isComplete={promptTeam.isComplete}
          redirectTo={`/requests?tab=${tab}`}
          teamId={promptTeam.teamId}
        />
      ) : null}

      <div className="mt-6 flex w-fit gap-1 rounded-lg bg-paper p-1">
        <Link className={tabClass(tab === "received")} href="/requests?tab=received">
          Received{pendingIncomingCount > 0 ? ` (${pendingIncomingCount})` : ""}
        </Link>
        <Link className={tabClass(tab === "sent")} href="/requests?tab=sent">
          Sent
        </Link>
      </div>

      <div className="mt-5 grid gap-3">
        {tab === "received" ? (
          incomingRequests.length === 0 ? (
            <EmptyState message="No pending requests right now." />
          ) : (
            incomingRequests.map((request) => (
              <ReceivedRequestCard key={request.id} request={request} />
            ))
          )
        ) : outgoingRequests.length === 0 ? (
          <EmptyState message="No sent requests yet." />
        ) : (
          outgoingRequests.map((request) => <SentRequestCard key={request.id} request={request} />)
        )}
      </div>
    </AppShell>
  );
}

function ReceivedRequestCard({ request }: { request: PartnerRequestItem }) {
  const name = formatUserDisplayName(request.sender);

  return (
    <article className="flex flex-wrap items-center gap-4 rounded-md border border-rule bg-surface px-5 py-4">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${avatarColorClass(request.sender.id)}`}
      >
        {getInitials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold text-ink">
          {name} <span className="font-normal text-muted">wants to partner on</span>
        </p>
        <p className="mt-0.5 text-sm font-semibold text-brand">
          {formatSectionLabel(request.section)}
        </p>
        {request.note ? (
          <p className="mt-1.5 text-sm leading-6 text-muted">{request.note}</p>
        ) : null}
      </div>

      {request.status === "PENDING" ? (
        <div className="flex shrink-0 gap-2">
          <form action={updatePartnerRequestStatus}>
            <input name="requestId" type="hidden" value={request.id} />
            <input name="status" type="hidden" value="DECLINED" />
            <PendingButton className={button.secondary} pendingLabel="Declining...">
              Decline
            </PendingButton>
          </form>
          <form action={updatePartnerRequestStatus}>
            <input name="requestId" type="hidden" value={request.id} />
            <input name="status" type="hidden" value="ACCEPTED" />
            <PendingButton className={button.primary} pendingLabel="Accepting...">
              Accept
            </PendingButton>
          </form>
        </div>
      ) : (
        <span className={statusBadgeClass(request.status)}>{formatStatus(request.status)}</span>
      )}
    </article>
  );
}

function SentRequestCard({ request }: { request: PartnerRequestItem }) {
  const name = formatUserDisplayName(request.receiver);

  return (
    <article className="flex flex-wrap items-center gap-4 rounded-md border border-rule bg-surface px-5 py-4">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${avatarColorClass(request.receiver.id)}`}
      >
        {getInitials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold text-ink">{name}</p>
        <p className="mt-0.5 text-sm text-muted">{formatSectionLabel(request.section)}</p>
      </div>

      <span className={statusBadgeClass(request.status)}>{formatStatus(request.status)}</span>

      {request.status === "PENDING" ? (
        <form action={withdrawSentRequest}>
          <input name="requestId" type="hidden" value={request.id} />
          <ConfirmSubmitButton
            className={button.secondary}
            confirmMessage="Withdraw this partner request? The other student will no longer see it."
            pendingLabel="Withdrawing..."
          >
            Withdraw
          </ConfirmSubmitButton>
        </form>
      ) : null}
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-rule-strong bg-surface px-4 py-10 text-center text-sm text-muted">
      {message}
    </p>
  );
}

function tabClass(active: boolean) {
  return `rounded-md px-4 py-1.5 text-[13.5px] font-bold transition-colors ${
    active ? "bg-surface text-brand" : "text-muted"
  }`;
}

function statusBadgeClass(status: string) {
  if (status === "ACCEPTED") {
    return chip.active;
  }

  if (status === "DECLINED") {
    return chip.neutral;
  }

  if (status === "CANCELED") {
    return chip.neutral;
  }

  return chip.looking;
}
