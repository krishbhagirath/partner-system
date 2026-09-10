/**
 * Verifies the two fixes:
 *   1. the sign-in rate limit can no longer be bypassed by rotating IP headers
 *   2. re-importing a semester preserves the courses you already had
 *
 *   npx tsx verify-security.ts     (dev server must be running)
 *
 * Needs the temporary /api/verify-sync-temp route to exercise syncSectionsForTerm, which
 * cannot be imported directly because lab-partner.ts is `server-only`.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "./apps/web/src/generated/prisma/client";
import { buildSectionDiscoveryKey } from "./apps/web/src/server/section-key";

const envPath =
  ["apps/web/.env.local", ".env.local"]
    .map((path) => resolve(process.cwd(), path))
    .find(existsSync) ?? "apps/web/.env.local";

config({ path: envPath });

const BASE_URL = "http://localhost:3000";
const PASSWORD = "verify-security-password-1";
const TERM = "2099 Winter";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
});

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  checks += 1;
  console.log(
    condition
      ? `  PASS  ${label}`
      : `  FAIL  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`,
  );

  if (!condition) {
    failures += 1;
  }
}

class HarnessMissing extends Error {}

function section(courseCode: string, sectionCode: string) {
  return {
    componentType: "LAB",
    courseCode,
    dayOfWeek: "MONDAY",
    endTime: "1970-01-01T17:20:00.000Z",
    location: "VERIFY 101",
    sectionCode,
    startTime: "1970-01-01T14:30:00.000Z",
    term: TERM,
  };
}

/** One sign-in attempt, with full control over the forwarded IP headers. */
async function attemptSignIn(email: string, password: string, ipHeaders: Record<string, string>) {
  const jar = new Map<string, string>();
  const absorb = (response: Response) => {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair?.indexOf("=") ?? -1;

      if (pair && index > 0) {
        jar.set(pair.slice(0, index), pair.slice(index + 1));
      }
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  const csrfResponse = await fetch(`${BASE_URL}/api/auth/csrf`, {
    headers: { ...ipHeaders, cookie: cookie() },
  });
  absorb(csrfResponse);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const response = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    body: new URLSearchParams({ csrfToken, email, password }),
    headers: { ...ipHeaders, "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
    method: "POST",
    redirect: "manual",
  });
  // The session cookie is set on the 302 itself, so it has to be absorbed here too.
  absorb(response);

  return { jar, location: response.headers.get("location") ?? "", status: response.status };
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { startsWith: "verify-security-" } } });
  await db.team.deleteMany({ where: { term: TERM } });
}

async function main() {
  await cleanup();

  const stamp = Date.now();
  const victimEmail = `verify-security-victim-${stamp}@mcmaster.ca`;
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const victim = await db.user.create({
    data: { email: victimEmail, name: "Verify victim", passwordHash },
  });

  console.log("1. Rotating IP headers no longer buys extra sign-in attempts");

  // Each attempt claims a brand-new IP, in every header an attacker could reach for.
  // Under the old code x-real-ip was trusted verbatim, so this loop would never block.
  const results: number[] = [];

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const spoofed = {
      "x-forwarded-for": `7.7.7.${attempt}`,
      "x-real-ip": `6.6.6.${attempt}`,
    };
    const result = await attemptSignIn(victimEmail, "wrong-password", spoofed);
    results.push(result.status);
  }

  const blocked = results.filter((status) => status === 429).length;
  check("repeated wrong passwords eventually get 429", blocked > 0, results);
  check(
    "the account locks after about 5 failures, not 7",
    results.slice(0, 5).every((status) => status !== 429) && results[5] === 429,
    results,
  );

  console.log("\n2. A spoofed x-real-ip alone cannot open a fresh bucket");
  const stillBlocked = await attemptSignIn(victimEmail, "wrong-password", {
    "x-real-ip": `1.2.3.${Math.floor(Math.random() * 200)}`,
  });
  check("still blocked from a brand-new spoofed IP", stillBlocked.status === 429, stillBlocked.status);

  console.log("\n3. The lockout is per account, not global");
  const bystanderEmail = `verify-security-bystander-${stamp}@mcmaster.ca`;
  await db.user.create({
    data: { email: bystanderEmail, name: "Verify bystander", passwordHash },
  });

  const bystander = await attemptSignIn(bystanderEmail, PASSWORD, {
    "x-forwarded-for": "9.9.9.9",
  });
  check(
    "an untargeted account can still sign in",
    bystander.status !== 429 && !bystander.location.includes("error"),
    { location: bystander.location, status: bystander.status },
  );

  console.log("\n4. Correct passwords do not burn the account budget");
  const freshEmail = `verify-security-fresh-${stamp}@mcmaster.ca`;
  await db.user.create({ data: { email: freshEmail, name: "Verify fresh", passwordHash } });

  const successes: number[] = [];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await attemptSignIn(freshEmail, PASSWORD, {
      "x-forwarded-for": `8.8.8.${attempt}`,
    });
    successes.push(result.status);
  }

  check(
    "eight correct sign-ins in a row all succeed",
    successes.every((status) => status !== 429),
    successes,
  );

  console.log("\n5. Re-import keeps the courses you already had");

  const importer = await db.user.create({
    data: {
      email: `verify-security-importer-${stamp}@mcmaster.ca`,
      name: "Verify importer",
      passwordHash,
    },
  });
  const importerSignIn = await attemptSignIn(
    `verify-security-importer-${stamp}@mcmaster.ca`,
    PASSWORD,
    { "x-forwarded-for": "5.5.5.5" },
  );
  const importerCookie = [...importerSignIn.jar].map(([k, v]) => `${k}=${v}`).join("; ");

  async function sync(sections: Array<Record<string, string>>) {
    const response = await fetch(`${BASE_URL}/api/verify-sync-temp`, {
      body: JSON.stringify({ sections, term: TERM }),
      headers: { "content-type": "application/json", cookie: importerCookie },
      method: "POST",
    });

    const text = await response.text();

    if (response.status === 404) {
      // The harness route is deliberately not committed; sections 1-4 stand alone.
      throw new HarnessMissing();
    }

    if (!response.ok) {
      throw new Error(`sync harness ${response.status}: ${text.slice(0, 300)}`);
    }

    return JSON.parse(text) as { added: number; kept: number; removed: number };
  }

  // First import: one course.
  const first = await sync([section("COMPENG 3DQ5", "L02")]);
  check("first import adds the course", first.added === 1 && first.removed === 0, first);

  const original = await db.section.findFirstOrThrow({
    where: { courseCode: "COMPENG 3DQ5", userId: importer.id },
  });

  // Attach the things that used to be destroyed by a re-import.
  await db.discoverableSection.create({
    data: { isActive: true, note: null, sectionId: original.id, userId: importer.id },
  });
  const teammate = await db.user.create({
    data: {
      email: `verify-security-teammate-${stamp}@mcmaster.ca`,
      name: "Verify teammate",
      passwordHash,
    },
  });
  const teammateSection = await db.section.create({
    data: {
      componentType: "LAB",
      courseCode: "COMPENG 3DQ5",
      dayOfWeek: "MONDAY",
      endTime: new Date("1970-01-01T17:20:00.000Z"),
      location: "VERIFY 101",
      sectionCode: "L02",
      startTime: new Date("1970-01-01T14:30:00.000Z"),
      term: TERM,
      userId: teammate.id,
    },
  });
  const sectionKey = buildSectionDiscoveryKey(original);
  const team = await db.team.create({
    data: {
      componentType: "LAB",
      courseCode: "COMPENG 3DQ5",
      dayOfWeek: "MONDAY",
      endTime: new Date("1970-01-01T17:20:00.000Z"),
      isComplete: true,
      sectionCode: "L02",
      sectionKey,
      startTime: new Date("1970-01-01T14:30:00.000Z"),
      term: TERM,
    },
  });
  await db.teamMember.createMany({
    data: [
      { sectionId: original.id, sectionKey, teamId: team.id, userId: importer.id },
      { sectionId: teammateSection.id, sectionKey, teamId: team.id, userId: teammate.id },
    ],
  });

  // Second import: the same course plus a newly added one — the exact scenario.
  const second = await sync([section("COMPENG 3DQ5", "L02"), section("STATS 2D03", "T05")]);
  check("re-import adds only the new course", second.added === 1, second);
  check("and keeps the one already there", second.kept === 1, second);
  check("and removes nothing", second.removed === 0, second);

  const afterReimport = await db.section.findFirst({
    where: { courseCode: "COMPENG 3DQ5", userId: importer.id },
  });
  check(
    "the original section row survives with the same id",
    afterReimport?.id === original.id,
    { after: afterReimport?.id, before: original.id },
  );
  check(
    "its discoverability survives",
    (await db.discoverableSection.count({ where: { sectionId: original.id } })) === 1,
  );
  check(
    "the team membership survives",
    (await db.teamMember.count({ where: { teamId: team.id } })) === 2,
  );
  check(
    "both courses are now present",
    (await db.section.count({ where: { term: TERM, userId: importer.id } })) === 2,
  );

  console.log("\n6. Dropping a course still removes it");
  const third = await sync([section("STATS 2D03", "T05")]);
  check("the dropped course is removed", third.removed === 1, third);
  check("the remaining one is kept", third.kept === 1, third);
  check(
    "and the team it belonged to is cleaned up",
    (await db.team.count({ where: { id: team.id } })) === 0,
  );

  console.log(`\n${checks - failures}/${checks} checks passed.`);

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    if (error instanceof HarnessMissing) {
      console.log(
        "\nSKIP  sections 5-6 (import sync): recreate /api/verify-sync-temp to run them.",
      );
      console.log(`\n${checks - failures}/${checks} checks passed.`);

      return;
    }

    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(() => {});
    await db.$disconnect();
  });
