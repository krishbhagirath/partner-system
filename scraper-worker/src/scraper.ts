import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { chromium, type Frame, type Locator, type Page } from "playwright";

import {
  saveSectionsForUser,
  updateJobStatus,
  type SaveSectionsResult,
  type SectionCreateInput,
} from "./db.js";
import { parseWeeklyScheduleHtml } from "./parser.js";

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
const ACTION_TIMEOUT_MS = 10_000;
const FRAME_TIMEOUT_MS = 30_000;
const LOGIN_REJECTED_MESSAGE =
  "Mosaic did not accept the supplied MacID/password. Please check the credentials and try again.";
const LOAD_STATE_TIMEOUT_MS = 20_000;
const LOGIN_TIMEOUT_MS = 45_000;
const NAVIGATION_TIMEOUT_MS = 45_000;
const OPTIONAL_SELECTOR_TIMEOUT_MS = 2_000;
const PER_SELECTOR_TIMEOUT_MS = 5_000;
const SCHEDULE_REFRESH_TIMEOUT_MS = 20_000;
const SELECTOR_TIMEOUT_MS = 30_000;
const SHORT_SELECTOR_TIMEOUT_MS = 5_000;
const headless = shouldRunHeadless();

const selectors = {
  dateInput: [
    "#DERIVED_CLASS_S_START_DT",
    "input[name='DERIVED_CLASS_S_START_DT']",
    "input[id*='START_DT']",
    "input[title*='Start Date']",
  ],
  macIdField: ["#userid", "input[name='userid']", "input[type='text'][autocomplete='username']"],
  loginErrorMessage: [
    "#login_error",
    "#discovery_error",
    ".psloginerror[role='alert']",
    "[id*='login_error']",
  ],
  mosaicFrame: [
    "iframe[name='TargetContent']",
    "iframe#ptifrmtgtframe",
    "iframe[name='ptifrmtgtframe']",
    "iframe[id*='TargetContent']",
    "iframe[src*='EMPLOYEE']",
  ],
  notEnrolledMessage: ["text=/not enrolled in classes/i", "text=/not enrolled/i"],
  passwordField: ["#pwd", "input[name='pwd']", "input[type='password']"],
  refreshButton: [
    "[id='DERIVED_CLASS_S_SSR_REFRESH_CAL$8$']",
    "input[id*='SSR_REFRESH_CAL']",
    "a[id*='SSR_REFRESH_CAL']",
    "text=/refresh/i",
  ],
  scheduleLink: [
    "#DERIVED_SSS_SCL_SS_WEEKLY_SCHEDULE",
    "a[id='DERIVED_SSS_SCL_SS_WEEKLY_SCHEDULE']",
    "a:has-text('Weekly Schedule')",
    "text=/weekly schedule/i",
  ],
  scheduleTable: [
    "table#WEEKLY_SCHED_HTMLAREA",
    "#WEEKLY_SCHED_HTMLAREA",
    "table[id*='WEEKLY_SCHED']",
  ],
  studentCenterLink: [
    "a[href*='SSS_STUDENT_CENTER']",
    "a:has-text('Student Center')",
    "text=/student center/i",
  ],
  submitButton: [
    "[name='Submit']",
    "input[type='submit']",
    "button:has-text('Sign in')",
    "text=/sign in/i",
  ],
} as const;

type SelectorScope = Page | Frame;
type SelectorState = "attached" | "detached" | "visible" | "hidden";
type ProgressDetails = Record<string, boolean | number | string | null>;

export async function runScrapeJob(input: ScrapeJobInput): Promise<ScrapeJobResult> {
  let page: Page | null = null;
  logProgress(input.jobId, "scrape:start");

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    headless,
    slowMo: headless ? undefined : 75,
  });

  try {
    page = await browser.newPage();
    page.setDefaultTimeout(SELECTOR_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    await updateJobStatus(input.jobId, "LOGGING_IN");
    await login(page, input.macId, input.password, input.jobId);

    await updateJobStatus(input.jobId, "NAVIGATING");
    const frame = await navigateToWeeklySchedule(page, input.jobId);

    if (!frame) {
      await updateJobStatus(input.jobId, "COMPLETED");
      logProgress(input.jobId, "scrape:completed", {
        reason: "not_enrolled",
        sectionsParsed: 0,
        weeksScraped: 0,
      });

      return {
        saveResult: emptySaveSectionsResult(),
        sectionsParsed: 0,
        term: "Unknown",
        weeksScraped: 0,
      };
    }

    const termWindow = await getTermWindowFromSchedule(frame, input.jobId);

    await updateJobStatus(input.jobId, "SCRAPING");
    const weeklyHtml = [];
    logProgress(input.jobId, "weeks:scrape_start", {
      term: termWindow.term,
      weeksToScrape: termWindow.mondays.length,
    });

    for (const monday of termWindow.mondays) {
      weeklyHtml.push(await scrapeWeek(frame, monday, input.jobId));
    }

    await updateJobStatus(input.jobId, "PARSING");
    logProgress(input.jobId, "parse:start", { weeksScraped: weeklyHtml.length });
    const sections = weeklyHtml.flatMap(
      (html) => parseWeeklyScheduleHtml(html, { term: termWindow.term }) as SectionCreateInput[],
    );
    logProgress(input.jobId, "parse:complete", { sectionsParsed: sections.length });

    await updateJobStatus(input.jobId, "SAVING");
    const saveResult = await saveSectionsForUser(input.userId, input.jobId, sections);

    await updateJobStatus(input.jobId, "COMPLETED");
    logProgress(input.jobId, "scrape:completed", {
      sectionsParsed: sections.length,
      weeksScraped: weeklyHtml.length,
    });

    return {
      saveResult,
      sectionsParsed: sections.length,
      term: termWindow.term,
      weeksScraped: weeklyHtml.length,
    };
  } catch (error) {
    const safeMessage = redactSecrets(errorToMessage(error), [input.macId, input.password]);
    logError(input.jobId, "scrape:failed", { message: safeMessage });

    await saveFailureArtifacts(page, input.jobId).catch((artifactError: unknown) => {
      logError(input.jobId, "failure_artifacts:failed", {
        message: redactSecrets(firstLine(errorToMessage(artifactError)), [
          input.macId,
          input.password,
        ]),
      });
    });
    await updateJobStatus(input.jobId, "FAILED", safeMessage).catch(() => undefined);

    throw new Error(safeMessage);
  } finally {
    await browser.close();
  }
}

async function login(page: Page, macId: string, password: string, jobId: string) {
  logProgress(jobId, "login:navigate");
  await page.goto(LOGIN_URL, { timeout: NAVIGATION_TIMEOUT_MS, waitUntil: "domcontentloaded" });
  await waitForLoadStateWithMessage(
    page,
    "domcontentloaded",
    LOAD_STATE_TIMEOUT_MS,
    "Mosaic login page",
  );

  logProgress(jobId, "login:fill_credentials");
  await fillFirstVisible(
    page,
    selectors.macIdField,
    macId,
    "MacID field",
    SELECTOR_TIMEOUT_MS,
    jobId,
  );
  await fillFirstVisible(
    page,
    selectors.passwordField,
    password,
    "password field",
    SELECTOR_TIMEOUT_MS,
    jobId,
  );

  logProgress(jobId, "login:submit");
  await markExistingLoginErrors(page);
  await clickFirstVisible(
    page,
    selectors.submitButton,
    "login submit button",
    SELECTOR_TIMEOUT_MS,
    jobId,
  );
  await waitForLoginCompletion(page, jobId);
  logProgress(jobId, "login:complete");
}

async function markExistingLoginErrors(page: Page) {
  await page.evaluate((errorSelectors) => {
    for (const element of document.querySelectorAll(errorSelectors.join(","))) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      element.dataset.labpartnerStaleError = element.textContent?.trim() ?? "";
    }
  }, selectors.loginErrorMessage);
}

async function waitForLoginCompletion(page: Page, jobId: string) {
  const outcome = await page
    .waitForFunction(
      (errorSelectors) => {
        if (document.title.includes("Homepage")) {
          return "success";
        }

        const failurePattern =
          /(?:your\s+)?user\s*id\s+and\/or\s+password\s+are\s+invalid|invalid\s+(?:user\s*id|username|macid|password|credentials)|(?:user\s*id|username|macid|password|credentials).{0,80}(?:invalid|incorrect|wrong|not recognized)|(?:authentication|login|sign[ -]?in).{0,80}(?:failed|failure|unsuccessful|denied)/i;

        for (const element of document.querySelectorAll(errorSelectors.join(","))) {
          const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
          const staleText =
            element instanceof HTMLElement ? (element.dataset.labpartnerStaleError ?? "") : "";

          if (text && text !== staleText && failurePattern.test(text)) {
            return "rejected";
          }
        }

        return null;
      },
      selectors.loginErrorMessage,
      { timeout: LOGIN_TIMEOUT_MS },
    )
    .then(async (handle) => {
      const value = await handle.jsonValue();
      await handle.dispose();

      return value;
    })
    .catch(async (error: unknown) => {
      if (await hasVisibleLoginRejection(page, jobId)) {
        return "rejected";
      }

      throw new Error(
        `Timed out after ${LOGIN_TIMEOUT_MS}ms waiting for Mosaic login to complete: ${firstLine(
          errorToMessage(error),
        )}`,
      );
    });

  if (outcome === "rejected") {
    logProgress(jobId, "login:rejected");
    throw new Error(LOGIN_REJECTED_MESSAGE);
  }
}

async function hasVisibleLoginRejection(page: Page, jobId: string) {
  const match = await waitForSelectorFallback(page, selectors.loginErrorMessage, {
    jobId,
    label: "login error message",
    state: "visible",
    timeoutMs: OPTIONAL_SELECTOR_TIMEOUT_MS,
  }).catch(() => null);

  if (!match) {
    return false;
  }

  const text = await match.locator.textContent({ timeout: ACTION_TIMEOUT_MS }).catch(() => "");

  return /invalid|incorrect|wrong|not recognized|failed|failure|unsuccessful|denied/i.test(
    text ?? "",
  );
}

async function navigateToWeeklySchedule(page: Page, jobId: string): Promise<Frame | null> {
  logProgress(jobId, "weekly_schedule:locate");
  await waitForLoadStateWithMessage(
    page,
    "domcontentloaded",
    LOAD_STATE_TIMEOUT_MS,
    "Mosaic landing page",
  );

  let frame = await switchToMosaicFrame(page, jobId, SHORT_SELECTOR_TIMEOUT_MS).catch(() => null);
  let openResult = frame ? await openWeeklyScheduleFromFrame(frame, jobId, true) : "missing";

  if (openResult === "opened") {
    return frame;
  }

  if (openResult === "not_enrolled") {
    return null;
  }

  if (await clickStudentCenterIfPresent(page, jobId)) {
    frame = await switchToMosaicFrame(page, jobId, FRAME_TIMEOUT_MS).catch(() => null);
    openResult = frame ? await openWeeklyScheduleFromFrame(frame, jobId, true) : "missing";

    if (openResult === "opened") {
      return frame;
    }

    if (openResult === "not_enrolled") {
      return null;
    }
  }

  logProgress(jobId, "student_center:direct_navigation");
  await page.goto(STUDENT_CENTER_URL, {
    timeout: NAVIGATION_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });
  await waitForLoadStateWithMessage(
    page,
    "domcontentloaded",
    LOAD_STATE_TIMEOUT_MS,
    "Student Center page",
  );

  frame = await switchToMosaicFrame(page, jobId, FRAME_TIMEOUT_MS);
  openResult = await openWeeklyScheduleFromFrame(frame, jobId, false);

  if (openResult === "not_enrolled") {
    return null;
  }

  if (openResult !== "opened") {
    throw new Error("Unable to open Mosaic weekly schedule from the Student Center.");
  }

  return frame;
}

async function clickStudentCenterIfPresent(page: Page, jobId: string) {
  const match = await waitForSelectorFallback(page, selectors.studentCenterLink, {
    jobId,
    label: "Student Center link",
    state: "visible",
    timeoutMs: SHORT_SELECTOR_TIMEOUT_MS,
  }).catch(() => null);

  if (!match) {
    return false;
  }

  logProgress(jobId, "student_center:click");
  await clickLocator(match.locator, "Student Center link");
  await waitForLoadStateWithMessage(
    page,
    "domcontentloaded",
    LOAD_STATE_TIMEOUT_MS,
    "Student Center navigation",
  );

  return true;
}

type WeeklyScheduleOpenResult = "missing" | "not_enrolled" | "opened";

async function openWeeklyScheduleFromFrame(
  frame: Frame,
  jobId: string,
  allowMissing: boolean,
): Promise<WeeklyScheduleOpenResult> {
  await waitForLoadStateWithMessage(
    frame,
    "domcontentloaded",
    LOAD_STATE_TIMEOUT_MS,
    "Mosaic iframe",
  );

  if (await hasNoEnrolledClasses(frame, jobId)) {
    logProgress(jobId, "weekly_schedule:not_enrolled");
    return "not_enrolled";
  }

  const scheduleLink = await waitForSelectorFallback(frame, selectors.scheduleLink, {
    jobId,
    label: "weekly schedule link",
    state: "visible",
    timeoutMs: allowMissing ? SHORT_SELECTOR_TIMEOUT_MS : SELECTOR_TIMEOUT_MS,
  }).catch((error: unknown) => {
    if (allowMissing) {
      logProgress(jobId, "weekly_schedule:link_missing");
      return null;
    }

    throw error;
  });

  if (!scheduleLink) {
    return "missing";
  }

  logProgress(jobId, "weekly_schedule:open");
  await clickLocator(scheduleLink.locator, "weekly schedule link");
  await waitForLoadStateWithMessage(
    frame,
    "domcontentloaded",
    LOAD_STATE_TIMEOUT_MS,
    "weekly schedule screen",
  );
  await waitForScheduleScreen(frame, jobId);

  return "opened";
}

async function waitForScheduleScreen(frame: Frame, jobId: string) {
  await waitForSelectorFallback(frame, selectors.dateInput, {
    jobId,
    label: "weekly schedule date input",
    state: "visible",
    timeoutMs: SELECTOR_TIMEOUT_MS,
  });
  await waitForSelectorFallback(frame, selectors.refreshButton, {
    jobId,
    label: "weekly schedule refresh button",
    state: "visible",
    timeoutMs: SELECTOR_TIMEOUT_MS,
  });
  await waitForSelectorFallback(frame, selectors.scheduleTable, {
    jobId,
    label: "weekly schedule table",
    state: "attached",
    timeoutMs: SELECTOR_TIMEOUT_MS,
  });
  logProgress(jobId, "weekly_schedule:ready");
}

async function switchToMosaicFrame(page: Page, jobId: string, timeoutMs: number) {
  const match = await waitForSelectorFallback(page, selectors.mosaicFrame, {
    jobId,
    label: "Mosaic content iframe",
    state: "attached",
    timeoutMs,
  });
  const handle = await match.locator.elementHandle({ timeout: ACTION_TIMEOUT_MS });
  const frame = await handle?.contentFrame();
  await handle?.dispose();

  if (!frame) {
    throw new Error(
      `Mosaic content iframe was found with selector "${match.selector}", but Playwright could not attach to it.`,
    );
  }

  await waitForLoadStateWithMessage(
    frame,
    "domcontentloaded",
    LOAD_STATE_TIMEOUT_MS,
    "Mosaic content iframe",
  );
  logProgress(jobId, "iframe:ready", { selector: match.selector });

  return frame;
}

async function hasNoEnrolledClasses(frame: Frame, jobId: string) {
  return Boolean(
    await waitForSelectorFallback(frame, selectors.notEnrolledMessage, {
      jobId,
      label: "not enrolled message",
      state: "visible",
      timeoutMs: OPTIONAL_SELECTOR_TIMEOUT_MS,
    }).catch(() => null),
  );
}

async function getTermWindowFromSchedule(frame: Frame, jobId: string) {
  const dateInput = await waitForSelectorFallback(frame, selectors.dateInput, {
    jobId,
    label: "weekly schedule date input",
    state: "visible",
    timeoutMs: SELECTOR_TIMEOUT_MS,
  });
  const dateValue = await withActionMessage(
    () => dateInput.locator.inputValue({ timeout: ACTION_TIMEOUT_MS }),
    "read weekly schedule date input",
    ACTION_TIMEOUT_MS,
  );
  const anchorDate = parseMosaicDate(dateValue) ?? new Date();

  return buildTermWindow(anchorDate);
}

async function scrapeWeek(frame: Frame, monday: Date, jobId: string) {
  const dateValue = formatMosaicDate(monday);
  const table = await waitForSelectorFallback(frame, selectors.scheduleTable, {
    jobId,
    label: "weekly schedule table",
    state: "attached",
    timeoutMs: SELECTOR_TIMEOUT_MS,
  });
  const dateInput = await waitForSelectorFallback(frame, selectors.dateInput, {
    jobId,
    label: "weekly schedule date input",
    state: "visible",
    timeoutMs: SELECTOR_TIMEOUT_MS,
  });
  const refreshButton = await waitForSelectorFallback(frame, selectors.refreshButton, {
    jobId,
    label: "weekly schedule refresh button",
    state: "visible",
    timeoutMs: SELECTOR_TIMEOUT_MS,
  });
  const previousHtml = await table.locator.evaluate((element) => element.outerHTML).catch(() => "");

  logProgress(jobId, "week:scrape_start", { date: dateValue });
  await fillLocator(dateInput.locator, dateValue, "weekly schedule date input");
  await clickLocator(refreshButton.locator, "weekly schedule refresh button");
  await waitForLoadStateWithMessage(
    frame,
    "domcontentloaded",
    LOAD_STATE_TIMEOUT_MS,
    "weekly schedule refresh",
  );

  const refreshedTable = await waitForSelectorFallback(frame, selectors.scheduleTable, {
    jobId,
    label: "weekly schedule table after refresh",
    state: "attached",
    timeoutMs: SELECTOR_TIMEOUT_MS,
  });
  await waitForScheduleTableRefresh(frame, refreshedTable.selector, previousHtml, dateValue, jobId);

  const html = await withActionMessage(
    () => refreshedTable.locator.evaluate((element) => element.outerHTML),
    "read weekly schedule table HTML",
    ACTION_TIMEOUT_MS,
  );
  logProgress(jobId, "week:scrape_complete", { date: dateValue });

  return html;
}

async function waitForScheduleTableRefresh(
  frame: Frame,
  tableSelector: string,
  previousHtml: string,
  dateValue: string,
  jobId: string,
) {
  try {
    await frame.waitForFunction(
      ({ previous, selector }: { previous: string; selector: string }) => {
        const element = document.querySelector(selector);
        const html = element?.outerHTML.trim() ?? "";

        if (!html) {
          return false;
        }

        return previous.trim().length === 0 || html !== previous;
      },
      { previous: previousHtml, selector: tableSelector },
      { timeout: SCHEDULE_REFRESH_TIMEOUT_MS },
    );
    return;
  } catch (error) {
    const currentHtml = await frame
      .locator(tableSelector)
      .evaluate((element) => element.outerHTML)
      .catch(() => "");

    if (currentHtml.trim().length > 0) {
      logProgress(jobId, "week:table_unchanged_after_timeout", { date: dateValue });
      return;
    }

    throw new Error(
      `Timed out after ${SCHEDULE_REFRESH_TIMEOUT_MS}ms waiting for weekly schedule table to refresh for ${dateValue}: ${firstLine(
        errorToMessage(error),
      )}`,
    );
  }
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

  return addUtcDays(
    utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    -daysSinceMonday,
  );
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

  return utcDate(
    Number.parseInt(match[3], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[1], 10),
  );
}

async function waitForSelectorFallback(
  scope: SelectorScope,
  candidates: readonly string[],
  options: {
    jobId: string;
    label: string;
    state: SelectorState;
    timeoutMs: number;
  },
) {
  const startedAt = Date.now();
  let lastErrorMessage = "";

  for (const [index, selector] of candidates.entries()) {
    const remainingMs = options.timeoutMs - (Date.now() - startedAt);

    if (remainingMs <= 0) {
      break;
    }

    const remainingCandidates = candidates.length - index;
    const timeout = Math.max(
      1,
      Math.min(Math.ceil(remainingMs / remainingCandidates), PER_SELECTOR_TIMEOUT_MS),
    );

    try {
      await scope.waitForSelector(selector, {
        state: options.state,
        timeout,
      });

      if (index > 0) {
        logProgress(options.jobId, "selector:fallback_matched", {
          label: options.label,
          selector,
          selectorIndex: index + 1,
        });
      }

      return {
        locator: scope.locator(selector).first(),
        selector,
      };
    } catch (error) {
      lastErrorMessage = firstLine(errorToMessage(error));
    }
  }

  const triedSelectors = candidates.join(", ");
  const suffix = lastErrorMessage ? ` Last error: ${lastErrorMessage}` : "";

  throw new Error(
    `Timed out after ${options.timeoutMs}ms waiting for ${options.label}. Tried selectors: ${triedSelectors}.${suffix}`,
  );
}

async function fillFirstVisible(
  scope: SelectorScope,
  candidates: readonly string[],
  value: string,
  label: string,
  timeoutMs: number,
  jobId: string,
) {
  const match = await waitForSelectorFallback(scope, candidates, {
    jobId,
    label,
    state: "visible",
    timeoutMs,
  });

  await fillLocator(match.locator, value, label);
}

async function clickFirstVisible(
  scope: SelectorScope,
  candidates: readonly string[],
  label: string,
  timeoutMs: number,
  jobId: string,
) {
  const match = await waitForSelectorFallback(scope, candidates, {
    jobId,
    label,
    state: "visible",
    timeoutMs,
  });

  await clickLocator(match.locator, label);
}

async function fillLocator(locator: Locator, value: string, label: string) {
  await withActionMessage(
    () => locator.fill(value, { timeout: ACTION_TIMEOUT_MS }),
    `fill ${label}`,
    ACTION_TIMEOUT_MS,
  );
}

async function clickLocator(locator: Locator, label: string) {
  await withActionMessage(
    () => locator.click({ timeout: ACTION_TIMEOUT_MS }),
    `click ${label}`,
    ACTION_TIMEOUT_MS,
  );
}

async function waitForLoadStateWithMessage(
  scope: SelectorScope,
  state: "domcontentloaded" | "load" | "networkidle",
  timeoutMs: number,
  label: string,
) {
  try {
    await scope.waitForLoadState(state, { timeout: timeoutMs });
  } catch (error) {
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for ${label} to reach "${state}" load state: ${firstLine(
        errorToMessage(error),
      )}`,
    );
  }
}

async function withActionMessage<T>(operation: () => Promise<T>, label: string, timeoutMs: number) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(
      `Failed to ${label} within ${timeoutMs}ms: ${firstLine(errorToMessage(error))}`,
    );
  }
}

async function saveFailureArtifacts(page: Page | null, jobId: string) {
  if (!isDevelopmentMode()) {
    logProgress(jobId, "failure_artifacts:skipped", { mode: "production" });
    return;
  }

  await mkdir(dirname(FAILURE_HTML_PATH), { recursive: true });

  if (!page) {
    await writeFile(FAILURE_HTML_PATH, "", "utf8");
    logProgress(jobId, "failure_artifacts:saved", {
      htmlPath: FAILURE_HTML_PATH,
      htmlSaved: true,
      screenshotPath: FAILURE_SCREENSHOT_PATH,
      screenshotSaved: false,
    });
    return;
  }

  const [screenshotResult, htmlResult] = await Promise.allSettled([
    page.screenshot({ fullPage: true, path: FAILURE_SCREENSHOT_PATH }),
    captureFailureHtml(page).then((html) => writeFile(FAILURE_HTML_PATH, html, "utf8")),
  ]);

  logProgress(jobId, "failure_artifacts:saved", {
    htmlPath: FAILURE_HTML_PATH,
    htmlSaved: htmlResult.status === "fulfilled",
    screenshotPath: FAILURE_SCREENSHOT_PATH,
    screenshotSaved: screenshotResult.status === "fulfilled",
  });
}

async function captureFailureHtml(page: Page) {
  const pageHtml = await page.content().catch((error: unknown) => {
    return `<!-- Unable to capture page HTML: ${firstLine(errorToMessage(error))} -->`;
  });
  const frameHtml = await Promise.all(
    page
      .frames()
      .filter((frame) => frame !== page.mainFrame())
      .map(async (frame, index) => {
        try {
          return `\n<!-- iframe snapshot ${index + 1} -->\n${await frame.content()}`;
        } catch (error) {
          return `\n<!-- Unable to capture iframe snapshot ${index + 1}: ${firstLine(errorToMessage(error))} -->`;
        }
      }),
  );

  return [pageHtml, ...frameHtml].join("\n");
}

function logProgress(jobId: string, step: string, details: ProgressDetails = {}) {
  writeStructuredLog("info", jobId, step, details);
}

function logError(jobId: string, step: string, details: ProgressDetails = {}) {
  writeStructuredLog("error", jobId, step, details);
}

function writeStructuredLog(
  level: "error" | "info",
  jobId: string,
  step: string,
  details: ProgressDetails,
) {
  const line = JSON.stringify({
    ...details,
    jobId,
    level,
    step,
    timestamp: new Date().toISOString(),
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function errorToMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown scraper error.";
}

function firstLine(message: string) {
  return message.split(/\r?\n/)[0]?.trim() || "Unknown scraper error.";
}

function redactSecrets(message: string, secrets: string[]) {
  let redacted = message;

  for (const secret of secrets) {
    if (secret) {
      for (const variant of [secret, encodeURIComponent(secret)]) {
        redacted = redacted.split(variant).join("[redacted]");
      }
    }
  }

  return redacted;
}

function isDevelopmentMode() {
  return process.env.NODE_ENV !== "production";
}

function shouldRunHeadless() {
  const setting = process.env.SCRAPER_HEADLESS?.trim().toLowerCase();

  if (setting === "true") {
    return true;
  }

  if (setting === "false") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

function emptySaveSectionsResult(): SaveSectionsResult {
  return {
    alreadyExisting: 0,
    created: 0,
    duplicateInPayload: 0,
    received: 0,
  };
}
