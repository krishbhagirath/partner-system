import { load } from "cheerio";

type CheerioApi = ReturnType<typeof load>;
type CheerioInput = Parameters<CheerioApi>[0];

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
const mosaicTimeRangePattern =
  /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A\.M\.|P\.M\.)?\s*(?:-|\u2013|\u2014|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A\.M\.|P\.M\.)?\b/i;
const timeRangePattern =
  /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A\.M\.|P\.M\.)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A\.M\.|P\.M\.)\b/i;

export function parseScheduleHtml(
  html: string,
  options: ParseScheduleOptions,
): ParsedScheduleSection[] {
  const $ = load(wrapHtml(html));
  const roots =
    $("table#WEEKLY_SCHED_HTMLAREA").length > 0 ? $("table#WEEKLY_SCHED_HTMLAREA") : $("body");
  const parsedSections: ParsedScheduleSection[] = [];

  roots.each((_, root) => {
    const rows = $(root).find("tr");

    if (rows.length === 0) {
      $(root)
        .find("td[class*='PSLEVEL3GRID']")
        .each((cellIndex, cell) => {
          parsedSections.push(...parseCell($.html(cell), "", dayOrder[cellIndex] ?? null, options));
        });
      return;
    }

    parsedSections.push(...parseTableRows($, root, options));
  });

  return dedupeParsedSections(parsedSections);
}

export function parseWeeklyScheduleHtml(
  html: string,
  options: ParseScheduleOptions,
): ParsedScheduleSection[] {
  return parseScheduleHtml(html, options);
}

function parseTableRows($: CheerioApi, table: CheerioInput, options: ParseScheduleOptions) {
  const parsedSections: ParsedScheduleSection[] = [];
  const dayByColumn = buildDayColumnMap($, table);
  const rowspanCarry = new Map<number, number>();

  $(table)
    .find("tr")
    .each((_, row) => {
      const rowText = htmlToText($.html(row));
      const newlyCarriedColumns = new Set<number>();
      let logicalColumn = 0;

      $(row)
        .children("th,td")
        .each((_, cell) => {
          while ((rowspanCarry.get(logicalColumn) ?? 0) > 0) {
            logicalColumn += 1;
          }

          const colspan = parsePositiveInteger($(cell).attr("colspan")) ?? 1;
          const rowspan = parsePositiveInteger($(cell).attr("rowspan")) ?? 1;

          if (cell.tagName.toLowerCase() === "td") {
            const fallbackDay =
              dayByColumn.get(logicalColumn) ??
              (dayByColumn.size === 0 ? (dayOrder[Math.max(0, logicalColumn - 1)] ?? null) : null);
            parsedSections.push(...parseCell($.html(cell), rowText, fallbackDay, options));
          }

          if (rowspan > 1) {
            for (let offset = 0; offset < colspan; offset += 1) {
              const spannedColumn = logicalColumn + offset;
              const currentCarry = rowspanCarry.get(spannedColumn) ?? 0;
              rowspanCarry.set(spannedColumn, Math.max(currentCarry, rowspan - 1));
              newlyCarriedColumns.add(spannedColumn);
            }
          }

          logicalColumn += colspan;
        });

      decrementRowspanCarry(rowspanCarry, newlyCarriedColumns);
    });

  return parsedSections;
}

function buildDayColumnMap($: CheerioApi, table: CheerioInput) {
  const dayByColumn = new Map<number, ParsedDayOfWeek>();

  $(table)
    .find("tr")
    .each((_, row) => {
      const rowCells = $(row).children("th,td");
      const rowDays: Array<[number, ParsedDayOfWeek]> = [];
      let logicalColumn = 0;

      rowCells.each((_, cell) => {
        const colspan = parsePositiveInteger($(cell).attr("colspan")) ?? 1;
        const day = parseDayLabel(htmlToText($.html(cell)));

        if (day) {
          rowDays.push([logicalColumn, day]);
        }

        logicalColumn += colspan;
      });

      if (rowDays.length < 2 && $(row).children("th").length === 0) {
        return;
      }

      for (const [column, day] of rowDays) {
        dayByColumn.set(column, day);
      }
    });

  return dayByColumn;
}

function parsePositiveInteger(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function decrementRowspanCarry(
  rowspanCarry: Map<number, number>,
  newlyCarriedColumns: Set<number>,
) {
  for (const [column, remainingRows] of rowspanCarry) {
    if (newlyCarriedColumns.has(column)) {
      continue;
    }

    if (remainingRows <= 1) {
      rowspanCarry.delete(column);
      continue;
    }

    rowspanCarry.set(column, remainingRows - 1);
  }
}

function parseCell(
  cellHtml: string | null,
  rowText: string,
  fallbackDay: ParsedDayOfWeek | null,
  options: ParseScheduleOptions,
): ParsedScheduleSection[] {
  if (!cellHtml) {
    return [];
  }

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
    const location = timeRange ? parseLocation(entry, timeRange) : null;

    if (!courseCode || !sectionCode || !timeRange || !location) {
      continue;
    }

    const days = parseDays(entry, timeRange.sourceIndex);
    const daysToSave = days.length > 0 ? days : fallbackDay ? [fallbackDay] : [];

    for (const dayOfWeek of daysToSave) {
      sections.push({
        componentType,
        courseCode,
        dayOfWeek,
        endTime: timeRange.endTime,
        location,
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
  const mosaicTitleMatch = text.match(
    /\b[A-Z]{2,}(?:\s+[A-Z]{2,})?\s+\d[A-Z][A-Z0-9]{1,}(?:\s*[A-Z])?\s*-\s*([A-Z]{1,4}\d{0,3}[A-Z]?)\s+(Lecture|Tutorial|Lab|Laboratory|Core)\b/i,
  );

  if (mosaicTitleMatch?.[1]) {
    return normalizeSectionCode(mosaicTitleMatch[1]);
  }

  const componentLabelPattern =
    componentType === "TUTORIAL"
      ? /\b(?:Tutorial|TUT)\s*[:\-]?\s*([A-Z]?\d{1,3}[A-Z]?|[A-Z]\d{1,3})\b/i
      : /\b(?:Laboratory|Lab|LAB)\s*[:\-]?\s*([A-Z]?\d{1,3}[A-Z]?|[A-Z]\d{1,3})\b/i;
  const labeledMatch = text.match(componentLabelPattern);

  if (labeledMatch?.[1]) {
    return normalizeSectionCode(labeledMatch[1]);
  }

  const compactMatch = text.match(
    componentType === "TUTORIAL" ? /\b(T[A-Z]?\d{1,3}[A-Z]?)\b/i : /\b(L[A-Z]?\d{1,3}[A-Z]?)\b/i,
  );

  if (compactMatch?.[1]) {
    return normalizeSectionCode(compactMatch[1]);
  }

  return null;
}

function normalizeSectionCode(sectionCode: string) {
  return sectionCode.replace(/\s+/g, " ").trim().toUpperCase();
}

type ParsedTimeRange = {
  startTime: Date;
  endTime: Date;
  sourceIndex: number;
  sourceEndIndex: number;
};

function parseTimeRange(text: string): ParsedTimeRange | null {
  const match = text.match(mosaicTimeRangePattern);

  if (!match?.[1] || !match[4]) {
    return null;
  }

  const startHour = Number.parseInt(match[1], 10);
  const startMinute = match[2] ? Number.parseInt(match[2], 10) : 0;
  const endHour = Number.parseInt(match[4], 10);
  const endMinute = match[5] ? Number.parseInt(match[5], 10) : 0;
  const endMeridiem = normalizeMeridiem(match[6]);
  const startMeridiem =
    normalizeMeridiem(match[3]) ??
    (endMeridiem ? inferStartMeridiem(startHour, endHour, endMeridiem) : null);
  const startTime = timeToDate(startHour, startMinute, startMeridiem);
  const endTime = timeToDate(inferEndHour(startHour, endHour, endMeridiem), endMinute, endMeridiem);

  if (!startTime || !endTime) {
    return null;
  }

  return {
    endTime,
    sourceEndIndex: (match.index ?? 0) + match[0].length,
    sourceIndex: match.index ?? 0,
    startTime,
  };
}

function inferStartMeridiem(startHour: number, endHour: number, endMeridiem: "AM" | "PM") {
  if (endMeridiem === "PM" && startHour === 12) {
    return "PM";
  }

  if (endMeridiem === "PM" && startHour > endHour) {
    return "AM";
  }

  return endMeridiem;
}

function inferEndHour(startHour: number, endHour: number, endMeridiem: "AM" | "PM" | null) {
  if (endMeridiem || endHour >= startHour || endHour > 12) {
    return endHour;
  }

  return endHour + 12;
}

function normalizeMeridiem(value: string | undefined) {
  if (!value) {
    return null;
  }

  return value.toUpperCase().replace(/\./g, "") as "AM" | "PM";
}

function timeToDate(hour: number, minute: number, meridiem: "AM" | "PM" | null) {
  if (minute < 0 || minute > 59) {
    return null;
  }

  let normalizedHour = hour;

  if (meridiem) {
    normalizedHour = hour % 12;

    if (meridiem === "PM") {
      normalizedHour += 12;
    }
  }

  if (normalizedHour < 0 || normalizedHour > 23) {
    return null;
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

function parseDayLabel(text: string): ParsedDayOfWeek | null {
  const days = new Set<ParsedDayOfWeek>();

  collectNamedDays(text, days);
  collectCompactDays(text, days);

  return days.size === 1 ? ([...days][0] ?? null) : null;
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

function parseLocation(text: string, timeRange: ParsedTimeRange) {
  const labeledLocation = text.match(/\b(?:Location|Room)\s*:?\s*([^\n]+)/i);

  if (labeledLocation?.[1]) {
    return cleanupLocation(labeledLocation[1]);
  }

  const trailingLocation = text
    .slice(timeRange.sourceEndIndex)
    .split("\n")[0]
    ?.replace(/^[\s,;-]+/, "")
    .trim();

  if (trailingLocation && isLocationText(trailingLocation)) {
    return cleanupLocation(trailingLocation);
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const locationLine = lines.find((line) => {
    if (
      courseCodePattern.test(line) ||
      componentPattern.test(line) ||
      mosaicTimeRangePattern.test(line)
    ) {
      return false;
    }

    return isLocationText(line);
  });

  return locationLine ? cleanupLocation(locationLine) : null;
}

function isLocationText(text: string) {
  return /\b([A-Z]{1,4}\d{0,2}\s*\d{1,4}[A-Z]?|TBA|ONLINE|VIRTUAL)\b/i.test(text);
}

function cleanupLocation(location: string) {
  return location
    .replace(/\bInstructor\b.*$/i, "")
    .replace(/\bMeeting\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
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

function htmlToText(html: string | null) {
  if (!html) {
    return "";
  }

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
