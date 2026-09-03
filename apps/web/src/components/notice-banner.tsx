import Link from "next/link";

const noticeCopy: Record<string, { message: string; tone: "success" | "warning" }> = {
  "account-deleted": {
    message: "Your account has been deleted.",
    tone: "success",
  },
  "discoverability-saved": {
    message: "Discoverability settings saved.",
    tone: "success",
  },
  "need-contact": {
    message:
      "Add at least one contact method (phone, Instagram, or other) so matched partners can reach you.",
    tone: "warning",
  },
  "notifications-saved": {
    message: "Notification preferences saved.",
    tone: "success",
  },
  "profile-saved": {
    message: "Profile saved.",
    tone: "success",
  },
  "request-accepted": {
    message: "Request accepted. You are now matched for that section.",
    tone: "success",
  },
  "request-conflict": {
    message:
      "That request changed before your action completed. The lists below show the current state.",
    tone: "warning",
  },
  "request-declined": {
    message: "Request declined.",
    tone: "success",
  },
  "request-sent": {
    message: "Partner request sent.",
    tone: "success",
  },
  "request-withdrawn": {
    message: "Request withdrawn. The other student will no longer see it.",
    tone: "success",
  },
  unmatched: {
    message: "Match removed. Sections marked as looking are discoverable to classmates again.",
    tone: "success",
  },
};

export function NoticeBanner({ clearHref, notice }: { clearHref: string; notice?: string }) {
  const copy = notice ? noticeCopy[notice] : undefined;

  if (!copy) {
    return null;
  }

  return (
    <div
      className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-semibold ${
        copy.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
      role="status"
    >
      <span>{copy.message}</span>
      <Link
        aria-label="Dismiss notification"
        className="rounded border border-current/30 px-2 py-1 text-xs font-bold uppercase transition hover:bg-white/60"
        href={clearHref}
      >
        Dismiss
      </Link>
    </div>
  );
}
