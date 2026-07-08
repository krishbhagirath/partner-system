import Link from "next/link";
import type { Metadata } from "next";

import { SignOutButton } from "@/components/sign-out-button";
import { requirePageUser } from "@/server/auth";
import { listSectionsForUser } from "@/server/lab-partner";

export const metadata: Metadata = {
  title: "Sections | LabPartner",
};

export default async function SectionsPage() {
  const user = await requirePageUser();
  const sections = await listSectionsForUser(user.id);

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid size-10 place-items-center rounded bg-[#7A003C] text-sm font-bold text-white">
              LP
            </span>
            <span>
              <span className="block text-sm font-semibold uppercase text-[#7A003C]">McMaster</span>
              <span className="block text-lg font-bold leading-none">LabPartner</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <Link
              className="rounded border border-zinc-300 px-4 py-2 text-zinc-800 transition hover:border-[#7A003C] hover:text-[#7A003C]"
              href="/import"
            >
              Import
            </Link>
            <Link
              className="rounded border border-zinc-300 px-4 py-2 text-zinc-800 transition hover:border-[#7A003C] hover:text-[#7A003C]"
              href="/profile"
            >
              Profile
            </Link>
            <SignOutButton className="rounded border border-zinc-300 px-4 py-2 text-zinc-800 transition hover:border-[#7A003C] hover:text-[#7A003C]" />
          </nav>
        </header>

        <section className="py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-zinc-950">Sections</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Lab and tutorial sections imported for {user.email}.
              </p>
            </div>
            <Link
              className="rounded bg-[#7A003C] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#5f0030]"
              href="/import"
            >
              Import from Mosaic
            </Link>
          </div>

          <div className="mt-6">
            {sections.length === 0 ? (
              <p className="rounded border border-dashed border-zinc-300 bg-white px-4 py-5 text-sm text-zinc-600">
                No sections have been imported for this account yet.
              </p>
            ) : (
              <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white shadow-sm">
                {sections.map((section) => (
                  <article
                    className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto]"
                    key={section.id}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-[#7A003C] px-2 py-1 text-xs font-bold text-white">
                          {section.componentType === "LAB" ? "Lab" : "Tutorial"}
                        </span>
                        <h2 className="font-black text-zinc-950">{section.courseCode}</h2>
                        <p className="text-sm font-semibold text-zinc-500">{section.sectionCode}</p>
                      </div>
                      <p className="mt-2 text-sm text-zinc-600">
                        {formatDay(section.dayOfWeek)} from {toClockTime(section.startTime)} to{" "}
                        {toClockTime(section.endTime)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-zinc-700 sm:text-right">
                      {section.location || "Location TBA"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function formatDay(dayOfWeek: string) {
  return dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase();
}

function toClockTime(date: Date) {
  return date.toISOString().slice(11, 16);
}
