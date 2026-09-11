// Shared class recipes so buttons, inputs, panels and type stay identical across
// pages. Compose with template strings for page-specific layout only (width,
// margin, alignment) — never for colors, radii, or type.
//
// House rules, so additions stay coherent:
//   - Structure comes from rules and spacing. Reach for `divide-*` and `border-b`
//     before reaching for a card.
//   - `panel` is for a genuine surface (a person, an overlay). Not for every block.
//   - Gold means "confirmed team" and nothing else.
//   - Two radii: rounded-md everywhere, rounded-lg for large surfaces. Pills are
//     only for true status chips.

const focusable =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export const button = {
  primary: `inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-rule-strong disabled:text-muted ${focusable}`,
  secondary: `inline-flex items-center justify-center gap-2 rounded-md border border-rule-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink-soft ${focusable}`,
  // Quiet action that still reads as a control — used for tertiary actions where a
  // bordered button would add visual noise.
  ghost: `inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-brand-tint hover:text-brand ${focusable}`,
  danger: `inline-flex items-center justify-center gap-2 rounded-md border border-rule-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-800 ${focusable}`,
} as const;

export const input =
  "h-11 w-full rounded-md border border-rule-strong bg-surface px-3 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/15";

export const textarea =
  "w-full resize-y rounded-md border border-rule-strong bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/15";

export const fieldLabel = "block text-sm font-semibold text-ink";
export const fieldHint = "text-[13px] leading-5 text-muted";

/**
 * A real surface: a person, a dialog, an overlay. Deliberately NOT the default
 * wrapper for a page section — sections are separated by rules and space.
 */
export const panel = "rounded-lg border border-rule bg-surface";

/** Section heading + optional description, used at the top of every app page. */
export const pageTitle = "font-display text-[26px] font-bold leading-tight tracking-[-0.01em] text-ink";
export const pageLede = "mt-1.5 max-w-[62ch] text-[15px] leading-6 text-muted";

/** Sub-heading inside a page. Sentence case, never tracked-out caps. */
export const sectionHeading = "font-display text-[17px] font-bold text-ink";

/**
 * Status chips. Pills are reserved for these — a chip states a state, it does not
 * decorate. `team` is the only gold in the system.
 */
export const chip = {
  neutral:
    "inline-flex items-center rounded-full border border-rule bg-paper px-2.5 py-0.5 text-xs font-semibold text-muted",
  active:
    "inline-flex items-center rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold text-brand",
  team: "inline-flex items-center rounded-full bg-gold-tint px-2.5 py-0.5 text-xs font-semibold text-gold-tint-text",
  looking:
    "inline-flex items-center rounded-full border border-brand/30 bg-surface px-2.5 py-0.5 text-xs font-semibold text-brand",
} as const;

/** Component type marker on a section row. Small, quiet, sentence case. */
export const componentMark =
  "inline-flex items-center rounded border border-rule-strong bg-paper px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-soft";

/**
 * A person inside an already-bordered list. No border of its own — a bordered card
 * inside a bordered container is the nesting this design set out to avoid.
 */
export const personCard = "flex flex-col rounded-md bg-paper p-4";

export const alertError =
  "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800";

/**
 * An empty state is an invitation to act, not a shrug. Keep the copy directive.
 */
export const emptyState =
  "rounded-md border border-dashed border-rule-strong bg-paper px-4 py-8 text-center text-sm text-muted";

// Toggle-switch recipe (track + thumb), used anywhere a boolean is flipped
// inline rather than through a checkbox.
export function switchTrack(on: boolean) {
  return `flex w-[42px] shrink-0 items-center rounded-full p-0.5 transition-colors ${
    on ? "bg-brand" : "bg-rule-strong"
  }`;
}

export function switchThumb(on: boolean) {
  return `size-5 rounded-full bg-white shadow transition-transform ${
    on ? "translate-x-[18px]" : "translate-x-0"
  }`;
}

const avatarColors = ["bg-brand", "bg-[#2F5D50]", "bg-[#4A423B]"] as const;

// Deterministic per-user avatar color so the same person always renders the
// same tint. Gold is deliberately absent — it means "confirmed team".
export function avatarColorClass(id: string) {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index)) % avatarColors.length;
  }

  return avatarColors[hash];
}
