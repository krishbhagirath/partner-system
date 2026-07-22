import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { button } from "@/lib/ui";

const navLinkBase = "rounded-md border px-4 py-2 transition-colors";
const navLinkIdle = "border-zinc-300 bg-white text-zinc-800 hover:border-brand hover:text-brand";

export function BrandMark({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <Link className="flex items-center gap-3" href="/">
      <span className="relative grid size-10 shrink-0 place-items-center rounded-md bg-brand font-display text-lg font-bold text-white">
        P
        <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-gold text-[9px] font-black leading-none text-brand ring-2 ring-white">
          ↑
        </span>
      </span>
      <span>
        <span className="block font-display text-lg font-bold leading-none text-zinc-950">
          PartnerUp
        </span>
        {withTagline ? (
          <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
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
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
      <BrandMark />
      <nav aria-label="Main" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {authenticated ? (
          <>
            <Link className={`${navLinkBase} ${navLinkIdle}`} href="/dashboard">
              Dashboard
            </Link>
            <SignOutButton className={`${navLinkBase} ${navLinkIdle}`} />
          </>
        ) : (
          <>
            <Link className={button.primary} href="/auth/signin">
              Sign in
            </Link>
            <Link className={button.secondary} href="/auth/signup">
              Create account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
