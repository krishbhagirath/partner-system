import Link from "next/link";
import type { Metadata } from "next";

import { SignOutButton } from "@/components/sign-out-button";
import { requirePageUser } from "@/server/auth";

export const metadata: Metadata = {
  title: "Profile | LabPartner",
};

export default async function ProfilePage() {
  const user = await requirePageUser();

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-6 sm:px-8 lg:px-10">
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
              href="/sections"
            >
              Sections
            </Link>
            <SignOutButton className="rounded border border-zinc-300 px-4 py-2 text-zinc-800 transition hover:border-[#7A003C] hover:text-[#7A003C]" />
          </nav>
        </header>

        <section className="py-10">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h1 className="text-3xl font-black text-zinc-950">Profile</h1>
            <dl className="mt-6 grid gap-4 text-sm">
              <div>
                <dt className="font-semibold text-zinc-500">Name</dt>
                <dd className="mt-1 text-base font-bold text-zinc-950">{user.name}</dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-500">Email</dt>
                <dd className="mt-1 text-base font-bold text-zinc-950">{user.email}</dd>
              </div>
            </dl>
          </div>
        </section>
      </section>
    </main>
  );
}
