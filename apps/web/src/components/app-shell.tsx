import Link from "next/link";

import { NotificationsBell } from "@/components/notifications-bell";
import { SignOutButton } from "@/components/sign-out-button";
import { TermSwitcher } from "@/components/term-switcher";
import { formatRelativeTime, formatUserDisplayName, getInitials } from "@/lib/format";
import { button } from "@/lib/ui";
import { countPendingIncomingRequests, getRecentNotificationsForUser } from "@/server/lab-partner";

type AppView = "dashboard" | "discovery" | "requests" | "matches" | "profile" | "settings";

const UNREAD_WINDOW_MS = 48 * 60 * 60 * 1000;

const navItems: Array<{ href: string; icon: string; key: AppView; label: string }> = [
  { href: "/dashboard", icon: "▦", key: "dashboard", label: "Dashboard" },
  { href: "/sections", icon: "⌕", key: "discovery", label: "Find partners" },
  { href: "/requests", icon: "✉", key: "requests", label: "Requests" },
  { href: "/matches", icon: "◎", key: "matches", label: "Matches" },
  { href: "/settings", icon: "⚙", key: "settings", label: "Settings" },
];

type AppShellUser = {
  displayName?: string | null;
  email: string;
  id: string;
  name: string | null;
};

export async function AppShell({
  active,
  activeTerm = null,
  children,
  pageTitle,
  terms = [],
  user,
}: {
  active: AppView;
  activeTerm?: string | null;
  children: React.ReactNode;
  pageTitle: string;
  terms?: string[];
  user: AppShellUser;
}) {
  const [pendingCount, notifications] = await Promise.all([
    countPendingIncomingRequests(user.id),
    getRecentNotificationsForUser(user.id),
  ]);

  const now = Date.now();
  const notificationViews = notifications.map((notification) => ({
    id: notification.id,
    message:
      notification.kind === "request_received"
        ? `${formatUserDisplayName(notification.otherUser)} sent you a partner request for ${notification.courseLabel}.`
        : `${formatUserDisplayName(notification.otherUser)} accepted your partner request for ${notification.courseLabel}.`,
    timeLabel: formatRelativeTime(notification.occurredAt),
    unread: now - notification.occurredAt.getTime() < UNREAD_WINDOW_MS,
  }));

  const displayName = user.displayName ?? user.name ?? user.email;
  const initials = getInitials(displayName);

  return (
    <div className="flex min-h-screen bg-stone-50 text-zinc-950">
      <aside className="hidden w-[250px] shrink-0 flex-col border-r border-zinc-200 bg-white px-3.5 py-5 lg:flex">
        <Link className="mb-6 flex items-center px-2 font-display text-lg font-bold" href="/">
          <span className="text-brand">Partner</span>
          <span className="text-gold">Up</span>
        </Link>

        <TermSwitcher activeTerm={activeTerm} terms={terms} />

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link className={navLinkClass(item.key === active)} href={item.href} key={item.key}>
              <span aria-hidden className="w-4 text-center">
                {item.icon}
              </span>
              {item.label}
              {item.key === "requests" && pendingCount > 0 ? (
                <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {pendingCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-zinc-100 pt-3">
          <Link
            className="flex items-center gap-2.5 rounded-md p-2 transition-colors hover:bg-stone-50"
            href="/profile"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{displayName}</span>
              <span className="block truncate text-xs text-zinc-400">{user.email}</span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-stone-50 px-5">
          <p className="font-display text-lg font-bold">{pageTitle}</p>
          <div className="flex items-center gap-3">
            <NotificationsBell notifications={notificationViews} />
            <Link className={`${button.primary} hidden sm:inline-flex`} href="/sections">
              Find partners
            </Link>
            <SignOutButton className="hidden text-sm font-semibold text-zinc-500 hover:text-brand lg:inline-flex" />
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-3 py-2 lg:hidden">
          {navItems.map((item) => (
            <Link
              className={mobileNavLinkClass(item.key === active)}
              href={item.href}
              key={item.key}
            >
              {item.label}
            </Link>
          ))}
          <Link className={mobileNavLinkClass(active === "profile")} href="/profile">
            Profile
          </Link>
        </nav>

        <main className="mx-auto w-full max-w-[1160px] flex-1 px-6 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

function navLinkClass(active: boolean) {
  return `flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
    active ? "bg-brand-tint text-brand" : "text-zinc-600 hover:bg-stone-50"
  }`;
}

function mobileNavLinkClass(active: boolean) {
  return `shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
    active ? "bg-brand-tint text-brand" : "text-zinc-600 hover:bg-stone-50"
  }`;
}
