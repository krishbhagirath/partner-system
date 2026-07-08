import Link from "next/link";

import { auth } from "@/auth";
import { SignOutButton } from "@/components/sign-out-button";

const matchingSignals = ["Course sections", "Availability", "Study goals", "Work style"] as const;

const upcomingSections = [
  {
    course: "CHEM 1A03",
    section: "Lab L05",
    time: "Tue 2:30 PM",
    matches: 8,
  },
  {
    course: "BIO 1M03",
    section: "Tutorial T12",
    time: "Thu 11:30 AM",
    matches: 5,
  },
  {
    course: "PHYSICS 1A03",
    section: "Lab L02",
    time: "Fri 9:30 AM",
    matches: 6,
  },
] as const;

export default async function Home() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid size-10 place-items-center rounded bg-[#7A003C] text-sm font-bold text-white">
              LP
            </span>
            <span>
              <span className="block text-sm font-semibold uppercase tracking-wide text-[#7A003C]">
                McMaster
              </span>
              <span className="block text-lg font-bold leading-none">LabPartner</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {session?.user ? (
              <>
                <Link
                  className="rounded bg-[#7A003C] px-4 py-2 text-white transition hover:bg-[#5f0030]"
                  href="/import"
                >
                  Import from Mosaic
                </Link>
                <Link
                  className="rounded border border-zinc-300 px-4 py-2 text-zinc-800 transition hover:border-[#7A003C] hover:text-[#7A003C]"
                  href="/profile"
                >
                  Profile
                </Link>
                <SignOutButton className="rounded border border-zinc-300 px-4 py-2 text-zinc-800 transition hover:border-[#7A003C] hover:text-[#7A003C]" />
              </>
            ) : (
              <Link
                className="rounded bg-[#7A003C] px-4 py-2 text-white transition hover:bg-[#5f0030]"
                href="/auth/signin"
              >
                Sign in
              </Link>
            )}
            <a
              className="rounded border border-zinc-300 px-4 py-2 text-zinc-800 transition hover:border-[#7A003C] hover:text-[#7A003C]"
              href="/api/health"
            >
              API health
            </a>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1fr_0.9fr] lg:py-16">
          <div className="max-w-3xl">
            <p className="mb-5 inline-flex rounded bg-[#FDBF57] px-3 py-1 text-sm font-bold text-zinc-950">
              Lab and tutorial matching for McMaster students
            </p>
            <h1 className="text-5xl font-black leading-[1.02] text-zinc-950 sm:text-6xl lg:text-7xl">
              Find a lab partner who fits your schedule.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-700">
              Import course sections once, collect student profiles, and match classmates around
              labs, tutorials, availability, and study preferences.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                className="rounded bg-[#7A003C] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#5f0030]"
                href={session?.user ? "/import" : "/auth/signin"}
              >
                {session?.user ? "Start Mosaic import" : "Sign in to start"}
              </Link>
              {matchingSignals.map((signal) => (
                <span
                  className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800"
                  key={signal}
                >
                  {signal}
                </span>
              ))}
            </div>
          </div>

          <div className="border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 bg-zinc-950 px-5 py-4 text-white">
              <p className="text-sm font-semibold text-[#FDBF57]">Winter 2026</p>
              <h2 className="mt-1 text-2xl font-bold">Matching queue</h2>
            </div>
            <div className="divide-y divide-zinc-200">
              {upcomingSections.map((section) => (
                <article className="grid grid-cols-[1fr_auto] gap-4 p-5" key={section.section}>
                  <div>
                    <p className="text-sm font-semibold text-[#7A003C]">{section.course}</p>
                    <h3 className="mt-1 text-xl font-bold">{section.section}</h3>
                    <p className="mt-2 text-sm text-zinc-600">{section.time}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-zinc-950">{section.matches}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      profile fits
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
