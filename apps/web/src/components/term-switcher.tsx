"use client";

import { usePathname, useRouter } from "next/navigation";

import { formatTerm } from "@/lib/format";

/**
 * Semester picker for the nav. Sets `?term=<term>` on the current page, which the
 * server pages read to scope everything (sections, discovery, requests, matches)
 * to that term. Renders nothing when the user has 0-1 terms — no point switching.
 */
export function TermSwitcher({
  activeTerm,
  terms,
}: {
  activeTerm: string | null;
  terms: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  if (terms.length <= 1) {
    return null;
  }

  return (
    <label className="mb-4 block px-1">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-400">
        Semester
      </span>
      <select
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 focus:border-brand focus:outline-none"
        onChange={(event) =>
          router.push(`${pathname}?term=${encodeURIComponent(event.target.value)}`)
        }
        value={activeTerm ?? ""}
      >
        {terms.map((term) => (
          <option key={term} value={term}>
            {formatTerm(term)}
          </option>
        ))}
      </select>
    </label>
  );
}
