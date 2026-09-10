"use client";

import { useRouter } from "next/navigation";

import { formatTerm } from "@/lib/format";

const ONE_HUNDRED_EIGHTY_DAYS = 60 * 60 * 24 * 180;

const selectBase =
  "rounded-md border border-zinc-200 bg-white font-semibold text-zinc-800 focus:border-brand focus:outline-none";

/**
 * Semester picker for the nav. Remembers the pick in the `partnerup_term` cookie
 * (read by resolveActiveTerm) so the selection sticks across navigation instead
 * of snapping back to the most-recent term. Renders nothing for 0-1 terms.
 *
 * Two variants because the nav is a different component at each breakpoint:
 * `sidebar` is the labelled block in the lg+ sidebar, `compact` is the pinned
 * control in the mobile nav bar. The sidebar is `lg:flex`, so without the
 * compact variant the picker is absent entirely below 1024px.
 */
export function TermSwitcher({
  activeTerm,
  terms,
  variant = "sidebar",
}: {
  activeTerm: string | null;
  terms: string[];
  variant?: "compact" | "sidebar";
}) {
  const router = useRouter();

  if (terms.length <= 1) {
    return null;
  }

  function handleChange(term: string) {
    document.cookie = `partnerup_term=${encodeURIComponent(term)}; path=/; max-age=${ONE_HUNDRED_EIGHTY_DAYS}; samesite=lax`;
    router.refresh();
  }

  const options = terms.map((term) => (
    <option key={term} value={term}>
      {formatTerm(term)}
    </option>
  ));

  if (variant === "compact") {
    return (
      <select
        aria-label="Semester"
        className={`${selectBase} shrink-0 px-2 py-1.5 text-sm`}
        onChange={(event) => handleChange(event.target.value)}
        value={activeTerm ?? ""}
      >
        {options}
      </select>
    );
  }

  return (
    <label className="mb-4 block px-1">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-400">
        Semester
      </span>
      <select
        className={`${selectBase} w-full px-3 py-2 text-sm`}
        onChange={(event) => handleChange(event.target.value)}
        value={activeTerm ?? ""}
      >
        {options}
      </select>
    </label>
  );
}
