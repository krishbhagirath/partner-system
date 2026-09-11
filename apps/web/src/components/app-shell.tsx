import Link from "next/link";

import { NotificationsBell } from "@/components/notifications-bell";
import { SignOutButton } from "@/components/sign-out-button";
import { BrandMark } from "@/components/site-header";
import { TermSwitcher } from "@/components/term-switcher";
import {
  IconDashboard,
  IconRequests,
  IconSearch,
  IconSettings,
  IconTeam,
} from "@/components/nav-icons";
import { formatRelativeTime, formatUserDisplayName, getInitials } from "@/lib/format";
import { avatarColorClass, button } from "@/lib/ui";
import { countPendingIncomingRequests, getRecentNotificationsForUser } from "@/server/lab-partner";

type AppView = "dashboard" | "discovery" | "requests" | "matches" | "profile" | "settings";

const UNREAD_WINDOW_MS = 48 * 60 * 60 * 1000;

const navItems: Array<{
  Icon: (props: { className?: string }) => React.ReactElement;
  href: string;
  key: AppView;
  label: string;
}> = [
  { Icon: IconDashboard, href: "/dashboard", key: "dashboard", label: "Dashboard" },
  { Icon: IconSearch, href: "/sections", key: "discovery", label: "Find partners" },
  { Icon: IconRequests, href: "/requests", key: "requests", label: "Requests" },
  { Icon: IconTeam, href: "/matches", key: "matches", label: "Matches" },
  { Icon: IconSettings, href: "/settings", key: "settings", label: "Settings" },
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
    <div className="flex min-h-screen bg-paper text-ink">
      <aside className="hidden w-[236px] shrink-0 flex-col border-r border-rule bg-surface px-3 py-5 lg:flex">
        <div className="mb-6 px-2">
          <BrandMark />
        </div>

        <TermSwitcher activeTerm={activeTerm} terms={terms} />

        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <Link
              aria-current={item.key === active ? "page" : undefined}
              className={navLinkClass(item.key === active)}
              href={item.href}
              key={item.key}
            >
              <item.Icon />
              {item.label}
              {item.key === "requests" && pendingCount > 0 ? (
                <span className="tnum ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {pendingCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-rule pt-3">
          <Link
            aria-current={active === "profile" ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-md p-2 transition-colors ${
              active === "profile" ? "bg-brand-tint" : "hover:bg-paper"
            }`}
            href="/profile"
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${avatarColorClass(user.id)}`}
            >
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{displayName}</span>
              <span className="block truncate text-xs text-muted">{user.email}</span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-rule bg-paper/95 px-5 backdrop-blur-sm">
          <p className="font-display text-[15px] font-bold text-ink lg:hidden">{pageTitle}</p>
          {/* On desktop the page title is the h1 in the content, so the bar stays
              quiet rather than repeating it. */}
          <span className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <NotificationsBell notifications={notificationViews} />
            {/*
              `max-sm:hidden`, not `hidden sm:inline-flex`: button.primary already
              carries an unprefixed `inline-flex`, and Tailwind orders utilities by
              its own rules rather than by class-attribute order, so that
              `inline-flex` beat the plain `hidden` and the button stayed visible on
              phones (verified at 390px). It shoved the bell ~115px inward, which is
              what pushed the notification panel off the left edge. A max-width
              variant is emitted after the base utilities, so it wins.
            */}
            <SignOutButton className={`${button.ghost} max-lg:hidden`} />
          </div>
        </header>

        {/*
          The semester picker has to be repeated here: the sidebar that holds the
          other copy is `lg:flex`, so below 1024px it was in the DOM but never
          rendered. It sits outside the scrolling nav so it stays pinned instead of
          scrolling out of reach with the links.
        */}
        <div className="flex items-center gap-2 border-b border-rule bg-surface px-3 py-2 lg:hidden">
          <nav aria-label="Sections" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
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
          <TermSwitcher activeTerm={activeTerm} terms={terms} variant="compact" />
        </div>

        <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

function navLinkClass(active: boolean) {
  return `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14.5px] font-semibold transition-colors ${
    active ? "bg-brand-tint text-brand" : "text-ink-soft hover:bg-paper hover:text-ink"
  }`;
}

function mobileNavLinkClass(active: boolean) {
  return `shrink-0 rounded-md px-2.5 py-1.5 text-sm font-semibold transition-colors ${
    active ? "bg-brand-tint text-brand" : "text-muted hover:text-ink"
  }`;
}
