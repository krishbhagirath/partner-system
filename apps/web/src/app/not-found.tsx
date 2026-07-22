import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-50 px-6 text-zinc-950">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="inline-flex rounded bg-[#FDBF57] px-3 py-1 text-sm font-bold text-zinc-950">
          404
        </p>
        <h1 className="mt-4 text-2xl font-black">This page does not exist.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          The link may be outdated, or the page may have moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            className="rounded bg-[#7A003C] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#5f0030]"
            href="/"
          >
            Go home
          </Link>
          <Link
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-800 transition hover:border-[#7A003C] hover:text-[#7A003C]"
            href="/sections"
          >
            Browse sections
          </Link>
        </div>
      </div>
    </main>
  );
}
