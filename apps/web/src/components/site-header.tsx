import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { button } from "@/lib/ui";

export function BrandMark({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <Link className="flex items-center gap-3" href="/">
      {/*
        The gold notch is the one deliberate exception to "gold means a confirmed
        team" — this is brand identity, not a status signal, so it never appears
        beside team state and cannot be misread as one.
      */}
      <span className="relative grid size-10 shrink-0 place-items-center rounded-md bg-brand font-display text-lg font-bold text-white">
        P
        <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-gold text-[9px] font-black leading-none text-brand ring-2 ring-surface">
          ↑
        </span>
      </span>
      <span>
        <span className="block font-display text-lg font-bold leading-none tracking-[-0.01em] text-ink">
          PartnerUp
        </span>
        {withTagline ? (
          <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            For McMaster Students
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
