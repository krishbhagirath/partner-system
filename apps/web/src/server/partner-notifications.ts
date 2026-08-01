import "server-only";

import { db } from "@/lib/db";
import { sendIncomingRequestEmail, sendMatchedEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { formatSectionLabel, formatUserDisplayName } from "@/lib/format";
import { logServerError } from "@/server/api-error";

const userSelect = {
  email: true,
  displayName: true,
  name: true,
  notifyOnRequest: true,
  notifyOnMatch: true,
} as const;

const sectionSelect = {
  courseCode: true,
  componentType: true,
  sectionCode: true,
} as const;

/**
 * Best-effort: emails the receiver that a new partner request came in. Never
 * throws — a failed/unconfigured send must not break the request itself. The
 * in-app notification bell is the reliable channel; this is a re-engagement nudge.
 */
export async function notifyIncomingPartnerRequest(requestId: string) {
  try {
    const request = await db.partnerRequest.findUnique({
      where: { id: requestId },
      include: {
        receiver: { select: userSelect },
        sender: { select: userSelect },
        section: { select: sectionSelect },
      },
    });

    if (!request?.receiver.email || !request.receiver.notifyOnRequest) {
      return;
    }

    await sendIncomingRequestEmail({
      to: request.receiver.email,
      senderName: formatUserDisplayName(request.sender),
      sectionLabel: formatSectionLabel(request.section),
      appUrl: env.NEXT_PUBLIC_APP_URL,
    });
  } catch (error) {
    logServerError("notifyIncomingPartnerRequest", error, { requestId });
  }
}

/**
 * Best-effort: emails both participants that they've matched (each about the
 * other), respecting notifyOnMatch. Never throws.
 */
export async function notifyPartnerMatched(requestId: string) {
  try {
    const request = await db.partnerRequest.findUnique({
      where: { id: requestId },
      include: {
        receiver: { select: userSelect },
        sender: { select: userSelect },
        section: { select: sectionSelect },
      },
    });

    if (!request) {
      return;
    }

    const sectionLabel = formatSectionLabel(request.section);
    const appUrl = env.NEXT_PUBLIC_APP_URL;
    const { sender, receiver } = request;

    const sends: Array<Promise<void>> = [];

    if (sender.email && sender.notifyOnMatch) {
      sends.push(
        sendMatchedEmail({
          to: sender.email,
          partnerName: formatUserDisplayName(receiver),
          sectionLabel,
          appUrl,
        }),
      );
    }

    if (receiver.email && receiver.notifyOnMatch) {
      sends.push(
        sendMatchedEmail({
          to: receiver.email,
          partnerName: formatUserDisplayName(sender),
          sectionLabel,
          appUrl,
        }),
      );
    }

    // allSettled so one failed send never affects the other.
    await Promise.allSettled(sends);
  } catch (error) {
    logServerError("notifyPartnerMatched", error, { requestId });
  }
}
