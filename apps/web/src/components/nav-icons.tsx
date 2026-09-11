/**
 * A small consistent icon set for the sidebar.
 *
 * These replace the Unicode glyphs (▦ ⌕ ✉ ◎ ⚙) the nav used to render, which had
 * mismatched weights and baselines and resolved to different shapes per platform.
 * One stroke width, one 20x20 box, one visual weight.
 */
type IconProps = { className?: string };

const base = "size-[18px] shrink-0";

function Svg({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      className={`${base} ${className ?? ""}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 20 20"
    >
      {children}
    </svg>
  );
}

/** Dashboard: a week at a glance. */
export function IconDashboard(props: IconProps) {
  return (
    <Svg {...props}>
      <rect height="13" rx="2" width="14" x="3" y="4" />
      <path d="M3 8h14M8.5 8v9" />
    </Svg>
  );
}

/** Find partners: looking through your sections. */
export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="9" r="5.25" />
      <path d="m13 13 3.5 3.5" />
    </Svg>
  );
}

/** Requests: something waiting for an answer. */
export function IconRequests(props: IconProps) {
  return (
    <Svg {...props}>
      <rect height="11" rx="2" width="15" x="2.5" y="4.5" />
      <path d="m3 6 7 5 7-5" />
    </Svg>
  );
}

/** Matches: two people together. */
export function IconTeam(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.5" cy="7.5" r="2.75" />
      <path d="M3 16c0-2.3 2-3.75 4.5-3.75S12 13.7 12 16" />
      <path d="M13 5.5a2.75 2.75 0 0 1 0 5.4M14.2 12.6c1.7.5 2.8 1.7 2.8 3.4" />
    </Svg>
  );
}

/** Settings. */
export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3.2v1.4M10 15.4v1.4M16.8 10h-1.4M4.6 10H3.2M14.8 5.2l-1 1M6.2 13.8l-1 1M14.8 14.8l-1-1M6.2 6.2l-1-1" />
    </Svg>
  );
}

