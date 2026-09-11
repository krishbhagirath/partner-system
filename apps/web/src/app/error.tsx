"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-ink">
      <div className="w-full max-w-md rounded-lg border border-rule bg-surface p-6 text-center shadow-sm">
        <p className="inline-flex rounded bg-gold-tint px-3 py-1 text-sm font-bold text-ink">
          Something went wrong
        </p>
        <h1 className="mt-4 text-2xl font-black">We could not finish that action.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          The error has been logged. Try again, or head back to your profile.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            className="rounded bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-dark"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
          <Link
            className="rounded border border-rule-strong px-4 py-2 text-sm font-bold text-ink transition hover:border-brand hover:text-brand"
            href="/profile"
          >
            Go to profile
          </Link>
        </div>
      </div>
    </main>
  );
}
