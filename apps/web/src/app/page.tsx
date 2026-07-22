import Link from "next/link";

import { auth } from "@/auth";
import { NoticeBanner } from "@/components/notice-banner";
import { SiteHeader } from "@/components/site-header";
import { button } from "@/lib/ui";
import { countSectionsForUser } from "@/server/lab-partner";

const previewSections = [
  { candidates: "3 candidates", course: "COMPSCI 2C03 — Lab 03", time: "Tue 2:30–4:20 PM · ITB 137" },
  { candidates: "1 match", course: "CHEM 2OA3 — Lab 02", time: "Wed 9:30 AM–12:20 PM · ABB 165" },
] as const;

const previewPartners = [
  {
    colorClass: "bg-brand",
    initials: "PN",
    name: "Priya Nair",
    program: "Level II · Computer Science",
  },
  {
    colorClass: "bg-gold",
    initials: "JL",
    name: "Jordan Lee",
    program: "Level II · Software Eng.",
  },
] as const;

const steps = [
  {
    number: "1",
    title: "Import your schedule",
    description:
      "Connect your Mosaic account once. We automatically pull your labs and tutorials — nothing else.",
  },
  {
    number: "2",
    title: "Get matched",
    description:
      "Browse classmates in your exact sections who are also looking for a partner, with an optional note from each.",
  },
  {
    number: "3",
    title: "Confirm your partner",
    description:
      "Send a request, they accept, and you're matched. That section disappears from discovery for both of you.",
  },
] as const;

type HomeProps = {
  searchParams?: Promise<{
    notice?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const session = await auth();
  const isSignedIn = Boolean(session?.user);
  const hasSections = session?.user?.id ? (await countSectionsForUser(session.user.id)) > 0 : false;
  const notice = (await searchParams)?.notice;

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <div className="mx-auto w-full max-w-7xl px-6 py-6 sm:px-8 lg:px-10">
        <SiteHeader authenticated={isSignedIn} />
        <NoticeBanner clearHref="/" notice={notice} />

        <section className="relative overflow-hidden py-20 lg:py-28">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
            <div className="absolute right-0 top-32 h-72 w-72 rounded-full bg-gold/20 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-3xl text-center">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-brand-tint px-4 py-1.5 text-sm font-bold text-brand">
              <span aria-hidden className="size-1.5 rounded-full bg-gold" />
              Built for McMaster students
            </p>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.08] tracking-tight text-zinc-950 sm:text-5xl lg:text-[56px]">
              Find your next lab partner, <span className="text-brand">without the guesswork.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-zinc-700">
              Import your Mosaic timetable, see who else is in your labs and tutorials, and send
              partner requests in a couple of clicks.
            </p>

            <HeroCta hasSections={hasSections} isSignedIn={isSignedIn} />
          </div>
        </section>

        <section className="pb-16">
          <div className="mx-auto max-w-[1000px] rounded-[20px] border border-zinc-200 bg-white p-2 shadow-lg shadow-zinc-950/5">
            <div className="flex items-center gap-2 rounded-2xl bg-zinc-900 px-5 py-3.5">
              <span className="size-2.5 rounded-full bg-zinc-600" />
              <span className="size-2.5 rounded-full bg-zinc-600" />
              <span className="size-2.5 rounded-full bg-zinc-600" />
              <span className="ml-2 text-xs text-zinc-400">app.partnerup.mcmaster.ca/dashboard</span>
            </div>
            <div className="grid gap-7 p-6 sm:p-9 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <p className="mb-3.5 font-display text-sm font-bold text-zinc-950">
                  Sections looking for a partner
                </p>
                <div className="grid gap-2.5">
                  {previewSections.map((preview) => (
                    <div
                      className="flex items-center justify-between rounded-xl border border-zinc-100 bg-stone-50 px-4 py-3.5"
                      key={preview.course}
                    >
                      <div>
                        <p className="text-sm font-bold text-zinc-950">{preview.course}</p>
                        <p className="text-xs text-zinc-400">{preview.time}</p>
                      </div>
                      <span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand">
                        {preview.candidates}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3.5 font-display text-sm font-bold text-zinc-950">
                  Suggested partners
                </p>
                <div className="grid gap-2.5">
                  {previewPartners.map((preview) => (
                    <div
                      className="flex items-center gap-3 rounded-xl border border-zinc-100 px-3.5 py-3"
                      key={preview.name}
                    >
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${preview.colorClass}`}
                      >
                        {preview.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-zinc-950">{preview.name}</p>
                        <p className="truncate text-xs text-zinc-400">{preview.program}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-950">
              Three steps, that&apos;s it.
            </h2>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((step) => (
              <div
                className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
                key={step.number}
              >
                <span className="grid size-11 place-items-center rounded-xl bg-brand-tint font-display text-lg font-bold text-brand">
                  {step.number}
                </span>
                <h3 className="mt-4 text-lg font-bold text-zinc-950">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {!isSignedIn ? (
          <section className="pb-20">
            <div className="rounded-xl bg-brand px-8 py-14 text-center text-white sm:px-16">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">
                Ready to find your lab partner?
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-white/80">
                Create your account with your @mcmaster.ca email and import your schedule in
                minutes.
              </p>
              <Link
                className="mt-8 inline-flex items-center justify-center rounded-md bg-white px-6 py-3 text-sm font-bold text-brand transition-colors hover:bg-zinc-100"
                href="/auth/signup"
              >
                Get Started — It&apos;s Free
              </Link>
            </div>
          </section>
        ) : null}
      </div>

      <footer className="border-t border-zinc-200 py-8">
        <p className="mx-auto max-w-7xl px-6 text-center text-sm text-zinc-400 sm:px-8 lg:px-10">
          Made by students, for students. Not an official McMaster University service.
        </p>
      </footer>
    </main>
  );
}

function HeroCta({ hasSections, isSignedIn }: { hasSections: boolean; isSignedIn: boolean }) {
  if (!isSignedIn) {
    return (
      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link className={`${button.primary} px-6 py-3 text-base`} href="/auth/signup">
          Get Started — It&apos;s Free
        </Link>
        <Link
          className="text-sm font-semibold text-zinc-600 transition-colors hover:text-[#7A003C]"
          href="/auth/signin"
        >
          Already have an account? <span className="font-bold underline">Sign in</span>
        </Link>
      </div>
    );
  }

  if (hasSections) {
    return (
      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link className={`${button.primary} px-6 py-3 text-base`} href="/dashboard">
          Go to your dashboard
        </Link>
        <Link
          className="text-sm font-semibold text-zinc-600 transition-colors hover:text-brand"
          href="/sections"
        >
          Find partners
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-9 flex justify-center">
      <Link className={`${button.primary} px-6 py-3 text-base`} href="/import">
        Import your schedule
      </Link>
    </div>
  );
}
