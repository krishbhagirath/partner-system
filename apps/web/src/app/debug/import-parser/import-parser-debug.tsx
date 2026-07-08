"use client";

import { FormEvent, useState } from "react";

type ParsedSection = {
  term: string;
  courseCode: string;
  componentType: string;
  sectionCode: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string;
  rawTitle: string | null;
};

type ParseResponse =
  | {
      sections: ParsedSection[];
    }
  | {
      error: string;
      issues?: string[];
    };

const columns: Array<{ key: keyof ParsedSection; label: string }> = [
  { key: "term", label: "term" },
  { key: "courseCode", label: "courseCode" },
  { key: "componentType", label: "componentType" },
  { key: "sectionCode", label: "sectionCode" },
  { key: "dayOfWeek", label: "dayOfWeek" },
  { key: "startTime", label: "startTime" },
  { key: "endTime", label: "endTime" },
  { key: "location", label: "location" },
  { key: "rawTitle", label: "rawTitle" },
];

export function ImportParserDebug() {
  const [html, setHtml] = useState("");
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [hasParsed, setHasParsed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsParsing(true);
    setError(null);
    setIssues([]);
    setHasParsed(false);

    try {
      const response = await fetch("/api/debug/import-parser", {
        body: JSON.stringify({ html }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({
        error: "Unexpected parser response.",
      }))) as ParseResponse;

      if (!response.ok || "error" in payload) {
        setSections([]);
        setError("error" in payload ? payload.error : "Parser request failed.");
        setIssues("issues" in payload && payload.issues ? payload.issues : []);
        return;
      }

      setSections(payload.sections);
      setHasParsed(true);
    } catch {
      setSections([]);
      setError("The parser request could not be completed.");
      setIssues(["Confirm the development server is running and try again."]);
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="text-sm font-bold text-zinc-800" htmlFor="debug-import-html">
          Raw HTML
        </label>
        <textarea
          className="min-h-[520px] w-full resize-y border border-zinc-300 bg-white p-4 font-mono text-sm leading-6 text-zinc-950 shadow-sm outline-none transition focus:border-[#7A003C] focus:ring-2 focus:ring-[#FDBF57]"
          id="debug-import-html"
          onChange={(event) => setHtml(event.target.value)}
          placeholder='<table id="WEEKLY_SCHED_HTMLAREA">...</table>'
          spellCheck={false}
          value={html}
        />
        <button
          className="inline-flex min-h-11 items-center justify-center bg-[#7A003C] px-5 text-sm font-bold text-white transition hover:bg-[#5f002f] disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={isParsing}
          type="submit"
        >
          {isParsing ? "Parsing" : "Parse HTML"}
        </button>
      </form>

      <section className="min-w-0">
        {error ? (
          <div className="mb-4 border border-red-300 bg-red-50 p-4 text-red-950">
            <h2 className="text-lg font-black">Parser error</h2>
            <p className="mt-2 text-sm font-semibold">{error}</p>
            {issues.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3">
            <h2 className="text-lg font-black">Parsed Results</h2>
            <span className="text-sm font-bold text-zinc-600">{sections.length} rows</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-zinc-950 text-white">
                <tr>
                  {columns.map((column) => (
                    <th className="whitespace-nowrap px-3 py-3 font-bold" key={column.key}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {sections.map((section, index) => (
                  <tr
                    className="align-top"
                    key={`${section.courseCode}-${section.sectionCode}-${index}`}
                  >
                    {columns.map((column) => (
                      <td className="max-w-[280px] px-3 py-3 text-zinc-800" key={column.key}>
                        <span className="break-words font-mono text-xs">
                          {section[column.key] ?? "null"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasParsed && sections.length === 0 ? (
            <div className="border-t border-zinc-200 px-4 py-6 text-sm font-semibold text-zinc-600">
              No lab or tutorial rows were parsed.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
