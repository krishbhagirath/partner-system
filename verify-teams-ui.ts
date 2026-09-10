/**
 * Browser-level verification of the teams UI, covering what the HTTP checks in
 * verify-teams.ts cannot: the discovery rows are collapsed on the server, so team
 * cards, the "Ask to join" action and the post-accept prompt only exist after a click.
 *
 *   npx tsx verify-teams-ui.ts        (expects the dev server up and TEAMS_ENABLED = true)
 *
 * Sessions are established over HTTP and the resulting cookies injected into the
 * browser, so no password is ever typed into a form.
 */
import { config } from "dotenv";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "./apps/web/src/generated/prisma/client";
import { buildSectionDiscoveryKey } from "./apps/web/src/server/section-key";

// Playwright lives in the scraper-worker workspace, which is the only place it is a
// dependency; resolve it from there rather than adding it to the root.
const require = createRequire(import.meta.url);
const { chromium } = require(
  resolve(process.cwd(), "scraper-worker/node_modules/playwright/index.js"),
) as typeof import("playwright");

const envPath =
  ["apps/web/.env.local", ".env.local"]
    .map((path) => resolve(process.cwd(), path))
    .find(existsSync) ?? "apps/web/.env.local";

config({ path: envPath });

const BASE_URL = "http://localhost:3000";
const PASSWORD = "verify-teams-password-1";
const SCRATCH = process.env.VERIFY_SHOT_DIR ?? ".";

const SECTION = {
  componentType: "LAB" as const,
  courseCode: "VERIFY 1AA3",
  dayOfWeek: "MONDAY" as const,
  endTime: new Date("1970-01-01T17:20:00.000Z"),
  location: "VERIFY 101",
  sectionCode: "L01",
  startTime: new Date("1970-01-01T14:30:00.000Z"),
  term: "2099 Fall",
};

const SECTION_KEY = buildSectionDiscoveryKey(SECTION);

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
});

let failures = 0;
let checks = 0;
let ipCounter = 100;

/**
 * Case-insensitive: innerText returns CSS-transformed text, so headings styled
 * `uppercase` come back shouting and a literal comparison would miss them.
 */
function has(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function check(label: string, condition: boolean, detail?: unknown) {
  checks += 1;

  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  }
}

async function createUser(label: string) {
  ipCounter += 1;
  const ip = `10.9.1.${ipCounter % 250}`;
  const email = `verify-teams-${label}-${Date.now()}@mcmaster.ca`;
  const user = await db.user.create({
    data: { email, name: `Verify ${label}`, passwordHash: await bcrypt.hash(PASSWORD, 10) },
  });
  const section = await db.section.create({ data: { ...SECTION, userId: user.id } });

  await db.discoverableSection.create({
    data: { isActive: true, sectionId: section.id, userId: user.id },
  });

  // Sign in over HTTP and keep the cookies; nothing is typed into a login form.
  const jar = new Map<string, string>();
  const headers = () => ({
    cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    "x-forwarded-for": ip,
  });
  const absorb = (response: Response) => {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair?.indexOf("=") ?? -1;

      if (pair && index > 0) {
        jar.set(pair.slice(0, index), pair.slice(index + 1));
      }
    }
  };

  const csrfResponse = await fetch(`${BASE_URL}/api/auth/csrf`, { headers: headers() });
  absorb(csrfResponse);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const signIn = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    body: new URLSearchParams({ csrfToken, email, password: PASSWORD }),
    headers: { ...headers(), "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    redirect: "manual",
  });
  absorb(signIn);

  return { email, ip, jar, sectionId: section.id, userId: user.id };
}

type Student = Awaited<ReturnType<typeof createUser>>;

function cookiesFor(student: Student) {
  return [...student.jar].map(([name, value]) => ({
    domain: "localhost",
    httpOnly: false,
    name,
    path: "/",
    secure: false,
    value,
  }));
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { startsWith: "verify-teams-" } } });
  await db.team.deleteMany({ where: { sectionKey: SECTION_KEY } });
}

async function main() {
  await cleanup();

  const [alice, bob, cara] = await Promise.all([
    createUser("uialice"),
    createUser("uibob"),
    createUser("uicara"),
  ]);

  // Build an open team of two directly, so this run exercises rendering rather than
  // re-testing the state machine that verify-teams.ts already covers.
  // `location` is deliberately not part of a Team: it is not one of the seven fields
  // that define section identity, so two students in the same lab can disagree on it.
  const { location: _location, ...identity } = SECTION;
  const team = await db.team.create({
    data: { ...identity, isComplete: false, sectionKey: SECTION_KEY },
  });
  await db.teamMember.createMany({
    data: [
      { sectionId: alice.sectionId, sectionKey: SECTION_KEY, teamId: team.id, userId: alice.userId },
      { sectionId: bob.sectionId, sectionKey: SECTION_KEY, teamId: team.id, userId: bob.userId },
    ],
  });

  const browser = await chromium.launch();

  try {
    console.log("Discovery, as a classmate who is not on a team (Cara)");
    const caraContext = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    await caraContext.addCookies(cookiesFor(cara));
    const caraPage = await caraContext.newPage();
    await caraPage.goto(`${BASE_URL}/sections`, { waitUntil: "networkidle" });

    check("the collapsed row offers the team", await caraPage.getByText("1 available").isVisible());

    await caraPage.getByRole("button", { name: /L01/ }).click();
    await caraPage.waitForTimeout(300);

    const body = await caraPage.locator("main").innerText();
    check("the expanded row shows a team card", has(body, "Team of 2"), body.slice(0, 300));
    check("labelled as looking for more", has(body, "looking for more"));
    check("with an Ask to join button", await caraPage.getByRole("button", { name: "Ask to join" }).isVisible());
    check("and both members are named", has(body, "Verify uialice") && has(body, "Verify uibob"));
    check(
      "no contact details leak to a non-teammate",
      !body.includes(alice.email) && !body.includes(bob.email),
      { leaked: body.includes(alice.email) || body.includes(bob.email) },
    );

    await caraPage.screenshot({ path: `${SCRATCH}/ui-discovery-open-team.png`, fullPage: false });

    console.log("\nDiscovery, as a member of the open team (Alice)");
    const aliceContext = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    await aliceContext.addCookies(cookiesFor(alice));
    const alicePage = await aliceContext.newPage();
    await alicePage.goto(`${BASE_URL}/sections`, { waitUntil: "networkidle" });

    check("her row reads as recruiting", await alicePage.getByText("Looking for more").first().isVisible());

    await alicePage.getByRole("button", { name: /L01/ }).click();
    await alicePage.waitForTimeout(300);
    const aliceBody = await alicePage.locator("main").innerText();
    // A two-person team deliberately keeps the pre-teams wording: this is the whole
    // point of formatTeamNoun, so pair-work users see no change.
    check("a pair still reads as 'Confirmed partner'", has(aliceBody, "Confirmed partner"), aliceBody.slice(0, 400));
    check("she can see her teammate's email", has(aliceBody, bob.email));
    check("she is offered the remaining solo classmate", has(aliceBody, "Verify uicara"));
    check("but not her own team as joinable", !has(aliceBody, "Ask to join"));

    console.log("\nSettings: team panel and controls");
    await alicePage.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
    const settingsBody = await alicePage.locator("main").innerText();
    check("settings shows the pair with the original wording", has(settingsBody, "Confirmed partner"), settingsBody.slice(0, 300));
    check("and the original Unmatch action", has(settingsBody, "Unmatch"));
    check("plus the new completion control", has(settingsBody, "Mark team complete"));
    check("and the row is badged as recruiting", has(settingsBody, "looking for more"));
    await alicePage.screenshot({ path: `${SCRATCH}/ui-settings-team.png`, fullPage: false });

    console.log("\nA third member switches the wording to team language");
    await db.teamMember.create({
      data: {
        sectionId: cara.sectionId,
        sectionKey: SECTION_KEY,
        teamId: team.id,
        userId: cara.userId,
      },
    });
    await alicePage.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
    const trioBody = await alicePage.locator("main").innerText();
    check("settings now says 'Your team of 3'", has(trioBody, "Your team of 3"), trioBody.slice(0, 400));
    check("and offers Leave team instead of Unmatch", has(trioBody, "Leave team"));
    check(
      "both teammates are listed",
      has(trioBody, "Verify uibob") && has(trioBody, "Verify uicara"),
    );

    await alicePage.goto(`${BASE_URL}/matches`, { waitUntil: "networkidle" });
    const trioMatches = await alicePage.locator("main").innerText();
    check("matches shows a Team of 3", has(trioMatches, "Team of 3"), trioMatches.slice(0, 300));
    check("badged as looking for more", has(trioMatches, "Looking for more"));

    console.log("\nThe completion toggle actually works from the UI");
    await alicePage.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
    await alicePage.getByRole("button", { name: "Mark team complete" }).click();
    await alicePage.waitForURL(/notice=team-completed/, { timeout: 15000 });
    const afterComplete = await db.team.findUnique({ where: { id: team.id } });
    check("the team is now complete in the database", afterComplete?.isComplete === true);
    check(
      "and the page confirms it",
      (await alicePage.locator("body").innerText()).includes("Team marked complete"),
    );

    console.log("\nThe post-accept prompt renders for a fresh pair");
    await alicePage.goto(`${BASE_URL}/matches?team=${team.id}`, { waitUntil: "networkidle" });
    const matchesBody = await alicePage.locator("main").innerText();
    check("the prompt offers to open the team", has(matchesBody, "We need more people"), matchesBody.slice(0, 300));
    check("the matches card names the teammate", has(matchesBody, "Verify uibob"));
    await alicePage.screenshot({ path: `${SCRATCH}/ui-matches-prompt.png`, fullPage: false });

    console.log("\nMobile width still works (390px)");
    const mobile = await browser.newContext({ viewport: { height: 844, width: 390 } });
    await mobile.addCookies(cookiesFor(cara));
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(`${BASE_URL}/sections`, { waitUntil: "networkidle" });
    check(
      "no horizontal overflow on a phone",
      (await mobilePage.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )) <= 0,
    );
    await mobilePage.screenshot({ path: `${SCRATCH}/ui-mobile-sections.png` });
  } finally {
    await browser.close();
  }

  console.log(`\\n${checks - failures}/${checks} checks passed.`);

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(() => {});
    await db.$disconnect();
  });
