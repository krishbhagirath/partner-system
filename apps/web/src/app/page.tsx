import Link from "next/link";

import { auth } from "@/auth";
import { LandingTimetable } from "@/components/landing-timetable";
import { NoticeBanner } from "@/components/notice-banner";
import { SiteHeader } from "@/components/site-header";
import { button } from "@/lib/ui";
import { countSectionsForUser } from "@/server/lab-partner";

/**
 * The flow is genuinely sequential, so it is numbered — but as a ruled three-column
 * band rather than three cards, which is the templated default.
 */
const steps = [
  {
    body: "Open MyTimetable, copy the share link, paste it here. Only your labs and tutorials are saved.",
    heading: "Paste your timetable link",
    number: "1",
  },
  {
    body: "For each lab or tutorial, say whether you are looking. You control which ones classmates can see.",
    heading: "Mark what you need",
    number: "2",
  },
  {
    body: "See classmates in that exact section who are also looking. Send a request; when they accept you swap contact details.",
    heading: "Ask someone",
    number: "3",
  },
] as const;

/**
 * Handing a website your class schedule is the real hesitation, so it gets a
 * section rather than a footnote. Every line here is true of the current build.
 */
const assurances = [
  {
    body: "There is no password to give us. MyTimetable share links are read-only, and that is the only way in.",
    heading: "We never ask for your MacID",
  },
  {
    body: "Lectures, grades and everything else are discarded. We keep the labs and tutorials, nothing more.",
    heading: "Only labs and tutorials are stored",
  },
  {
    body: "Your phone number and socials stay hidden until you and a classmate have both confirmed.",
    heading: "Contact details come last",
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
    <div className="min-h-screen bg-paper text-ink">
      {/* The ruled ground runs behind the header and hero, then fades. */}
      <div className="ruled">
        <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
          <SiteHeader authenticated={isSignedIn} />
          <NoticeBanner clearHref="/" notice={notice} />

          <section className="pb-16 pt-16 sm:pt-24">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center lg:gap-16">
              <div>
                <h1 className="max-w-[14ch] font-display text-[42px] font-extrabold leading-[0.98] tracking-[-0.032em] text-ink sm:text-[56px]">
                  See who else is in your lab.
                </h1>
                <p className="mt-6 max-w-[44ch] text-[17.5px] leading-[1.65] text-ink-soft">
                  PartnerUp reads your McMaster timetable and shows you the classmates in your
                  exact lab and tutorial sections who still need a partner.
                </p>

                <HeroCta hasSections={hasSections} isSignedIn={isSignedIn} />

                <p className="mt-7 border-t border-rule pt-4 text-[13px] leading-5 text-muted">
                  For students with an @mcmaster.ca address. Free, and always will be.
                </p>
              </div>

              <LandingTimetable />
            </div>
          </section>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <main>

          <section className="border-t border-rule py-16">
            <h2 className="font-display text-[24px] font-bold tracking-[-0.015em] text-ink">
              How it works
            </h2>
            <ol className="mt-9 grid gap-9 sm:grid-cols-3 sm:gap-0">
              {steps.map((step, index) => (
                <li
                  className={`sm:px-8 sm:first:pl-0 sm:last:pr-0 ${
                    index > 0 ? "sm:border-l sm:border-rule" : ""
                  }`}
                  key={step.number}
                >
                  {/* The numeral carries the sequence, so it gets real size rather
                      than being a small label above a card. */}
                  <p className="tnum font-display text-[32px] font-extrabold leading-none text-brand/25">
                    {step.number}
                  </p>
                  <h3 className="mt-3 text-[16.5px] font-bold text-ink">{step.heading}</h3>
                  <p className="mt-2 max-w-[38ch] text-[14.5px] leading-[1.6] text-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </main>
      </div>

      {/* Deliberately shaped unlike the section above it — heading held left against a
          tinted ground — so the page has rhythm instead of three identical bands. */}
      <section className="border-y border-rule bg-brand-tint/45">
        <div className="mx-auto grid max-w-[1120px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <h2 className="max-w-[16ch] font-display text-[24px] font-bold leading-tight tracking-[-0.015em] text-ink">
              What happens to your schedule
            </h2>
            <p className="mt-3 max-w-[34ch] text-[14.5px] leading-6 text-ink-soft">
              Handing a website your timetable is a fair thing to hesitate over. Here is
              exactly what we do and do not keep.
            </p>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-lg border border-brand/15 bg-brand/15">
            {assurances.map((item) => (
              <div className="bg-paper px-5 py-4" key={item.heading}>
                <dt className="text-[15px] font-bold text-ink">{item.heading}</dt>
                <dd className="mt-1 max-w-[52ch] text-[14.5px] leading-[1.6] text-muted">
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <main>
          {!isSignedIn ? (
            <section className="flex flex-wrap items-center justify-between gap-6 py-16">
              <div>
                <p className="max-w-[20ch] font-display text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-ink">
                  Ready to see who is in your sections?
                </p>
                <p className="mt-2 text-[14.5px] text-muted">
                  Takes about a minute, and you can change what is visible at any time.
                </p>
              </div>
              <Link className={`${button.primary} px-5 py-3 text-[15px]`} href="/auth/signup">
                Create your account
              </Link>
            </section>
          ) : null}
        </main>
      </div>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-7 text-[13px] text-muted sm:px-8">
          <p>PartnerUp is a student project. Not affiliated with McMaster University.</p>
          <Link className="font-semibold hover:text-brand" href="/auth/signin">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}

/**
 * The label names what the click actually does, so it changes with the viewer's
 * state rather than staying a generic "Get started".
 */
function HeroCta({ hasSections, isSignedIn }: { hasSections: boolean; isSignedIn: boolean }) {
  if (!isSignedIn) {
    return (
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link className={`${button.primary} px-5 py-3 text-[15px]`} href="/auth/signup">
          Create your account
        </Link>
        <Link className="text-sm font-semibold text-ink-soft hover:text-brand" href="/auth/signin">
          I already have one
        </Link>
      </div>
    );
  }

  if (hasSections) {
    return (
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link className={`${button.primary} px-5 py-3 text-[15px]`} href="/sections">
          Find partners
        </Link>
        <Link className="text-sm font-semibold text-ink-soft hover:text-brand" href="/dashboard">
          Go to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <Link className={`${button.primary} px-5 py-3 text-[15px]`} href="/import">
        Import your timetable
      </Link>
    </div>
  );
}
