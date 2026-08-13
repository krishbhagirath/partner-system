import "server-only";

import type { ComponentType, DayOfWeek } from "@/generated/prisma/client";
import { formatTerm } from "@/lib/format";
import type { SectionCreateInput } from "@/server/lab-partner";

const HOST = "mytimetable.mcmaster.ca";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// VSB day numbers -> our enum (1 = Sunday … 7 = Saturday).
const DAY_MAP: Record<string, DayOfWeek> = {
  "1": "SUNDAY",
  "2": "MONDAY",
  "3": "TUESDAY",
  "4": "WEDNESDAY",
  "5": "THURSDAY",
  "6": "FRIDAY",
  "7": "SATURDAY",
};

export class VsbImportError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "VsbImportError";
  }
}

type RawSection = Omit<SectionCreateInput, "term">;

// VSB's lightweight anti-bot time nonce (see its js/common.js `nWindow`).
function nonce() {
  const t = Math.floor(Date.now() / 60000) % 1000;
  const e = (t % 3) + (t % 39) + (t % 42);
  return `&t=${t}&e=${e}`;
}

// Accept a full share URL or a bare code; return the canonical /s/<code> URL.
// Also the SSRF guard: only mytimetable.mcmaster.ca share links are ever fetched.
function normalizeShareUrl(input: string): string {
  const trimmed = input.trim();

  if (/^[a-z0-9]+$/i.test(trimmed)) {
    return `https://${HOST}/s/${trimmed}`;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new VsbImportError("That doesn't look like a MyTimetable share link.");
  }

  if (url.hostname !== HOST) {
    throw new VsbImportError("The link has to be a mytimetable.mcmaster.ca share link.");
  }

  const match = url.pathname.match(/^\/s\/([a-z0-9]+)\/?$/i);
  if (!match) {
    throw new VsbImportError(
      "That isn't a share link. In MyTimetable, click Share and copy the short link it gives you.",
    );
  }

  return `https://${HOST}/s/${match[1]}`;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/(\w+)="([^"]*)"/g)) {
    const key = m[1];
    const value = m[2];
    if (key !== undefined && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

// Stored the same way the MacID importer stores times: a UTC time on 1970-01-01.
function toTime(minutes: number): Date {
  return new Date(Date.UTC(1970, 0, 1, Math.floor(minutes / 60), minutes % 60, 0));
}

// "SFWRENG-3K04" -> "SFWRENG 3K04", to line up with the MacID importer's format.
function normalizeCourseCode(code: string): string {
  return code.replace(/-/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

function parseCourseXml(xml: string, selectedKey: string, courseCode: string, out: RawSection[]) {
  const uselectionPattern = /<uselection\b[^>]*\bkey="([^"]+)"[^>]*>([\s\S]*?)<\/uselection>/g;

  let picked: string | null = null;
  for (const match of xml.matchAll(uselectionPattern)) {
    if (match[1] === selectedKey) {
      picked = match[2] ?? null;
      break;
    }
  }
  if (!picked) {
    return;
  }

  const rawTitle = xml.match(/<offering\b[^>]*\btitle="([^"]*)"/)?.[1] ?? null;

  const timeblocks: Record<string, Array<{ day: string; t1: string; t2: string }>> = {};
  for (const match of picked.matchAll(/<timeblock\b[^>]*\/>/g)) {
    const a = attrs(match[0]);
    const id = a.id;
    if (!id) {
      continue;
    }
    (timeblocks[id] = timeblocks[id] ?? []).push({
      day: a.day ?? "",
      t1: a.t1 ?? "",
      t2: a.t2 ?? "",
    });
  }

  for (const match of picked.matchAll(/<block\b[^>]*\/>/g)) {
    const block = attrs(match[0]);
    // Only labs and tutorials are imported; lectures (and anything else) are skipped.
    const componentType: ComponentType | null =
      block.type === "LAB" ? "LAB" : block.type === "TUT" ? "TUTORIAL" : null;
    if (!componentType) {
      continue;
    }

    const sectionCode = (block.secNo || block.disp || "").trim().toUpperCase();
    const location = (block.location || "").trim() || "TBA";
    const ids = (block.timeblockids || "").split(",").filter(Boolean);
    const seen = new Set<string>();

    for (const id of ids) {
      for (const tb of timeblocks[id] ?? []) {
        const dayOfWeek = DAY_MAP[tb.day];
        if (!dayOfWeek) {
          continue;
        }

        const dedupeKey = `${dayOfWeek}|${tb.t1}|${tb.t2}`;
        if (seen.has(dedupeKey)) {
          continue; // collapse biweekly duplicates
        }
        seen.add(dedupeKey);

        out.push({
          componentType,
          courseCode: normalizeCourseCode(courseCode),
          dayOfWeek,
          endTime: toTime(Number(tb.t2)),
          location,
          rawTitle,
          sectionCode,
          startTime: toTime(Number(tb.t1)),
        });
      }
    }
  }
}

export type VsbImportResult = {
  term: string;
  sections: SectionCreateInput[];
};

export async function parseVsbShareLink(rawLink: string): Promise<VsbImportResult> {
  const shareUrl = normalizeShareUrl(rawLink);

  // 1. The share link 301-redirects to a criteria URL whose query string holds
  //    the term, the course list, and which sections the student picked.
  let redirect: Response;
  try {
    redirect = await fetch(shareUrl, { headers: { "User-Agent": UA }, redirect: "manual" });
  } catch {
    throw new VsbImportError("Couldn't reach MyTimetable. Try again in a moment.", 502);
  }

  const location = redirect.headers.get("location");
  const cookie = (redirect.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  if (!location) {
    throw new VsbImportError(
      "That share link didn't open a schedule. Make sure it's a current MyTimetable link.",
    );
  }

  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const term = params.get("term");
  if (!term) {
    throw new VsbImportError("That share link has no term in it.");
  }

  const courses: Array<{ code: string; selectedKey: string }> = [];
  for (let i = 0; params.get(`course_${i}_0`); i += 1) {
    const code = params.get(`course_${i}_0`);
    const selectedKey = params.get(`cs_${i}_0`);
    if (code && selectedKey) {
      courses.push({ code, selectedKey });
    }
  }
  if (courses.length === 0) {
    throw new VsbImportError(
      "That schedule has no selected sections. Build your schedule in MyTimetable first, then share it.",
    );
  }

  // 2. Pull each course's full section data and keep only the picked combo.
  const raw: RawSection[] = [];
  let termLabel = "";

  for (const course of courses) {
    const url =
      `https://${HOST}/api/class-data?term=${encodeURIComponent(term)}` +
      `&course_0_0=${encodeURIComponent(course.code)}${nonce()}`;

    let xml: string;
    try {
      xml = await fetch(url, {
        headers: { "User-Agent": UA, Referer: `https://${HOST}/criteria.jsp`, Cookie: cookie },
      }).then((response) => response.text());
    } catch {
      throw new VsbImportError("Couldn't read your schedule from MyTimetable. Try again.", 502);
    }

    if (!termLabel) {
      termLabel = xml.match(/<term\b[^>]*\bv="([^"]*)"/)?.[1] ?? "";
    }

    parseCourseXml(xml, course.selectedKey, course.code, raw);
  }

  if (raw.length === 0) {
    throw new VsbImportError(
      "No lab or tutorial sections were found in that schedule. (Lectures aren't imported — only labs and tutorials.)",
    );
  }

  // Canonicalize to season-first ("Fall 2026") so VSB and MacID imports store the
  // same term string and therefore match each other.
  const sectionTerm = formatTerm(termLabel || term);

  return {
    term: sectionTerm,
    sections: raw.map((section) => ({ ...section, term: sectionTerm })),
  };
}
