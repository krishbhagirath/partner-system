import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseScheduleHtml, type ParsedScheduleSection } from "./parser.js";

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const term = "Winter 2026";

function readFixture(name: string) {
  return readFileSync(join(fixtureDirectory, name), "utf8");
}

function parseFixture(name: string) {
  return parseScheduleHtml(readFixture(name), { term }).map(serializeSection);
}

function serializeSection(section: ParsedScheduleSection) {
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

describe("parseScheduleHtml", () => {
  it("ignores Lecture and Core rows", () => {
    const sections = parseFixture("mosaic-weekly-basic.html");

    expect(sections).toHaveLength(4);
    expect(sections.map((section) => section.componentType)).toEqual([
      "TUTORIAL",
      "LAB",
      "LAB",
      "TUTORIAL",
    ]);
    expect(sections.some((section) => section.rawTitle?.includes("Lecture"))).toBe(false);
    expect(sections.some((section) => section.rawTitle?.includes("Core"))).toBe(false);
  });

  it("extracts Tutorial rows correctly", () => {
    const sections = parseFixture("mosaic-weekly-basic.html");

    expect(sections.find((section) => section.sectionCode === "T01")).toEqual({
      componentType: "TUTORIAL",
      courseCode: "COMPSCI 2XB3",
      dayOfWeek: "TUESDAY",
      endTime: "10:20",
      location: "T13 127",
      rawTitle: "COMPSCI 2XB3 - T01 Tutorial 09:30 - 10:20 T13 127",
      sectionCode: "T01",
      startTime: "09:30",
      term,
    });
  });

  it("extracts Lab and Laboratory rows correctly", () => {
    const sections = parseFixture("mosaic-weekly-basic.html");

    expect(sections.find((section) => section.sectionCode === "LAB")).toMatchObject({
      componentType: "LAB",
      courseCode: "COMPSCI 2XB3",
      dayOfWeek: "WEDNESDAY",
      endTime: "12:20",
      location: "ITB 236",
      startTime: "10:30",
    });
    expect(sections.find((section) => section.sectionCode === "L02")).toMatchObject({
      componentType: "LAB",
      courseCode: "COMPSCI 2XB3",
      dayOfWeek: "THURSDAY",
      endTime: "16:20",
      location: "ITB 236",
      startTime: "14:30",
    });
  });

  it("extracts multiple rows across different weekdays", () => {
    const sections = parseFixture("mosaic-weekly-basic.html");

    expect(sections.map((section) => section.dayOfWeek)).toEqual([
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
    ]);
  });

  it("skips malformed or incomplete rows safely", () => {
    const sections = parseFixture("mosaic-weekly-malformed.html");

    expect(sections).toEqual([
      {
        componentType: "TUTORIAL",
        courseCode: "COMPSCI 2XB3",
        dayOfWeek: "MONDAY",
        endTime: "10:20",
        location: "ONLINE",
        rawTitle: "COMPSCI 2XB3 - T05 Tutorial 09:30 - 10:20 ONLINE",
        sectionCode: "T05",
        startTime: "09:30",
        term,
      },
    ]);
  });

  it("keeps weekday columns correct when a previous cell uses rowspan", () => {
    const sections = parseFixture("mosaic-weekly-rowspan.html");

    expect(sections).toHaveLength(4);
    expect(sections.find((section) => section.sectionCode === "LAB")).toMatchObject({
      dayOfWeek: "MONDAY",
      endTime: "12:20",
      startTime: "10:30",
    });
    expect(sections.find((section) => section.sectionCode === "T03")).toMatchObject({
      dayOfWeek: "TUESDAY",
      endTime: "12:20",
      startTime: "11:30",
    });
    expect(sections.find((section) => section.sectionCode === "L03")).toMatchObject({
      dayOfWeek: "WEDNESDAY",
      endTime: "13:20",
      startTime: "11:30",
    });
  });

  it("normalizes parsed output consistently", () => {
    const sections = parseFixture("mosaic-weekly-basic.html");

    expect(sections.find((section) => section.sectionCode === "L02")).toMatchObject({
      componentType: "LAB",
      courseCode: "COMPSCI 2XB3",
      location: "ITB 236",
      sectionCode: "L02",
      term,
    });
  });
});
