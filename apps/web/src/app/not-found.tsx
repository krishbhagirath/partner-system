import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-ink">
      <div className="w-full max-w-md rounded-lg border border-rule bg-surface p-6 text-center shadow-sm">
        <p className="inline-flex rounded bg-gold-tint px-3 py-1 text-sm font-bold text-ink">
          404
        </p>
        <h1 className="mt-4 text-2xl font-black">This page does not exist.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          The link may be outdated, or the page may have moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            className="rounded bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-dark"
            href="/"
          >
            Go home
          </Link>
          <Link
            className="rounded border border-rule-strong px-4 py-2 text-sm font-bold text-ink transition hover:border-brand hover:text-brand"
            href="/sections"
          >
            Browse sections
          </Link>
        </div>
      </div>
    </main>
  );
}
