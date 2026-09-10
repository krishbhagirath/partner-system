/**
 * End-to-end verification for variable-size teams, driven over HTTP against a running
 * dev server exactly as a browser would drive it.
 *
 *   npx tsx verify-teams.ts            # full teams scenario (expects TEAMS_ENABLED = true)
 *   npx tsx verify-teams.ts --flag-off # pre-teams behaviour (expects TEAMS_ENABLED = false)
 *
 * Lives at the repo root because scripts outside it cannot resolve node_modules.
 * Creates four throwaway users against a fake course and deletes them at the end;
 * the delete cascades everything else away.
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

const BASE_URL = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const COURSE_CODE = "VERIFY 1AA3";
const TERM = "2099 Fall";
const PASSWORD = "verify-teams-password-1";
const FLAG_OFF = process.argv.includes("--flag-off");

const SECTION = {
  componentType: "LAB" as const,
  courseCode: COURSE_CODE,
  dayOfWeek: "MONDAY" as const,
  endTime: new Date("1970-01-01T17:20:00.000Z"),
  location: "VERIFY 101",
  sectionCode: "L01",
  startTime: new Date("1970-01-01T14:30:00.000Z"),
  term: TERM,
};

const SECTION_KEY = buildSectionDiscoveryKey(SECTION);

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
});

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  checks += 1;

  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  }
}

/** A signed-in browser session: holds cookies across requests. */
type Session = { cookies: Map<string, string>; email: string; ip: string; userId: string };

// The sign-in rate limit is keyed on client IP, and every request here comes from
// localhost, so seven sign-ins per run would collide across back-to-back runs. Give
// each fixture user its own synthetic forwarded IP so runs stay independent. This
// works locally because there is no proxy in front; on Vercel the platform overwrites
// x-forwarded-for, which is exactly what makes it trustworthy in production.
let ipCounter = 0;

function cookieHeader(session: Session) {
  return [...session.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function storeCookies(session: Session, response: Response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const index = pair?.indexOf("=") ?? -1;

    if (pair && index > 0) {
      session.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
}

async function request(session: Session, path: string, init?: RequestInit) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      cookie: cookieHeader(session),
      "x-forwarded-for": session.ip,
      ...(init?.headers ?? {}),
    },
    redirect: "manual",
  });

  storeCookies(session, response);

  return response;
}

async function signIn(email: string, userId: string): Promise<Session> {
  ipCounter += 1;
  const session: Session = { cookies: new Map(), email, ip: `10.9.0.${ipCounter}`, userId };

  const csrfResponse = await request(session, "/api/auth/csrf");
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const body = new URLSearchParams({ csrfToken, email, password: PASSWORD });
  const signInResponse = await request(session, "/api/auth/callback/credentials", {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  if (signInResponse.status !== 302 && signInResponse.status !== 200) {
    throw new Error(`Sign-in failed for ${email}: ${signInResponse.status}`);
  }

  return session;
}

async function createUser(label: string) {
  const email = `verify-teams-${label}-${Date.now()}@mcmaster.ca`;
  const user = await db.user.create({
    data: {
      email,
      name: `Verify ${label}`,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    },
  });

  const section = await db.section.create({
    data: { ...SECTION, userId: user.id },
  });

  await db.discoverableSection.create({
    data: { isActive: true, sectionId: section.id, userId: user.id },
  });

  return { email, sectionId: section.id, session: await signIn(email, user.id), userId: user.id };
}

type Student = Awaited<ReturnType<typeof createUser>>;

async function sendRequest(from: Student, to: Student) {
  const response = await request(from.session, "/api/partner-requests", {
    body: JSON.stringify({ receiverId: to.userId, sectionId: from.sectionId }),
    method: "POST",
  });

  return { body: await response.json().catch(() => null), status: response.status };
}

async function respond(actor: Student, requestId: string, status: "ACCEPTED" | "DECLINED") {
  const response = await request(actor.session, `/api/partner-requests/${requestId}`, {
    body: JSON.stringify({ status }),
    method: "PATCH",
  });

  return { body: await response.json().catch(() => null), status: response.status };
}

async function setCompletion(actor: Student, teamId: string, isComplete: boolean) {
  const response = await request(actor.session, `/api/teams/${teamId}`, {
    body: JSON.stringify({ isComplete }),
    method: "PATCH",
  });

  return { body: await response.json().catch(() => null), status: response.status };
}

async function leave(actor: Student, teamId: string) {
  const response = await request(actor.session, `/api/teams/${teamId}`, { method: "DELETE" });

  return { body: await response.json().catch(() => null), status: response.status };
}

async function pendingRequestIdFor(receiver: Student, sender: Student) {
  const found = await db.partnerRequest.findFirst({
    select: { id: true },
    where: { receiverId: receiver.userId, senderId: sender.userId, status: "PENDING" },
  });

  return found?.id ?? null;
}

async function teamOf(student: Student) {
  const membership = await db.teamMember.findUnique({
    select: { team: { select: { _count: { select: { members: true } }, id: true, isComplete: true } } },
    where: { userId_sectionKey: { sectionKey: SECTION_KEY, userId: student.userId } },
  });

  return membership?.team ?? null;
}

/**
 * The state badge on the collapsed /sections row, which is what the viewer actually
 * sees before expanding. Candidate cards are behind a click (client state), so they
 * are not in the server-rendered HTML — the badge is the honest server-side signal.
 * Scripts are stripped first because Next inlines the RSC flight payload, which would
 * otherwise match everything twice.
 */
async function discoveryBadge(student: Student) {
  const response = await request(student.session, "/sections");
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  // Anchored after the section-code heading so the stat cards at the top of the page
  // ("Matched sections", "Available classmates") cannot be mistaken for the row badge.
  const rowText = text.slice(text.indexOf(SECTION.sectionCode));
  const match = rowText.match(
    /(\d+ available|None yet|Matched|Team of \d+|Looking for more)/,
  );

  return match?.[1] ?? `(no badge found in: ${rowText.slice(0, 200)})`;
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { startsWith: "verify-teams-" } } });
  await db.team.deleteMany({ where: { sectionKey: SECTION_KEY } });
}

async function main() {
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Mode: ${FLAG_OFF ? "TEAMS_ENABLED = false (pre-teams behaviour)" : "teams enabled"}\n`);

  const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json());

  if (!health?.ok) {
    throw new Error("Dev server is not healthy — start it with `npm run dev`.");
  }

  await cleanup();

  const [alice, bob, cara, dan] = await Promise.all([
    createUser("alice"),
    createUser("bob"),
    createUser("cara"),
    createUser("dan"),
  ]);

  console.log("1. A pair forms and is born complete");
  const first = await sendRequest(alice, bob);
  check("A -> B request accepted by the API", first.status === 201, first);

  const firstId = await pendingRequestIdFor(bob, alice);
  const accepted = await respond(bob, firstId as string, "ACCEPTED");
  check("B accepts", accepted.status === 200, accepted);

  const aliceTeam = await teamOf(alice);
  check("a team now exists", aliceTeam !== null);
  check("with exactly two members", aliceTeam?._count.members === 2, aliceTeam);
  check("and it is born COMPLETE", aliceTeam?.isComplete === true, aliceTeam);
  check("B is on the same team", (await teamOf(bob))?.id === aliceTeam?.id);

  const acceptedRow = await db.partnerRequest.findUnique({ where: { id: firstId as string } });
  check("the accepted request records its team", acceptedRow?.targetTeamId === aliceTeam?.id);

  console.log("\n2. A complete team is closed to everyone");
  const blocked = await sendRequest(cara, alice);
  check("C -> A is refused with 409", blocked.status === 409, blocked);
  check(
    "and says the team is complete",
    typeof blocked.body?.error === "string" && blocked.body.error.includes("complete"),
    blocked.body,
  );

  // C should now see only D: A and B are on a complete team and drop out entirely.
  const caraBadge = await discoveryBadge(cara);
  check("C sees exactly one classmate (D), not the teamed pair", caraBadge === "1 available", caraBadge);

  console.log("\n3. Opening the team");
  const opened = await setCompletion(alice, aliceTeam?.id as string, false);

  if (FLAG_OFF) {
    check("opening is refused while the flag is off", opened.status === 404, opened);
    check("the team stays complete", (await teamOf(alice))?.isComplete === true);

    const stillHidden = await discoveryBadge(cara);
    check("C still sees only D", stillHidden === "1 available", stillHidden);

    console.log("\n4. Leaving a pair deletes the team (the old unmatch)");
    const left = await leave(alice, aliceTeam?.id as string);
    check("A leaves successfully", left.status === 200, left);
    check("the team is gone", (await teamOf(bob)) === null);

    const afterLeave = await discoveryBadge(cara);
    check("A and B both reappear in discovery", afterLeave === "3 available", afterLeave);
  } else {
    check("A opens the team", opened.status === 200, opened);
    check("the team is now open", (await teamOf(alice))?.isComplete === false);

    // One joinable team + D = two things to act on. If A and B were still being
    // listed as individuals this would read "3 available".
    const caraBadge2 = await discoveryBadge(cara);
    check("C sees the open team plus D, not four individuals", caraBadge2 === "2 available", caraBadge2);

    console.log("\n4. A third member joins the open team");
    const join = await sendRequest(cara, alice);
    check("C -> A ask-to-join is accepted", join.status === 201, join);

    const joinId = await pendingRequestIdFor(alice, cara);
    const joined = await respond(alice, joinId as string, "ACCEPTED");
    check("A admits C", joined.status === 200, joined);

    const grown = await teamOf(cara);
    check("the team now has three members", grown?._count.members === 3, grown);
    check("and is still open", grown?.isComplete === false, grown);
    check("it is the same team, not a new one", grown?.id === aliceTeam?.id);

    console.log("\n5. An open team does NOT sweep pending requests");
    const danAsk = await sendRequest(dan, alice);
    check("D can still ask to join", danAsk.status === 201, danAsk);
    const danRequestId = await pendingRequestIdFor(alice, dan);
    check("D's request is pending", danRequestId !== null);

    console.log("\n6. Marking complete runs the sweep");
    const completed = await setCompletion(bob, aliceTeam?.id as string, true);
    check("any member can complete the team (B, not the creator)", completed.status === 200, completed);

    const danRequestAfter = await db.partnerRequest.findUnique({
      where: { id: danRequestId as string },
    });
    check("D's pending request was canceled", danRequestAfter?.status === "CANCELED", danRequestAfter);

    const danBadge = await discoveryBadge(dan);
    check("the completed team drops out of D's discovery", danBadge === "None yet", danBadge);

    console.log("\n7. Leaving shrinks the team but does not delete it");
    const caraLeft = await leave(cara, aliceTeam?.id as string);
    check("C leaves", caraLeft.status === 200, caraLeft);
    check("the team survives with two", (await teamOf(alice))?._count.members === 2);
    check("C is off the team", (await teamOf(cara)) === null);
    check(
      "and the team was NOT auto-reopened",
      (await teamOf(alice))?.isComplete === true,
    );

    console.log("\n8. Leaving a pair deletes the team");
    const aliceLeft = await leave(alice, aliceTeam?.id as string);
    check("A leaves", aliceLeft.status === 200, aliceLeft);
    check("the team is deleted", (await teamOf(bob)) === null);

    const finalDan = await discoveryBadge(dan);
    check("A, B and C all reappear as solo classmates", finalDan === "3 available", finalDan);
  }

  console.log("\n9. Concurrency: one user cannot land on two teams at once");
  await cleanup();
  const [eve, fay, gus] = await Promise.all([
    createUser("eve"),
    createUser("fay"),
    createUser("gus"),
  ]);

  // Two people ask Eve at the same time; she accepts both simultaneously.
  await sendRequest(fay, eve);
  await sendRequest(gus, eve);
  const fayRequest = await pendingRequestIdFor(eve, fay);
  const gusRequest = await pendingRequestIdFor(eve, gus);

  const [resultA, resultB] = await Promise.all([
    respond(eve, fayRequest as string, "ACCEPTED"),
    respond(eve, gusRequest as string, "ACCEPTED"),
  ]);

  const statuses = [resultA.status, resultB.status].sort();
  check("exactly one accept wins", statuses[0] === 200, statuses);
  check("the other is a 409, not a 500", statuses[1] === 409, {
    resultA: resultA.status,
    resultB: resultB.status,
    bodyA: resultA.body,
    bodyB: resultB.body,
  });

  const eveMemberships = await db.teamMember.count({
    where: { sectionKey: SECTION_KEY, userId: eve.userId },
  });
  check("Eve is on exactly one team", eveMemberships === 1, { eveMemberships });

  console.log("\n10. Stored keys still round-trip");
  const members = await db.teamMember.findMany({ include: { section: true } });
  const mismatched = members.filter(
    (member) => buildSectionDiscoveryKey(member.section) !== member.sectionKey,
  );
  check("every stored sectionKey recomputes identically", mismatched.length === 0, {
    mismatched: mismatched.length,
  });

  const undersized = await db.team.findMany({
    include: { _count: { select: { members: true } } },
  });
  check(
    "no team anywhere has fewer than two members",
    undersized.every((team) => team._count.members >= 2),
    undersized.filter((team) => team._count.members < 2).map((team) => team.id),
  );

  console.log("\n11. Cleanup leaves nothing behind");
  await cleanup();
  const leftovers = await db.team.count({ where: { sectionKey: SECTION_KEY } });
  check("no orphan teams remain", leftovers === 0, { leftovers });

  console.log(`\n${checks - failures}/${checks} checks passed.`);

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
