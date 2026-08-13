"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, type ReactNode } from "react";

import { BrandMark } from "@/components/site-header";
import { SignOutButton } from "@/components/sign-out-button";
import { button, input as inputClass } from "@/lib/ui";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; imported: number; found: number; term: string }
  | { status: "error"; message: string };

export function ImportFromShareLink({ onUseMacId }: { onUseMacId: () => void }) {
  const [link, setLink] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!link.trim() || state.status === "loading") {
      return;
    }

    setState({ status: "loading" });

    try {
      const response = await fetch("/api/import/vsb", {
        body: JSON.stringify({ link: link.trim() }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as
        | { imported: number; found: number; term: string }
        | { error: string }
        | null;

      if (!response.ok || !payload || "error" in payload) {
        setState({
          status: "error",
          message:
            (payload && "error" in payload && payload.error) ||
            "Couldn't import that schedule. Please try again.",
        });
        return;
      }

      setState({
        status: "done",
        imported: payload.imported,
        found: payload.found,
        term: payload.term,
      });
    } catch {
      setState({ status: "error", message: "Something went wrong. Please try again." });
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <BrandMark />
          <SignOutButton className="text-sm font-semibold text-zinc-400 hover:text-brand" />
        </div>

        <div className="flex-1">
          {state.status === "done" ? (
            <DoneView imported={state.imported} found={state.found} term={state.term} />
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold text-zinc-950">Import your schedule</h1>
              <p className="mt-3 text-[15px] leading-7 text-zinc-600">
                Paste your McMaster MyTimetable share link and we&apos;ll pull in your lab and
                tutorial sections. No MacID password needed.
              </p>

              <ol className="mt-6 grid gap-3 text-[15px] leading-6 text-zinc-700">
                <Step n={1}>
                  Go to{" "}
                  <a
                    className="font-semibold text-brand hover:underline"
                    href="https://mytimetable.mcmaster.ca"
                    rel="noreferrer"
                    target="_blank"
                  >
                    mytimetable.mcmaster.ca
                  </a>{" "}
                  and sign in with your MacID.
                </Step>
                <Step n={2}>Open (or build) the schedule with your enrolled courses.</Step>
                <Step n={3}>
                  Click <strong>Share</strong> near the top and copy the short link it gives you.
                </Step>
                <Step n={4}>Paste it below and hit Import.</Step>
              </ol>

              <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
                <input
                  className={inputClass}
                  disabled={state.status === "loading"}
                  onChange={(event) => setLink(event.target.value)}
                  placeholder="https://mytimetable.mcmaster.ca/s/..."
                  spellCheck={false}
                  type="url"
                  value={link}
                />

                {state.status === "loading" ? <LoadingBar /> : null}

                {state.status === "error" ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                    {state.message}
                  </p>
                ) : null}

                <button
                  className={`${button.primary} h-12 w-full`}
                  disabled={state.status === "loading" || link.trim().length === 0}
                  type="submit"
                >
                  {state.status === "loading" ? "Importing your schedule..." : "Import schedule"}
                </button>
              </form>

              <button
                className="mt-6 text-sm font-semibold text-zinc-400 hover:text-brand"
                onClick={onUseMacId}
                type="button"
              >
                Prefer to log in with your MacID instead? →
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function LoadingBar() {
  const [width, setWidth] = useState(8);

  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(92));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="mt-1" aria-live="polite">
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200" role="progressbar">
        <div
          className="h-full rounded-full bg-brand transition-all duration-[2200ms] ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-2.5 text-xs font-semibold text-zinc-400">
        Reading your MyTimetable schedule...
      </p>
    </div>
  );
}

function DoneView({ imported, found, term }: { imported: number; found: number; term: string }) {
  return (
    <div className="pt-8 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand/10 text-2xl">
        ✅
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold text-zinc-950">Schedule imported</h1>
      <p className="mt-2 text-[15px] leading-7 text-zinc-600">
        {imported > 0
          ? `Added ${imported} lab/tutorial ${imported === 1 ? "section" : "sections"}${
              term ? ` for ${term}` : ""
            }.`
          : `Those ${found} ${found === 1 ? "section is" : "sections are"} already in your account.`}
      </p>

      <div className="mx-auto mt-8 grid max-w-xs gap-3">
        <Link className={`${button.primary} h-12 w-full`} href="/dashboard">
          Go to dashboard
        </Link>
        <Link className="text-sm font-semibold text-zinc-500 hover:text-brand" href="/sections">
          Review my sections
        </Link>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
