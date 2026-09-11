import Link from "next/link";

import { formatDay, toClockTime } from "@/lib/format";

/**
 * The student's week, on the dashboard.
 *
 * This is an orientation surface, not a workspace: it answers "where do things stand
 * this week" at a glance and hands off to Find partners for the actual asking. That
 * split is deliberate — a day column is too narrow to hold a person, a note and a
 * message field, so discovery stays a list.
 *
 * It is laid out by day rather than on an hour grid. Students have a handful of labs
 * and tutorials, so an hour grid would be ~450px of mostly empty space to show four
 * things. Day columns stay compact and scale with the content.
 */

export type WeekSection = {
  courseCode: string;
  componentType: "LAB" | "TUTORIAL";
  dayOfWeek: string;
  id: string;
  sectionCode: string;
  startTime: Date;
  status: SectionStatus;
  statusLabel: string;
};

export type SectionStatus = "available" | "looking" | "partnered" | "private";

const DAY_ORDER = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

/** Gold is the confirmed team and nothing else — the same rule as the rest of the app. */
const STATUS_STYLE: Record<SectionStatus, string> = {
  available: "bg-brand-tint ring-1 ring-brand/25 hover:ring-brand/50",
  looking: "bg-surface ring-1 ring-rule-strong hover:ring-ink-soft",
  partnered: "bg-gold-tint ring-1 ring-gold/35 hover:ring-gold/60",
  private: "bg-paper ring-1 ring-rule hover:ring-rule-strong",
};

const STATUS_TEXT: Record<SectionStatus, string> = {
  available: "text-brand",
  looking: "text-ink",
  partnered: "text-gold-tint-text",
  private: "text-muted",
};

function SectionBlock({ section }: { section: WeekSection }) {
  return (
    <Link
      className={`block rounded px-2.5 py-2 transition-shadow ${STATUS_STYLE[section.status]}`}
      href={`/sections?course=${encodeURIComponent(section.courseCode)}`}
    >
      <p
        className={`truncate text-[12.5px] font-bold leading-tight ${STATUS_TEXT[section.status]}`}
      >
        {section.courseCode}
      </p>
      <p className="truncate text-[11px] leading-tight text-muted">
        {section.componentType === "LAB" ? "Lab" : "Tutorial"} {section.sectionCode}
      </p>
      <p className="tnum mt-1 truncate text-[11px] leading-tight text-muted">
        {toClockTime(section.startTime)}
      </p>
      <p className={`mt-1 truncate text-[11px] font-semibold ${STATUS_TEXT[section.status]}`}>
        {section.statusLabel}
      </p>
    </Link>
  );
}

export function WeekOverview({ sections }: { sections: WeekSection[] }) {
  if (sections.length === 0) {
    return null;
  }

  // Weekend columns only appear if something is actually scheduled there.
  const days = DAY_ORDER.filter(
    (day, index) => index < 5 || sections.some((section) => section.dayOfWeek === day),
  );

  const byDay = days.map((day) => ({
    day,
    sections: sections
      .filter((section) => section.dayOfWeek === day)
      .sort((left, right) => left.startTime.getTime() - right.startTime.getTime()),
  }));

  return (
    <section className="mt-8">
      <h2 className="font-display text-[17px] font-bold text-ink">Your week</h2>

      {/* Day columns from sm up. */}
      <div
        className="mt-3 hidden overflow-hidden rounded-lg border border-rule bg-surface sm:grid"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {byDay.map(({ day, sections: daySections }) => (
          <div className="min-w-0 border-l border-rule first:border-l-0" key={day}>
            <p className="border-b border-rule bg-paper px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wide text-muted">
              {formatDay(day).slice(0, 3)}
            </p>
            <div className="grid gap-1.5 p-1.5">
              {daySections.length === 0 ? (
                <p className="px-1 py-3 text-center text-[11px] text-muted/60">—</p>
              ) : (
                daySections.map((section) => (
                  <SectionBlock key={section.id} section={section} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Day-labelled rows on phones, where five columns would be unreadable. */}
      <ul className="mt-3 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:hidden">
        {byDay
          .filter(({ sections: daySections }) => daySections.length > 0)
          .map(({ day, sections: daySections }) => (
            <li className="bg-surface px-3 py-2.5" key={day}>
              <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
                {formatDay(day)}
              </p>
              <div className="mt-1.5 grid gap-1.5">
                {daySections.map((section) => (
                  <SectionBlock key={section.id} section={section} />
                ))}
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}
