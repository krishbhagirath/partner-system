"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { SignOutButton } from "@/components/sign-out-button";

type ImportJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";

type ImportJob = {
  createdAt: string;
  errorMessage: string | null;
  finishedAt: string | null;
  id: string;
  sectionsCount: number;
  startedAt: string | null;
  status: ImportJobStatus;
  updatedAt: string;
};

type ImportedSection = {
  componentType: "LAB" | "TUTORIAL";
  courseCode: string;
  createdAt: string;
  dayOfWeek: string;
  endTime: string;
  id: string;
  importJobId: string | null;
  location: string;
  rawTitle: string | null;
  sectionCode: string;
  startTime: string;
  term: string;
  updatedAt: string;
};

type CourseSectionGroup = {
  courseCode: string;
  sections: ImportedSection[];
};

type StartImportResponse = {
  jobId: string;
};

type ImportStatusResponse = {
  job: ImportJob;
};

type ImportSectionsResponse = {
  sections: ImportedSection[];
};

type ApiErrorResponse = {
  error?: string;
  issues?: string[];
};

const terminalStatuses = new Set<ImportJobStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

const statusCopy: Record<ImportJobStatus, { label: string; tone: string; description: string }> = {
  CANCELED: {
    description: "The import was canceled before it completed.",
    label: "Canceled",
    tone: "bg-zinc-100 text-zinc-700 border-zinc-300",
  },
  FAILED: {
    description: "The import could not finish. Check the message below and try again.",
    label: "Import failed",
    tone: "bg-red-50 text-red-800 border-red-200",
  },
  QUEUED: {
    description: "The request was accepted and is waiting for the scraper worker.",
    label: "Queued",
    tone: "bg-zinc-100 text-zinc-700 border-zinc-300",
  },
  RUNNING: {
    description: "The scraper worker is importing your lab and tutorial sections.",
    label: "Importing",
    tone: "bg-amber-50 text-amber-900 border-amber-200",
  },
  SUCCEEDED: {
    description: "Your lab and tutorial sections were imported successfully.",
    label: "Complete",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
};

export function ImportFromMosaic() {
  const [macId, setMacId] = useState("");
  const [password, setPassword] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [sections, setSections] = useState<ImportedSection[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSections, setIsLoadingSections] = useState(false);

  const isImportActive = job ? !terminalStatuses.has(job.status) : Boolean(jobId);
  const canSubmit =
    macId.trim().length > 0 && password.length > 0 && !isSubmitting && !isImportActive;
  const currentStatus = job?.status ?? (jobId ? "QUEUED" : null);

  const importedSections = useMemo(() => {
    if (!jobId) {
      return [];
    }

    return sections.filter((section) => section.importJobId === jobId);
  }, [jobId, sections]);

  const groupedSections = useMemo<CourseSectionGroup[]>(() => {
    const groups = new Map<string, ImportedSection[]>();

    for (const section of importedSections) {
      const courseSections = groups.get(section.courseCode) ?? [];
      courseSections.push(section);
      groups.set(section.courseCode, courseSections);
    }

    return [...groups.entries()].map(([courseCode, courseSections]) => ({
      courseCode,
      sections: courseSections,
    }));
  }, [importedSections]);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let isCurrent = true;

    async function pollStatus() {
      try {
        const response = await fetch(`/api/import/status/${jobId}`, {
          cache: "no-store",
        });
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

      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
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
        const response = await fetch("/api/import/sections", {
          cache: "no-store",
        });
        const payload = (await readJson(response)) as
          | ImportSectionsResponse
          | ApiErrorResponse
          | null;

        if (!response.ok || !payload || !("sections" in payload)) {
          throw new Error(getApiErrorMessage(payload, "Unable to load imported sections."));
        }

        if (isCurrent) {
          setSections(payload.sections);
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
    setSectionsError(null);
    setJob(null);
    setJobId(null);
    setSections([]);
    setPassword("");

    try {
      const response = await fetch("/api/import/start", {
        body: JSON.stringify({
          macId: trimmedMacId,
          password: passwordForRequest,
        }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await readJson(response)) as StartImportResponse | ApiErrorResponse | null;

      if (!response.ok || !payload || !("jobId" in payload)) {
        throw new Error(getApiErrorMessage(payload, "Unable to start import."));
      }

      setJobId(payload.jobId);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Unable to start import."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-10">
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
              href="/sections"
            >
              Sections
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

        <div className="grid gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-14">
          <section className="max-w-2xl">
            <p className="mb-4 inline-flex rounded bg-[#FDBF57] px-3 py-1 text-sm font-bold text-zinc-950">
              Mosaic schedule import
            </p>
            <h1 className="text-4xl font-black leading-tight text-zinc-950 sm:text-5xl">
              Import from Mosaic
            </h1>
            <p className="mt-5 text-lg leading-8 text-zinc-700">
              Use your MacID once to pull your current schedule into LabPartner. Your password is
              sent only to the scraper worker for this import and is not stored by the app.
            </p>
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <p className="font-bold">Only labs and tutorials are kept.</p>
              <p className="mt-1">
                Lectures and other Mosaic components are filtered out before matching.
              </p>
            </div>
          </section>

          <form
            autoComplete="off"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
            onSubmit={handleSubmit}
          >
            <div>
              <h2 className="text-2xl font-bold">Mosaic credentials</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                This starts a one-time import for your signed-in account.
              </p>
            </div>

            <div className="mt-6 grid gap-5">
              <label className="grid gap-2 text-sm font-semibold text-zinc-800" htmlFor="mac-id">
                MacID username
                <input
                  autoCapitalize="none"
                  autoComplete="off"
                  className="h-12 rounded border border-zinc-300 bg-white px-3 text-base font-normal text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-[#7A003C] focus:ring-2 focus:ring-[#7A003C]/20"
                  id="mac-id"
                  name="mac-id"
                  onChange={(event) => setMacId(event.target.value)}
                  placeholder="yourmacid"
                  spellCheck={false}
                  type="text"
                  value={macId}
                />
              </label>

              <label
                className="grid gap-2 text-sm font-semibold text-zinc-800"
                htmlFor="mosaic-password"
              >
                Password
                <input
                  autoComplete="off"
                  className="h-12 rounded border border-zinc-300 bg-white px-3 text-base font-normal text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-[#7A003C] focus:ring-2 focus:ring-[#7A003C]/20"
                  id="mosaic-password"
                  name="mosaic-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mosaic password"
                  type="password"
                  value={password}
                />
              </label>
            </div>

            {submitError ? (
              <p className="mt-5 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                {submitError}
              </p>
            ) : null}

            <button
              className="mt-6 h-12 w-full rounded bg-[#7A003C] px-5 text-sm font-bold text-white transition hover:bg-[#5f0030] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
              disabled={!canSubmit}
              type="submit"
            >
              {isSubmitting
                ? "Starting import..."
                : isImportActive
                  ? "Import in progress"
                  : "Start import"}
            </button>
          </form>
        </div>

        <div className="grid gap-6 pb-10 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Live status</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Status updates refresh every 3 seconds after the import starts.
                </p>
              </div>
              {currentStatus ? (
                <span
                  className={`rounded border px-3 py-1 text-xs font-bold uppercase ${statusCopy[currentStatus].tone}`}
                >
                  {statusCopy[currentStatus].label}
                </span>
              ) : null}
            </div>

            <div className="mt-6" aria-live="polite">
              {!currentStatus ? (
                <p className="rounded border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                  Start an import to see the job status here.
                </p>
              ) : (
                <div className="grid gap-4">
                  <div>
                    <p className="text-sm font-semibold text-zinc-500">Job ID</p>
                    <p className="mt-1 break-all font-mono text-sm text-zinc-900">{jobId}</p>
                  </div>
                  <p className="text-sm leading-6 text-zinc-700">
                    {statusCopy[currentStatus].description}
                  </p>
                  {job ? (
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
                        <dt className="font-semibold text-zinc-500">Kept sections</dt>
                        <dd className="mt-1 text-2xl font-black text-zinc-950">
                          {job.sectionsCount}
                        </dd>
                      </div>
                      <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
                        <dt className="font-semibold text-zinc-500">Updated</dt>
                        <dd className="mt-2 text-sm font-bold text-zinc-900">
                          {formatTimestamp(job.updatedAt)}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  {statusError ? (
                    <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                      {statusError}
                    </p>
                  ) : null}
                  {job?.status === "FAILED" ? (
                    <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                      {job.errorMessage ?? "The import failed without a detailed message."}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Imported sections</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Completed imports appear grouped by course.
                </p>
              </div>
              {job?.status === "SUCCEEDED" ? (
                <span className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-800">
                  Success
                </span>
              ) : null}
            </div>

            <div className="mt-6" aria-live="polite">
              {job?.status !== "SUCCEEDED" ? (
                <p className="rounded border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                  The kept lab and tutorial sections will show here after a successful import.
                </p>
              ) : sectionsError ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                  {sectionsError}
                </p>
              ) : isLoadingSections ? (
                <p className="rounded border border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                  Loading imported sections...
                </p>
              ) : groupedSections.length === 0 ? (
                <p className="rounded border border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                  The import finished, but no new lab or tutorial sections were saved for this job.
                </p>
              ) : (
                <div className="grid gap-4">
                  {groupedSections.map((group) => (
                    <article
                      className="rounded-lg border border-zinc-200 bg-white"
                      key={group.courseCode}
                    >
                      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
                        <h3 className="text-lg font-black text-zinc-950">{group.courseCode}</h3>
                        <span className="text-sm font-semibold text-zinc-500">
                          {group.sections.length}{" "}
                          {group.sections.length === 1 ? "section" : "sections"}
                        </span>
                      </header>
                      <div className="divide-y divide-zinc-200">
                        {group.sections.map((section) => (
                          <div
                            className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto]"
                            key={section.id}
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded bg-[#7A003C] px-2 py-1 text-xs font-bold text-white">
                                  {formatComponentType(section.componentType)}
                                </span>
                                <p className="font-bold text-zinc-950">{section.sectionCode}</p>
                                <p className="text-sm font-semibold text-zinc-500">
                                  {section.term}
                                </p>
                              </div>
                              <p className="mt-2 text-sm text-zinc-600">
                                {formatDay(section.dayOfWeek)} from {section.startTime} to{" "}
                                {section.endTime}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-zinc-700 sm:text-right">
                              {section.location || "Location TBA"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
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

function formatComponentType(componentType: ImportedSection["componentType"]) {
  return componentType === "LAB" ? "Lab" : "Tutorial";
}

function formatDay(dayOfWeek: string) {
  return dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase();
}

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}
