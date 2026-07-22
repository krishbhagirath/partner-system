// Shared UI class recipes so buttons, inputs, and cards stay identical across
// pages. Compose with template strings for page-specific layout tweaks only
// (width, margin, alignment) — never for colors, radii, or type.

export const button = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition-colors hover:border-brand hover:text-brand",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-800",
} as const;

export const input =
  "h-12 rounded-md border border-zinc-300 bg-white px-3 text-base font-normal text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

export const textarea =
  "resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

export const card = "rounded-xl border border-zinc-200 bg-white shadow-sm";

export const statCard = `${card} p-4`;

export const badge = {
  brand: "rounded-md bg-brand px-2 py-1 text-xs font-bold text-white",
  neutral:
    "rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-bold uppercase text-zinc-600",
  success:
    "rounded-md border border-emerald-200 bg-emerald-100 px-2 py-1 text-xs font-bold uppercase text-emerald-800",
  warning:
    "rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold uppercase text-amber-900",
  danger:
    "rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold uppercase text-red-800",
  matched: "rounded-md border border-brand/30 bg-brand/10 px-2 py-1 text-xs font-bold uppercase text-brand",
  gold: "rounded-md border border-gold/40 bg-gold-tint px-2 py-1 text-xs font-bold uppercase text-gold-tint-text",
} as const;

export const alertError =
  "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800";

// Toggle-switch recipe (track + thumb), used anywhere a boolean is flipped
// inline rather than through a checkbox (onboarding "looking for a partner",
// settings notification prefs).
export function switchTrack(on: boolean) {
  return `flex w-[42px] shrink-0 items-center rounded-full p-0.5 transition-colors ${
    on ? "bg-brand" : "bg-zinc-300"
  }`;
}

export function switchThumb(on: boolean) {
  return `size-5 rounded-full bg-white shadow transition-transform ${
    on ? "translate-x-[18px]" : "translate-x-0"
  }`;
}

const avatarColors = ["bg-brand", "bg-gold", "bg-zinc-700"] as const;

// Deterministic per-user avatar color so the same person always renders the
// same tint, without needing to store a color choice anywhere.
export function avatarColorClass(id: string) {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index)) % avatarColors.length;
  }

  return avatarColors[hash];
}
