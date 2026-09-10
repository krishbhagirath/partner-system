import type { ComponentType, DayOfWeek } from "@/generated/prisma/client";

/**
 * Section identity, extracted from lab-partner.ts so it can be imported outside a
 * React Server Component. lab-partner.ts starts with `import "server-only"`, which
 * throws in a plain Node/tsx process — and the teams backfill script has to compute
 * exactly the same key the app computes, so it cannot live behind that import.
 *
 * Section rows are per-user: every student in the same lab owns a separate row, and
 * two rows are "the same section" only by value-equality on the seven fields below
 * (deliberately excluding userId, location, rawTitle and id).
 */
export type SectionDiscoveryKeyInput = {
  term: string;
  courseCode: string;
  componentType: ComponentType;
  sectionCode: string;
  dayOfWeek: DayOfWeek;
  startTime: Date;
  endTime: Date;
};

export function buildSectionIdentityFilter(section: SectionDiscoveryKeyInput) {
  return {
    componentType: section.componentType,
    courseCode: section.courseCode,
    dayOfWeek: section.dayOfWeek,
    endTime: section.endTime,
    sectionCode: section.sectionCode,
    startTime: section.startTime,
    term: section.term,
  };
}

/**
 * PERSISTED FORMAT — do not change casually.
 *
 * This string is stored in `Team.sectionKey` and `TeamMember.sectionKey`, and the
 * unique index on `TeamMember(userId, sectionKey)` is what enforces "one team per
 * student per section". Changing the separator, the field order, or the time
 * rendering silently orphans every existing team rather than raising an error, so
 * any change here needs a data migration.
 *
 * `startTime`/`endTime` come from `@db.Time(0)` columns, so `.toISOString()` renders
 * them as `1970-01-01T14:30:00.000Z`. The `(0)` precision matters: without it,
 * microseconds would make stored and recomputed keys disagree.
 */
export function buildSectionDiscoveryKey(section: SectionDiscoveryKeyInput) {
  return [
    section.term,
    section.courseCode,
    section.componentType,
    section.sectionCode,
    section.dayOfWeek,
    section.startTime.toISOString(),
    section.endTime.toISOString(),
  ].join("::");
}
