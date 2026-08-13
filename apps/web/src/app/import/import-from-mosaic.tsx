"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { BrandMark } from "@/components/site-header";
import { SignOutButton } from "@/components/sign-out-button";
import { formatComponentType, formatDay, formatSectionLabel } from "@/lib/format";
import { button, input as inputClass } from "@/lib/ui";

type ImportJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";

type ImportJob = {
  createdAt: string;
  errorMessage: string | null;
  finishedAt: string | null;
  id: string;
  progressCurrent: number | null;
  progressStage: string | null;
  progressTotal: number | null;
  sectionsCount: number;
  startedAt: string | null;
  status: ImportJobStatus;
  updatedAt: string;
};

type PartnerNeedResponse = "YES" | "NO" | "UNSURE";

type ImportedSection = {
  componentType: "LAB" | "TUTORIAL";
  courseCode: string;
  createdAt: string;
  dayOfWeek: string;
  endTime: string;
  id: string;
  importJobId: string | null;
  location: string;
  partnerNeedNoCount: number | null;
  partnerNeedYesCount: number | null;
  rawTitle: string | null;
  sectionCode: string;
  startTime: string;
  term: string;
  updatedAt: string;
  viewerPartnerNeedResponse: PartnerNeedResponse | null;
};

type StartImportResponse = { jobId: string };
type ImportStatusResponse = { job: ImportJob };
type ImportSectionsResponse = { sections: ImportedSection[] };
type ApiErrorResponse = { error?: string; issues?: string[] };

const terminalStatuses = new Set<ImportJobStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

type ImportProgress = { label: string; percent: number };

function getImportProgress(job: ImportJob | null): ImportProgress {
  if (!job) {
    return { label: "Waiting for the import worker to pick up the job...", percent: 4 };
  }

  if (job.status === "SUCCEEDED") {
    return { label: "Import complete.", percent: 100 };
  }

  switch (job.progressStage) {
    case "LOGGING_IN":
      return { label: "Logging in to Mosaic...", percent: 12 };
    case "NAVIGATING":
      return { label: "Opening your weekly schedule...", percent: 25 };
    case "SCRAPING": {
      const total = job.progressTotal ?? 0;
      const current = Math.min(job.progressCurrent ?? 0, total);
      const fraction = total > 0 ? current / total : 0;

      return {
        label:
          total > 0
            ? `Reading week ${Math.max(current, 1)} of ${total}...`
            : "Reading your schedule week by week...",
        percent: Math.round(25 + fraction * 60),
      };
    }
    case "PARSING":
      return { label: "Extracting lab and tutorial sections...", percent: 88 };
    case "SAVING":
      return { label: "Saving your sections...", percent: 94 };
    default:
      return { label: "Waiting for the import worker to pick up the job...", percent: 4 };
  }
}

const stepLabels = ["Connect", "Sync", "Review", "Partners", "Done"];

export function ImportFromMosaic({ existingSectionsCount }: { existingSectionsCount: number }) {
  const [step, setStep] = useState(0);

  const [macId, setMacId] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [sections, setSections] = useState<ImportedSection[]>([]);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [isLoadingSections, setIsLoadingSections] = useState(false);
  const [excludingIds, setExcludingIds] = useState<Set<string>>(new Set());
  const [excludeError, setExcludeError] = useState<string | null>(null);

  const [partnerAnswers, setPartnerAnswers] = useState<Record<string, PartnerNeedResponse>>({});
  const [isSavingPartnerAnswers, setIsSavingPartnerAnswers] = useState(false);
  const [savingError, setSavingError] = useState<string | null>(null);

  const importedSections = useMemo(() => {
    if (!jobId) {
      return [];
    }

    return sections.filter((section) => section.importJobId === jobId);
  }, [jobId, sections]);

  function resetToConnect() {
    // Setting jobId to null tears down the polling effect below (its cleanup
    // clears the interval), so no manual interval bookkeeping is needed here.
    setStep(0);
    setJobId(null);
    setJob(null);
    setStatusError(null);
    setPassword("");
  }

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let isCurrent = true;

    async function pollStatus() {
      try {
        const response = await fetch(`/api/import/status/${jobId}`, { cache: "no-store" });
        const payload = (await readJson(response)) as
          | ImportStatusResponse
          | ApiErrorResponse
          | null;

        if (!response.ok || !payload || !("job" in payload)) {
          throw new Error(getApiErrorMessage(payload, "Unable to read import status."));
        }

        if (!isCurrent) {
          return;
        }

        setJob(payload.job);
        setStatusError(null);

        if (terminalStatuses.has(payload.job.status)) {
          window.clearInterval(intervalId);
        }
      } catch (error) {
        if (isCurrent) {
          setStatusError(getErrorMessage(error, "Unable to read import status."));
        }
      }
    }

    const intervalId = window.setInterval(() => {
      void pollStatus();
    }, 3000);
    void pollStatus();

    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
    };
  }, [jobId]);

  useEffect(() => {
    if (job?.status !== "SUCCEEDED") {
      return;
    }

    let isCurrent = true;

    async function loadSections() {
      setIsLoadingSections(true);
      setSectionsError(null);

      try {
        const response = await fetch("/api/import/sections", { cache: "no-store" });
        const payload = (await readJson(response)) as
          | ImportSectionsResponse
          | ApiErrorResponse
          | null;

        if (!response.ok || !payload || !("sections" in payload)) {
          throw new Error(getApiErrorMessage(payload, "Unable to load imported sections."));
        }

        if (isCurrent) {
          setSections(payload.sections);
          // Pre-fill any course+component the student already voted on in a
          // prior import, so a re-import doesn't force re-answering.
          setPartnerAnswers((current) => {
            const next = { ...current };

            for (const section of payload.sections) {
              if (section.importJobId === jobId && section.viewerPartnerNeedResponse) {
                next[section.id] = section.viewerPartnerNeedResponse;
              }
            }

            return next;
          });
          setStep(2);
        }
      } catch (error) {
        if (isCurrent) {
          setSectionsError(getErrorMessage(error, "Unable to load imported sections."));
        }
      } finally {
        if (isCurrent) {
          setIsLoadingSections(false);
        }
      }
    }

    void loadSections();

    return () => {
      isCurrent = false;
    };
  }, [job?.status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMacId = macId.trim();

    if (!trimmedMacId || !password) {
      setSubmitError("Enter your MacID and password to start the import.");
      return;
    }

    const passwordForRequest = password;

    setIsSubmitting(true);
    setSubmitError(null);
    setStatusError(null);
    setJob(null);
    setJobId(null);
    setSections([]);
    setPassword("");

    try {
      const response = await fetch("/api/import/start", {
        body: JSON.stringify({ macId: trimmedMacId, password: passwordForRequest }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await readJson(response)) as StartImportResponse | ApiErrorResponse | null;

      if (!response.ok || !payload || !("jobId" in payload)) {
        throw new Error(getApiErrorMessage(payload, "Unable to start import."));
      }

      setStep(1);
      setJobId(payload.jobId);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Unable to start import."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExcludeSection(sectionId: string) {
    setExcludingIds((current) => new Set(current).add(sectionId));
    setExcludeError(null);

    try {
      const response = await fetch(`/api/import/sections/${sectionId}`, { method: "DELETE" });

      if (!response.ok) {
        const payload = (await readJson(response)) as ApiErrorResponse | null;
        throw new Error(getApiErrorMessage(payload, "Unable to remove that section."));
      }

      setSections((current) => current.filter((section) => section.id !== sectionId));
    } catch (error) {
      setExcludeError(getErrorMessage(error, "Unable to remove that section."));
    } finally {
      setExcludingIds((current) => {
        const next = new Set(current);
        next.delete(sectionId);
        return next;
      });
    }
  }

  async function handleContinueToDone() {
    setIsSavingPartnerAnswers(true);
    setSavingError(null);

    try {
      await Promise.all(
        importedSections.map((section) => {
          const answer = partnerAnswers[section.id];

          return fetch(`/api/sections/${section.id}/discoverability`, {
            body: JSON.stringify({ isActive: answer === "YES", partnerNeedResponse: answer }),
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          }).then((apiResponse) => {
            if (!apiResponse.ok) {
              throw new Error("Unable to save one or more section preferences.");
            }
          });
        }),
      );

      setStep(4);
    } catch (error) {
      setSavingError(getErrorMessage(error, "Unable to save your preferences. Try again."));
    } finally {
      setIsSavingPartnerAnswers(false);
    }
  }

  const allSectionsAnswered = importedSections.every((section) => partnerAnswers[section.id]);
  const lookingForCount = importedSections.filter(
    (section) => partnerAnswers[section.id] === "YES",
  ).length;

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-8">
        <div className="mb-2 flex items-center justify-between">
          <BrandMark />
          <SignOutButton className="text-sm font-semibold text-zinc-400 hover:text-brand" />
        </div>

        <div className="mt-8 mb-10 flex items-center justify-center gap-2">
          {stepLabels.map((label, index) => (
            <span
              aria-label={label}
              className={`h-2 rounded-full transition-all ${
                index === step ? "w-6 bg-brand" : index < step ? "w-2 bg-brand" : "w-2 bg-zinc-200"
              }`}
              key={label}
            />
          ))}
        </div>

        <div className="flex-1">
          {step === 0 ? (
            <ConnectStep
              existingSectionsCount={existingSectionsCount}
              macId={macId}
              onMacIdChange={setMacId}
              onPasswordChange={setPassword}
              onSubmit={handleSubmit}
              password={password}
              submitError={submitError}
              isSubmitting={isSubmitting}
            />
          ) : null}

          {step === 1 ? (
            <SyncingStep
              job={job}
              onBack={resetToConnect}
              onTryAgain={resetToConnect}
              statusError={statusError}
            />
          ) : null}

          {step === 2 ? (
            <ReviewStep
              excludeError={excludeError}
              excludingIds={excludingIds}
              isLoadingSections={isLoadingSections}
              onContinue={() => setStep(3)}
              onExclude={handleExcludeSection}
              sections={importedSections}
              sectionsError={sectionsError}
            />
          ) : null}

          {step === 3 ? (
            <ChoosePartnersStep
              allAnswered={allSectionsAnswered}
              onAnswer={(sectionId, response) =>
                setPartnerAnswers((current) => ({ ...current, [sectionId]: response }))
              }
              onContinue={handleContinueToDone}
              partnerAnswers={partnerAnswers}
              isSaving={isSavingPartnerAnswers}
              savingError={savingError}
              sections={importedSections}
            />
          ) : null}

          {step === 4 ? <DoneStep lookingForCount={lookingForCount} /> : null}
        </div>
      </div>
    </main>
  );
}

function ConnectStep({
  existingSectionsCount,
  isSubmitting,
  macId,
  onMacIdChange,
  onPasswordChange,
  onSubmit,
  password,
  submitError,
}: {
  existingSectionsCount: number;
  isSubmitting: boolean;
  macId: string;
  onMacIdChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  password: string;
  submitError: string | null;
}) {
  return (
    <div className="text-center">
      <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-brand">
        Step 1 of 5
      </p>
      <h1 className="font-display text-3xl font-bold text-zinc-950">
        Connect your Mosaic account
      </h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-6 text-zinc-600">
        Log in with your MacID and we&apos;ll pull your labs and tutorials directly from Mosaic.
        Lecture times and personal info are never stored.
      </p>

      {existingSectionsCount > 0 ? (
        <p className="mx-auto mt-5 max-w-md rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
          You already have {existingSectionsCount} imported{" "}
          {existingSectionsCount === 1 ? "section" : "sections"}. Re-running this adds newly found
          sections and never creates duplicates.
        </p>
      ) : null}

      <form
        autoComplete="off"
        className="mt-6 rounded-2xl border border-zinc-200 bg-white p-7 text-left shadow-sm"
        onSubmit={onSubmit}
      >
        <div className="mb-5 flex items-center gap-2.5 border-b border-zinc-100 pb-4">
          <span className="grid size-8 place-items-center rounded-lg bg-brand font-display text-sm font-bold text-white">
            M
          </span>
          <span className="text-sm font-bold text-zinc-950">Mosaic Student Center</span>
        </div>

        <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="mac-id">
          MacID
          <input
            autoCapitalize="none"
            autoComplete="off"
            className={inputClass}
            id="mac-id"
            name="mac-id"
            onChange={(event) => onMacIdChange(event.target.value)}
            placeholder="yourmacid"
            spellCheck={false}
            type="text"
            value={macId}
          />
        </label>

        <label
          className="mt-4 grid gap-2 text-sm font-semibold text-zinc-800"
          htmlFor="mosaic-password"
        >
          Password
          <input
            autoComplete="off"
            className={inputClass}
            id="mosaic-password"
            name="mosaic-password"
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Mosaic password"
            type="password"
            value={password}
          />
        </label>

        {submitError ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800" role="alert">
            {submitError}
          </p>
        ) : null}

        <button
          className={`${button.primary} mt-6 h-12 w-full`}
          disabled={isSubmitting || !macId.trim() || !password}
          type="submit"
        >
          {isSubmitting ? "Logging in..." : "Log in to Mosaic"}
        </button>

        <p className="mt-3.5 text-center text-xs text-zinc-400">
          Encrypted connection — your credentials are never stored.
        </p>
      </form>
    </div>
  );
}

function SyncingStep({
  job,
  onBack,
  onTryAgain,
  statusError,
}: {
  job: ImportJob | null;
  onBack: () => void;
  onTryAgain: () => void;
  statusError: string | null;
}) {
  if (job?.status === "FAILED") {
    return (
      <div className="pt-10 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-red-50 text-2xl text-red-600">
          !
        </div>
        <h1 className="mt-5 font-display text-xl font-bold text-zinc-950">
          Couldn&apos;t connect to Mosaic
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-600">
          {job.errorMessage ??
            "Mosaic didn't respond in time. This is usually temporary — check your connection and try again."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button className={`${button.secondary}`} onClick={onBack} type="button">
            Back
          </button>
          <button className={`${button.primary}`} onClick={onTryAgain} type="button">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const progress = getImportProgress(job);

  return (
    <div className="pt-12 text-center">
      <div
        aria-hidden
        className="mx-auto size-[52px] animate-spin rounded-full border-4 border-zinc-200 border-t-brand"
      />
      <h1 className="mt-6 font-display text-xl font-bold text-zinc-950">Syncing with Mosaic...</h1>
      <p className="mt-2 text-sm text-zinc-500">{progress.label}</p>

      <div className="mx-auto mt-7 max-w-xs" aria-live="polite">
        <div
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress.percent}
          className="h-2 w-full overflow-hidden rounded-full bg-zinc-200"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-brand transition-all duration-700"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <p className="mt-2.5 text-xs font-bold text-zinc-400">{progress.percent}%</p>
      </div>

      {statusError ? (
        <p className="mx-auto mt-5 max-w-sm rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {statusError}
        </p>
      ) : null}
    </div>
  );
}

function ReviewStep({
  excludeError,
  excludingIds,
  isLoadingSections,
  onContinue,
  onExclude,
  sections,
  sectionsError,
}: {
  excludeError: string | null;
  excludingIds: Set<string>;
  isLoadingSections: boolean;
  onContinue: () => void;
  onExclude: (sectionId: string) => void;
  sections: ImportedSection[];
  sectionsError: string | null;
}) {
  return (
    <div>
      <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-brand">
        Step 3 of 5
      </p>
      <h1 className="font-display text-2xl font-bold text-zinc-950">
        We found {sections.length} {sections.length === 1 ? "section" : "sections"}
      </h1>
      <p className="mt-2 text-[15px] text-zinc-600">
        Here&apos;s everything tagged as a lab or tutorial. Uncheck anything that shouldn&apos;t be
        here.
      </p>

      {sectionsError ? (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {sectionsError}
        </p>
      ) : null}
      {excludeError ? (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {excludeError}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2.5">
        {isLoadingSections ? (
          <p className="rounded border border-zinc-200 bg-white px-4 py-5 text-sm text-zinc-500">
            Loading your imported sections...
          </p>
        ) : (
          sections.map((section) => {
            const isExcluding = excludingIds.has(section.id);

            return (
              <div
                className="flex items-center gap-3.5 rounded-xl border border-zinc-200 bg-white px-4 py-3.5"
                key={section.id}
              >
                <input
                  aria-label={`Keep ${formatSectionLabel(section)}`}
                  checked={!isExcluding}
                  className="size-5 accent-brand disabled:opacity-50"
                  disabled={isExcluding}
                  onChange={(event) => {
                    if (!event.target.checked) {
                      onExclude(section.id);
                    }
                  }}
                  type="checkbox"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-zinc-950">{formatSectionLabel(section)}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {formatDay(section.dayOfWeek)} {section.startTime}–{section.endTime}
                    {section.location ? ` · ${section.location}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-600">
                  {formatComponentType(section.componentType)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <button
        className={`${button.primary} mt-6 h-12 w-full`}
        disabled={sections.length === 0}
        onClick={onContinue}
        type="button"
      >
        Looks right — continue
      </button>
    </div>
  );
}

const partnerNeedOptions: Array<{ label: string; value: PartnerNeedResponse }> = [
  { label: "Yes", value: "YES" },
  { label: "No", value: "NO" },
  { label: "Not sure", value: "UNSURE" },
];

function ChoosePartnersStep({
  allAnswered,
  isSaving,
  onAnswer,
  onContinue,
  partnerAnswers,
  savingError,
  sections,
}: {
  allAnswered: boolean;
  isSaving: boolean;
  onAnswer: (sectionId: string, response: PartnerNeedResponse) => void;
  onContinue: () => void;
  partnerAnswers: Record<string, PartnerNeedResponse>;
  savingError: string | null;
  sections: ImportedSection[];
}) {
  return (
    <div>
      <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-brand">
        Step 4 of 5
      </p>
      <h1 className="font-display text-2xl font-bold text-zinc-950">
        Does this section need a partner?
      </h1>
      <p className="mt-2 text-[15px] text-zinc-600">
        Answer for each lab or tutorial. A &quot;yes&quot; also marks you as looking for a
        partner there — you can change this anytime in Settings.
      </p>

      {savingError ? (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {savingError}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2.5">
        {sections.map((section) => {
          const answer = partnerAnswers[section.id];
          const hasHint =
            section.partnerNeedYesCount !== null && section.partnerNeedNoCount !== null;
          const totalVotes = hasHint
            ? (section.partnerNeedYesCount ?? 0) + (section.partnerNeedNoCount ?? 0)
            : 0;

          return (
            <div
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5"
              key={section.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-950">
                    {formatSectionLabel(section)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {formatDay(section.dayOfWeek)} {section.startTime}–{section.endTime}
                    {section.location ? ` · ${section.location}` : ""}
                  </p>
                  {hasHint ? (
                    <p className="mt-1 text-xs font-semibold text-brand">
                      {section.partnerNeedYesCount}/{totalVotes} students say yes
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 gap-1.5" role="group">
                  {partnerNeedOptions.map((option) => (
                    <button
                      aria-pressed={answer === option.value}
                      className={partnerNeedPillClass(answer === option.value)}
                      key={option.value}
                      onClick={() => onAnswer(section.id, option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        className={`${button.primary} mt-6 h-12 w-full`}
        disabled={isSaving || !allAnswered}
        onClick={onContinue}
        type="button"
      >
        {isSaving ? "Saving..." : allAnswered ? "Continue" : "Answer every section to continue"}
      </button>
    </div>
  );
}

function partnerNeedPillClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
    active
      ? "border-brand bg-brand text-white"
      : "border-zinc-200 bg-white text-zinc-600 hover:border-brand hover:text-brand"
  }`;
}

function DoneStep({ lookingForCount }: { lookingForCount: number }) {
  return (
    <div className="pt-10 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-gold-tint text-3xl text-gold-tint-text">
        ✓
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold text-zinc-950">You&apos;re all set</h1>
      <p className="mx-auto mt-3 max-w-sm text-[15px] leading-6 text-zinc-600">
        {lookingForCount} {lookingForCount === 1 ? "section is" : "sections are"} open for a
        partner. Head to your dashboard to see who else is looking.
      </p>
      <Link className={`${button.primary} mt-7 inline-flex px-7`} href="/dashboard">
        Go to dashboard
      </Link>
    </div>
  );
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const apiError = payload as ApiErrorResponse;

  if (apiError.issues?.length) {
    return apiError.issues.join(" ");
  }

  return apiError.error ?? fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
