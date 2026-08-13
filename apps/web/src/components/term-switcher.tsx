"use client";

import { useRouter } from "next/navigation";

import { formatTerm } from "@/lib/format";

const ONE_HUNDRED_EIGHTY_DAYS = 60 * 60 * 24 * 180;

/**
 * Semester picker for the nav. Remembers the pick in the `partnerup_term` cookie
 * (read by resolveActiveTerm) so the selection sticks across navigation instead
 * of snapping back to the most-recent term. Renders nothing for 0-1 terms.
 */
export function TermSwitcher({
  activeTerm,
  terms,
}: {
  activeTerm: string | null;
  terms: string[];
}) {
  const router = useRouter();

  if (terms.length <= 1) {
    return null;
  }

  function handleChange(term: string) {
    document.cookie = `partnerup_term=${encodeURIComponent(term)}; path=/; max-age=${ONE_HUNDRED_EIGHTY_DAYS}; samesite=lax`;
    router.refresh();
  }

  return (
    <label className="mb-4 block px-1">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-400">
        Semester
      </span>
      <select
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 focus:border-brand focus:outline-none"
        onChange={(event) => handleChange(event.target.value)}
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
