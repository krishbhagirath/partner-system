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
import { avatarColorClass, badge, button } from "@/lib/ui";
import { requirePageUser } from "@/server/auth";
import { getPartnerRequestsForUser } from "@/server/lab-partner";

import { updatePartnerRequestStatus, withdrawSentRequest } from "./actions";

export const metadata: Metadata = {
  title: "Requests | PartnerUp",
};

type PartnerRequestItem = Awaited<ReturnType<typeof getPartnerRequestsForUser>>[number];

type RequestsPageProps = {
  searchParams?: Promise<{
    notice?: string;
    tab?: string;
  }>;
};

export default async function RequestsPage({ searchParams }: RequestsPageProps) {
  const user = await requirePageUser();
  const resolvedSearchParams = await searchParams;
  const notice = resolvedSearchParams?.notice;
  const tab = resolvedSearchParams?.tab === "sent" ? "sent" : "received";

  const partnerRequests = await getPartnerRequestsForUser(user.id);
  const incomingRequests = partnerRequests.filter((request) => request.receiverId === user.id);
  const outgoingRequests = partnerRequests.filter((request) => request.senderId === user.id);
  const pendingIncomingCount = incomingRequests.filter(
    (request) => request.status === "PENDING",
  ).length;

  return (
    <AppShell active="requests" pageTitle="Requests" user={user}>
      <h1 className="font-display text-2xl font-bold text-zinc-950">Requests</h1>
      <p className="mt-1 text-[15px] text-zinc-500">
        Manage partner requests you&apos;ve sent and received.
      </p>

      <NoticeBanner clearHref={`/requests?tab=${tab}`} notice={notice} />

      <div className="mt-6 flex w-fit gap-1 rounded-lg bg-zinc-100 p-1">
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
    <article className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${avatarColorClass(request.sender.id)}`}
      >
        {getInitials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold text-zinc-950">
          {name} <span className="font-normal text-zinc-400">wants to partner on</span>
        </p>
        <p className="mt-0.5 text-sm font-semibold text-brand">
          {formatSectionLabel(request.section)}
        </p>
        {request.note ? (
          <p className="mt-1.5 text-sm leading-6 text-zinc-500">{request.note}</p>
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
    <article className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${avatarColorClass(request.receiver.id)}`}
      >
        {getInitials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold text-zinc-950">{name}</p>
        <p className="mt-0.5 text-sm text-zinc-500">{formatSectionLabel(request.section)}</p>
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
    <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">
      {message}
    </p>
  );
}

function tabClass(active: boolean) {
  return `rounded-md px-4 py-1.5 text-[13.5px] font-bold transition-colors ${
    active ? "bg-white text-brand shadow-sm" : "text-zinc-500"
  }`;
}

function statusBadgeClass(status: string) {
  if (status === "ACCEPTED") {
    return badge.success;
  }

  if (status === "DECLINED") {
    return badge.danger;
  }

  if (status === "CANCELED") {
    return badge.neutral;
  }

  return badge.warning;
}
