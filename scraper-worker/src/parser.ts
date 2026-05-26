import { load } from "cheerio";

export type ParsedComponentType = "LAB" | "TUTORIAL";

export type ParsedDayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type ParsedScheduleSection = {
  term: string;
  courseCode: string;
  componentType: ParsedComponentType;
  sectionCode: string;
  dayOfWeek: ParsedDayOfWeek;
  startTime: Date;
  endTime: Date;
  location: string;
  rawTitle: string | null;
};

export type ParseScheduleOptions = {
  term: string;
};

const dayOrder: ParsedDayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const courseCodePattern = /\b([A-Z]{2,}(?:\s+[A-Z]{2,})?\s+\d[A-Z][A-Z0-9]{1,}(?:\s*[A-Z])?)\b/i;
const componentPattern = /\b(Tutorial|TUT|Laboratory|Lab|LAB)\b/i;
const timeRangePattern =
  /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A\.M\.|P\.M\.)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A\.M\.|P\.M\.)\b/i;

export function parseScheduleHtml(html: string, options: ParseScheduleOptions): ParsedScheduleSection[] {
  const $ = load(wrapHtml(html));
  const roots = $("table#WEEKLY_SCHED_HTMLAREA").length > 0 ? $("table#WEEKLY_SCHED_HTMLAREA") : $("body");
  const parsedSections: ParsedScheduleSection[] = [];

  roots.each((_, root) => {
    const rows = $(root).find("tr");

    if (rows.length === 0) {
      $(root)
        .find("td[class*='PSLEVEL3GRID']")
        .each((cellIndex, cell) => {
          parsedSections.push(...parseCell($.html(cell), "", cellIndex, options));
        });
      return;
    }

    rows.each((_, row) => {
      const rowHtml = $.html(row);
      const rowText = htmlToText(rowHtml);
      const gridCells = $(row).find("td[class*='PSLEVEL3GRID']");

      gridCells.each((cellIndex, cell) => {
        const cellHtml = $.html(cell);
        parsedSections.push(...parseCell(cellHtml, rowText, cellIndex, options));
      });
    });
  });

  return dedupeParsedSections(parsedSections);
}

function parseCell(
  cellHtml: string,
  rowText: string,
  cellIndex: number,
  options: ParseScheduleOptions,
): ParsedScheduleSection[] {
  const cellText = htmlToText(cellHtml);

  if (!cellText) {
    return [];
  }

  const sections: ParsedScheduleSection[] = [];

  for (const entry of splitPotentialEntries(cellText)) {
    const componentType = parseComponentType(entry);

    if (!componentType) {
      continue;
    }

    const courseCode = parseCourseCode(entry);
    const sectionCode = parseSectionCode(entry, componentType);
    const timeRange = parseTimeRange(entry) ?? parseTimeRange(rowText);

    if (!courseCode || !sectionCode || !timeRange) {
      continue;
    }

    const days = parseDays(entry, timeRange.sourceIndex);
    const fallbackDay = dayOrder[cellIndex % dayOrder.length];
    const daysToSave = days.length > 0 ? days : fallbackDay ? [fallbackDay] : [];

    for (const dayOfWeek of daysToSave) {
      sections.push({
        componentType,
        courseCode,
        dayOfWeek,
        endTime: timeRange.endTime,
        location: parseLocation(entry),
        rawTitle: parseRawTitle(entry, courseCode),
        sectionCode,
        startTime: timeRange.startTime,
        term: options.term,
      });
    }
  }

  return sections;
}

function splitPotentialEntries(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const entries: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const startsNewEntry = courseCodePattern.test(line) && current.length > 0;

    if (startsNewEntry) {
      entries.push(current.join("\n"));
      current = [];
    }

    current.push(line);
  }

  if (current.length > 0) {
    entries.push(current.join("\n"));
  }

  return entries.length > 0 ? entries : [text];
}

function parseComponentType(text: string): ParsedComponentType | null {
  const match = text.match(componentPattern);

  if (!match) {
    return null;
  }

  const normalized = match[1]?.toUpperCase() ?? "";

  if (normalized === "TUTORIAL" || normalized === "TUT") {
    return "TUTORIAL";
  }

  return "LAB";
}

function parseCourseCode(text: string) {
  const match = text.match(courseCodePattern);

  if (!match?.[1]) {
    return null;
  }

  return match[1].replace(/\s+/g, " ").trim().toUpperCase();
}

function parseSectionCode(text: string, componentType: ParsedComponentType) {
  const componentLabelPattern =
    componentType === "TUTORIAL"
      ? /\b(?:Tutorial|TUT)\s*[:\-]?\s*([A-Z]?\d{1,3}[A-Z]?|[A-Z]\d{1,3})\b/i
      : /\b(?:Laboratory|Lab|LAB)\s*[:\-]?\s*([A-Z]?\d{1,3}[A-Z]?|[A-Z]\d{1,3})\b/i;
  const labeledMatch = text.match(componentLabelPattern);

  if (labeledMatch?.[1]) {
    return `${componentType === "TUTORIAL" ? "TUT" : "LAB"} ${labeledMatch[1].toUpperCase()}`;
  }

  const compactMatch = text.match(componentType === "TUTORIAL" ? /\b(T[A-Z]?\d{1,3}[A-Z]?)\b/i : /\b(L[A-Z]?\d{1,3}[A-Z]?)\b/i);

  if (compactMatch?.[1]) {
    return `${componentType === "TUTORIAL" ? "TUT" : "LAB"} ${compactMatch[1].toUpperCase()}`;
  }

  return null;
}

type ParsedTimeRange = {
  startTime: Date;
  endTime: Date;
  sourceIndex: number;
};

function parseTimeRange(text: string): ParsedTimeRange | null {
  const match = text.match(timeRangePattern);

  if (!match?.[1] || !match[4] || !match[6]) {
    return null;
  }

  const startHour = Number.parseInt(match[1], 10);
  const startMinute = match[2] ? Number.parseInt(match[2], 10) : 0;
  const endHour = Number.parseInt(match[4], 10);
  const endMinute = match[5] ? Number.parseInt(match[5], 10) : 0;
  const endMeridiem = normalizeMeridiem(match[6]);

  if (!endMeridiem) {
    return null;
  }

  const startMeridiem = normalizeMeridiem(match[3]) ?? inferStartMeridiem(startHour, endHour, endMeridiem);

  return {
    endTime: timeToDate(endHour, endMinute, endMeridiem),
    sourceIndex: match.index ?? 0,
    startTime: timeToDate(startHour, startMinute, startMeridiem),
  };
}

function inferStartMeridiem(startHour: number, endHour: number, endMeridiem: "AM" | "PM") {
  if (endMeridiem === "PM" && startHour > endHour) {
    return "AM";
  }

  return endMeridiem;
}

function normalizeMeridiem(value: string | undefined) {
  if (!value) {
    return null;
  }

  return value.toUpperCase().replace(/\./g, "") as "AM" | "PM";
}

function timeToDate(hour: number, minute: number, meridiem: "AM" | "PM") {
  let normalizedHour = hour % 12;

  if (meridiem === "PM") {
    normalizedHour += 12;
  }

  return new Date(Date.UTC(1970, 0, 1, normalizedHour, minute, 0));
}

function parseDays(text: string, timeIndex: number): ParsedDayOfWeek[] {
  const days = new Set<ParsedDayOfWeek>();
  const prefix = text.slice(Math.max(0, timeIndex - 24), timeIndex);

  collectNamedDays(prefix, days);
  collectCompactDays(prefix, days);

  if (days.size === 0) {
    collectNamedDays(text, days);
  }

  return [...days];
}

function collectNamedDays(text: string, days: Set<ParsedDayOfWeek>) {
  const patterns: Array<[ParsedDayOfWeek, RegExp]> = [
    ["MONDAY", /\b(Monday|Mon|Mo)\b/i],
    ["TUESDAY", /\b(Tuesday|Tue|Tues|Tu)\b/i],
    ["WEDNESDAY", /\b(Wednesday|Wed|We)\b/i],
    ["THURSDAY", /\b(Thursday|Thu|Thur|Thurs|Th)\b/i],
    ["FRIDAY", /\b(Friday|Fri|Fr)\b/i],
    ["SATURDAY", /\b(Saturday|Sat|Sa)\b/i],
    ["SUNDAY", /\b(Sunday|Sun|Su)\b/i],
  ];

  for (const [day, pattern] of patterns) {
    if (pattern.test(text)) {
      days.add(day);
    }
  }
}

function collectCompactDays(text: string, days: Set<ParsedDayOfWeek>) {
  const compactMatch = text.match(/\b((?:Mo|Tu|We|Th|Fr|Sa|Su){1,7})\b/i);
  const compact = compactMatch?.[1];

  if (!compact) {
    return;
  }

  const compactDayMap: Record<string, ParsedDayOfWeek> = {
    Fr: "FRIDAY",
    Mo: "MONDAY",
    Sa: "SATURDAY",
    Su: "SUNDAY",
    Th: "THURSDAY",
    Tu: "TUESDAY",
    We: "WEDNESDAY",
  };

  for (const match of compact.match(/Mo|Tu|We|Th|Fr|Sa|Su/gi) ?? []) {
    const normalized = `${match[0]?.toUpperCase()}${match.slice(1).toLowerCase()}`;
    const day = compactDayMap[normalized];

    if (day) {
      days.add(day);
    }
  }
}

function parseLocation(text: string) {
  const labeledLocation = text.match(/\b(?:Location|Room)\s*:?\s*([^\n]+)/i);

  if (labeledLocation?.[1]) {
    return cleanupLocation(labeledLocation[1]);
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const locationLine = lines.find((line) => {
    if (courseCodePattern.test(line) || componentPattern.test(line) || timeRangePattern.test(line)) {
      return false;
    }

    return /\b([A-Z]{2,}\s*\d{1,4}[A-Z]?|TBA|ONLINE|VIRTUAL)\b/i.test(line);
  });

  return locationLine ? cleanupLocation(locationLine) : "TBA";
}

function cleanupLocation(location: string) {
  return location
    .replace(/\bInstructor\b.*$/i, "")
    .replace(/\bMeeting\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRawTitle(text: string, courseCode: string) {
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.toUpperCase().includes(courseCode));

  return line ?? null;
}

function dedupeParsedSections(sections: ParsedScheduleSection[]) {
  const unique = new Map<string, ParsedScheduleSection>();

  for (const section of sections) {
    const key = [
      section.term,
      section.courseCode,
      section.componentType,
      section.sectionCode,
      section.dayOfWeek,
      section.startTime.toISOString(),
      section.endTime.toISOString(),
    ].join("::");

    if (!unique.has(key)) {
      unique.set(key, section);
    }
  }

  return [...unique.values()];
}

function wrapHtml(html: string) {
  return /<html[\s>]/i.test(html) ? html : `<html><body>${html}</body></html>`;
}

function htmlToText(html: string) {
  const htmlWithBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|p|li|tr|td|th)>/gi, "\n");
  const $ = load(`<html><body>${htmlWithBreaks}</body></html>`);

  return $("body")
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
