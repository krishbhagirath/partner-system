import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { button } from "@/lib/ui";

export function BrandMark({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <Link className="flex items-center gap-3" href="/">
      {/*
        Two equal marks sharing one slot — two people in the same lab, which is the
        whole product. It replaces the "P" tile with an arrow badge: a letter in a
        rounded square is the most generic app mark there is, the arrow meant
        nothing here, and the pair of them turned to mush at favicon size.

        Equal weight is the point: neither mark is the "main" one. The gold is the
        single deliberate exception to "gold means a confirmed team" — this is brand
        identity, never rendered beside team state, so it cannot be misread as one.
      */}
      <span aria-hidden className="shrink-0">
        <svg className="size-10" viewBox="0 0 64 64">
          <rect fill="#7A003C" height="64" rx="14" width="64" />
          <rect fill="#FFFFFF" height="18" rx="5" width="18" x="11" y="23" />
          <rect fill="#C9A227" height="18" rx="5" width="18" x="35" y="23" />
        </svg>
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
