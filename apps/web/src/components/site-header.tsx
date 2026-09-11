import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { button } from "@/lib/ui";

export function BrandMark({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <Link className="flex items-center gap-2.5" href="/">
      {/*
        The mark is a timetable cell with one slot filled — the same idea the whole
        product runs on. It replaces the generic rounded-square initial.
      */}
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded bg-brand">
        <svg className="size-[18px]" fill="none" viewBox="0 0 18 18">
          <rect height="13" rx="1.5" stroke="white" strokeWidth="1.4" width="13" x="2.5" y="2.5" />
          <path d="M2.5 7h13" stroke="white" strokeWidth="1.4" />
          <rect fill="white" height="4" rx="0.5" width="4.5" x="9" y="9" />
        </svg>
      </span>
      <span>
        <span className="block font-display text-[17px] font-bold leading-none tracking-[-0.01em] text-ink">
          PartnerUp
        </span>
        {withTagline ? (
          <span className="mt-1 block text-[12.5px] leading-none text-muted">
            For McMaster students
          </span>
        ) : null}
      </span>
    </Link>
  );
}

// Used only on the public landing page and auth screens — every authenticated
// in-app page uses AppShell's sidebar nav instead.
export function SiteHeader({ authenticated }: { authenticated: boolean }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-rule py-4">
      <BrandMark />
      <nav aria-label="Main" className="flex items-center gap-1.5 sm:gap-3">
        {authenticated ? (
          <>
            <Link className={button.ghost} href="/dashboard">
              Dashboard
            </Link>
            <SignOutButton className={button.ghost} />
          </>
        ) : (
          <>
            <Link className={button.ghost} href="/auth/signin">
              Sign in
            </Link>
            <Link className={button.primary} href="/auth/signup">
              Create account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
