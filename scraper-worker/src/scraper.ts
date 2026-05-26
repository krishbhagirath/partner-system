import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { chromium, type Frame, type Locator, type Page } from "playwright";

import {
  saveSectionsForUser,
  updateJobStatus,
  type SaveSectionsResult,
  type SectionCreateInput,
} from "./db.js";
import { parseScheduleHtml } from "./parser.js";

export type ScrapeJobInput = {
  macId: string;
  password: string;
  userId: string;
  jobId: string;
};

export type ScrapeJobResult = {
  term: string;
  weeksScraped: number;
  sectionsParsed: number;
  saveResult: SaveSectionsResult;
};

const LOGIN_URL = "https://csprd.mcmaster.ca/psp/prcsprd/?cmd=login";
const STUDENT_CENTER_URL =
  "https://csprd.mcmaster.ca/psc/prcsprd/EMPLOYEE/SA/c/SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL";
const FAILURE_SCREENSHOT_PATH = "/tmp/scraper-fail.png";
const FAILURE_HTML_PATH = "/tmp/scraper-fail.html";

const selectors = {
  dateInput: "#DERIVED_CLASS_S_START_DT",
  macIdField: "#userid",
  passwordField: "#pwd",
  refreshButton: "[id='DERIVED_CLASS_S_SSR_REFRESH_CAL$8$']",
  scheduleLink: "#DERIVED_SSS_SCL_SS_WEEKLY_SCHEDULE",
  scheduleTable: "table#WEEKLY_SCHED_HTMLAREA",
  submitButton: "[name='Submit']",
} as const;

export async function runScrapeJob(input: ScrapeJobInput): Promise<ScrapeJobResult> {
  let page: Page | null = null;
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });

  try {
    page = await browser.newPage();

    await updateJobStatus(input.jobId, "LOGGING_IN");
    await login(page, input.macId, input.password);

    await updateJobStatus(input.jobId, "NAVIGATING");
    const frame = await navigateToWeeklySchedule(page);
    const termWindow = await getTermWindowFromSchedule(frame);

    await updateJobStatus(input.jobId, "SCRAPING");
    const weeklyHtml = [];

    for (const monday of termWindow.mondays) {
      weeklyHtml.push(await scrapeWeek(frame, monday));
    }

    await updateJobStatus(input.jobId, "PARSING");
    const sections = weeklyHtml.flatMap((html) =>
      parseScheduleHtml(html, { term: termWindow.term }) as SectionCreateInput[],
    );

    await updateJobStatus(input.jobId, "SAVING");
    const saveResult = await saveSectionsForUser(input.userId, input.jobId, sections);

    await updateJobStatus(input.jobId, "COMPLETED");

    return {
      saveResult,
      sectionsParsed: sections.length,
      term: termWindow.term,
      weeksScraped: weeklyHtml.length,
    };
  } catch (error) {
    const safeMessage = redactSecrets(errorToMessage(error), [input.macId, input.password]);

    await saveFailureArtifacts(page);
    await updateJobStatus(input.jobId, "FAILED", safeMessage).catch(() => undefined);

    throw new Error(safeMessage);
  } finally {
    await browser.close();
  }
}

async function login(page: Page, macId: string, password: string) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.locator(selectors.macIdField).fill(macId);
  await page.locator(selectors.passwordField).fill(password);
  await page.locator(selectors.submitButton).click();
  await page.waitForFunction(() => document.title.includes("Homepage"), null, {
    timeout: 45_000,
  });
}

async function navigateToWeeklySchedule(page: Page) {
  let frame = await waitForFrame(page, "TargetContent", 15_000).catch(() => null);

  if (frame && (await isVisible(frame.locator(selectors.scheduleLink)))) {
    await frame.locator(selectors.scheduleLink).click();
    await waitForScheduleScreen(frame);
    return frame;
  }

  await clickStudentCenterIfPresent(page);
  frame = await waitForFrame(page, "TargetContent", 15_000).catch(() => null);

  if (!frame || !(await isVisible(frame.locator(selectors.scheduleLink)))) {
    await page.goto(STUDENT_CENTER_URL, { waitUntil: "domcontentloaded" });
    frame = await waitForFrame(page, "TargetContent", 30_000);
  }

  await frame.locator(selectors.scheduleLink).waitFor({ state: "visible", timeout: 30_000 });
  await frame.locator(selectors.scheduleLink).click();
  await waitForScheduleScreen(frame);

  return frame;
}

async function clickStudentCenterIfPresent(page: Page) {
  const candidates = [
    page.getByRole("link", { name: /student center/i }).first(),
    page.locator("a:has-text('Student Center')").first(),
    page.locator("text=Student Center").first(),
  ];

  for (const candidate of candidates) {
    if (await isVisible(candidate, 3_000)) {
      await candidate.click();
      return;
    }
  }
}

async function waitForScheduleScreen(frame: Frame) {
  await frame.locator(selectors.dateInput).waitFor({ state: "visible", timeout: 30_000 });
  await frame.locator(selectors.refreshButton).waitFor({ state: "visible", timeout: 30_000 });
}

async function waitForFrame(page: Page, frameName: string, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const frame = page.frame({ name: frameName });

    if (frame) {
      return frame;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for ${frameName} iframe.`);
}

async function isVisible(locator: Locator, timeoutMs = 2_000) {
  try {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function getTermWindowFromSchedule(frame: Frame) {
  const dateValue = await frame.locator(selectors.dateInput).inputValue().catch(() => "");
  const anchorDate = parseMosaicDate(dateValue) ?? new Date();

  return buildTermWindow(anchorDate);
}

async function scrapeWeek(frame: Frame, monday: Date) {
  const dateValue = formatMosaicDate(monday);
  const table = frame.locator(selectors.scheduleTable);
  const dateInput = frame.locator(selectors.dateInput);
  const previousHtml = await table.innerHTML({ timeout: 5_000 }).catch(() => "");

  await dateInput.fill(dateValue);
  await frame.locator(selectors.refreshButton).click();
  await table.waitFor({ state: "attached", timeout: 30_000 });
  await frame
    .waitForFunction(
      ([tableSelector, previous]: [string, string]) => {
        const element = document.querySelector(tableSelector);
        return Boolean(element?.innerHTML.trim()) && element?.innerHTML !== previous;
      },
      [selectors.scheduleTable, previousHtml] as [string, string],
      { timeout: 15_000 },
    )
    .catch(async () => {
      await frame.waitForTimeout(1_000);
    });

  return table.evaluate((element) => element.outerHTML);
}

type TermWindow = {
  term: string;
  mondays: Date[];
};

function buildTermWindow(anchorDate: Date): TermWindow {
  const year = anchorDate.getUTCFullYear();
  const month = anchorDate.getUTCMonth();

  if (month <= 3) {
    return {
      mondays: mondaysBetween(utcDate(year, 0, 1), utcDate(year, 3, 30)),
      term: `Winter ${year}`,
    };
  }

  if (month <= 7) {
    return {
      mondays: mondaysBetween(utcDate(year, 4, 1), utcDate(year, 7, 31)),
      term: `Spring/Summer ${year}`,
    };
  }

  return {
    mondays: mondaysBetween(utcDate(year, 8, 1), utcDate(year, 11, 31)),
    term: `Fall ${year}`,
  };
}

function mondaysBetween(start: Date, end: Date) {
  const mondays: Date[] = [];
  let cursor = startOfMondayWeek(start);

  while (cursor <= end) {
    mondays.push(cursor);
    cursor = addUtcDays(cursor, 7);
  }

  return mondays;
}

function startOfMondayWeek(date: Date) {
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  return addUtcDays(utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), -daysSinceMonday);
}

function addUtcDays(date: Date, days: number) {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days);
}

function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function formatMosaicDate(date: Date) {
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

function parseMosaicDate(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  return utcDate(Number.parseInt(match[3], 10), Number.parseInt(match[2], 10) - 1, Number.parseInt(match[1], 10));
}

async function saveFailureArtifacts(page: Page | null) {
  await mkdir(dirname(FAILURE_HTML_PATH), { recursive: true });

  if (!page) {
    await writeFile(FAILURE_HTML_PATH, "", "utf8");
    return;
  }

  await Promise.allSettled([
    page.screenshot({ fullPage: true, path: FAILURE_SCREENSHOT_PATH }),
    page.content().then((html) => writeFile(FAILURE_HTML_PATH, html, "utf8")),
  ]);
}

function errorToMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown scraper error.";
}

function redactSecrets(message: string, secrets: string[]) {
  let redacted = message;

  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.split(secret).join("[redacted]");
    }
  }

  return redacted;
}
