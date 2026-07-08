import {
  parseWeeklyScheduleHtml,
  type ParsedScheduleSection,
} from "../../../../scraper-worker/src/parser";

export type DebugParsedScheduleSection = {
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

export function parseWeeklyScheduleHtmlForDebug(
  html: string,
  term = "DEBUG",
): DebugParsedScheduleSection[] {
  return parseWeeklyScheduleHtml(html, { term }).map(serializeSection);
}

function serializeSection(section: ParsedScheduleSection): DebugParsedScheduleSection {
  return {
    componentType: section.componentType,
    courseCode: section.courseCode,
    dayOfWeek: section.dayOfWeek,
    endTime: toClockTime(section.endTime),
    location: section.location,
    rawTitle: section.rawTitle,
    sectionCode: section.sectionCode,
    startTime: toClockTime(section.startTime),
    term: section.term,
  };
}

function toClockTime(date: Date) {
  return date.toISOString().slice(11, 16);
}
