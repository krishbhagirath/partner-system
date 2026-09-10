/**
 * Backfills the teams model from the pre-teams data: every ACCEPTED PartnerRequest
 * becomes a complete two-person Team.
 *
 * Run the read-only report first, then the write:
 *
 *   npx tsx prisma/backfill-teams.ts --check
 *   npx tsx prisma/backfill-teams.ts
 *
 * This is a script rather than SQL inside the migration on purpose. `sectionKey`
 * embeds `startTime.toISOString()` on a TIME(0) column, rendered as
 * `1970-01-01T14:30:00.000Z`. Reproducing that byte-for-byte with to_char() is
 * possible but fragile, and a mismatch would not raise an error — it would quietly
 * write teams that no lookup can ever find. Calling buildSectionDiscoveryKey()
 * directly removes that failure mode.
 *
 * Idempotent: a request whose participants already share a team for that section is
 * skipped, so a partial run can simply be re-run.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../apps/web/src/generated/prisma/client";
import { buildSectionDiscoveryKey } from "../apps/web/src/server/section-key";

const envPath =
  ["apps/web/.env.local", ".env.local"]
    .map((path) => resolve(process.cwd(), path))
    .find(existsSync) ?? "apps/web/.env.local";

config({ path: envPath });

const checkOnly = process.argv.includes("--check");

type Blocker = {
  reason: string;
  requestId: string;
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to backfill teams.");
  }

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    // Explicit select, not `include`: the regenerated client knows about
    // `targetTeamId`, but --check has to be runnable *before* the migration adds
    // that column, so the pre-flight must not reference it.
    const accepted = await db.partnerRequest.findMany({
      orderBy: {
        updatedAt: "asc",
      },
      select: {
        id: true,
        receiverId: true,
        section: true,
        sectionId: true,
        senderId: true,
        updatedAt: true,
      },
      where: {
        status: "ACCEPTED",
      },
    });

    console.log(`ACCEPTED partner requests: ${accepted.length}`);

    const blockers: Blocker[] = [];
    // sectionKey -> userId, so a second accepted match for the same person in the
    // same section is caught here instead of aborting on the unique index.
    const claimedBySectionKey = new Map<string, Set<string>>();
    const plans: Array<{
      requestId: string;
      sectionKey: string;
      members: Array<{ sectionId: string; userId: string }>;
      section: (typeof accepted)[number]["section"];
      joinedAt: Date;
    }> = [];

    for (const request of accepted) {
      const sectionKey = buildSectionDiscoveryKey(request.section);

      // The receiver owns a *different* Section row with the same seven identity
      // fields. If they re-imported or dropped the course, that row is gone and the
      // pair cannot become a team — a TeamMember needs its own sectionId.
      const receiverSection = await db.section.findFirst({
        where: {
          componentType: request.section.componentType,
          courseCode: request.section.courseCode,
          dayOfWeek: request.section.dayOfWeek,
          endTime: request.section.endTime,
          sectionCode: request.section.sectionCode,
          startTime: request.section.startTime,
          term: request.section.term,
          userId: request.receiverId,
        },
      });

      if (!receiverSection) {
        blockers.push({
          reason: "receiver has no Section row for this identity",
          requestId: request.id,
        });

        continue;
      }

      const claimed = claimedBySectionKey.get(sectionKey) ?? new Set<string>();

      if (claimed.has(request.senderId) || claimed.has(request.receiverId)) {
        blockers.push({
          reason: "participant already has an earlier team for this section",
          requestId: request.id,
        });

        continue;
      }

      claimed.add(request.senderId);
      claimed.add(request.receiverId);
      claimedBySectionKey.set(sectionKey, claimed);

      plans.push({
        joinedAt: request.updatedAt,
        members: [
          { sectionId: request.sectionId, userId: request.senderId },
          { sectionId: receiverSection.id, userId: request.receiverId },
        ],
        requestId: request.id,
        section: request.section,
        sectionKey,
      });
    }

    console.log(`Teams to create: ${plans.length}`);
    console.log(`Blocked requests: ${blockers.length}`);

    for (const blocker of blockers) {
      console.log(`  - ${blocker.requestId}: ${blocker.reason}`);
    }

    if (checkOnly) {
      console.log("\n--check: read-only, nothing written.");

      return;
    }

    let created = 0;
    let skipped = 0;

    for (const plan of plans) {
      const existing = await db.teamMember.findFirst({
        where: {
          sectionKey: plan.sectionKey,
          userId: { in: plan.members.map((member) => member.userId) },
        },
      });

      if (existing) {
        skipped += 1;

        continue;
      }

      await db.$transaction(async (tx) => {
        const team = await tx.team.create({
          data: {
            componentType: plan.section.componentType,
            courseCode: plan.section.courseCode,
            createdAt: plan.joinedAt,
            dayOfWeek: plan.section.dayOfWeek,
            endTime: plan.section.endTime,
            // Backfilled teams are complete: they are exactly the pairs that the
            // one-partner-per-section rule already produced.
            isComplete: true,
            sectionCode: plan.section.sectionCode,
            sectionKey: plan.sectionKey,
            startTime: plan.section.startTime,
            term: plan.section.term,
          },
        });

        await tx.teamMember.createMany({
          data: plan.members.map((member) => ({
            joinedAt: plan.joinedAt,
            sectionId: member.sectionId,
            sectionKey: plan.sectionKey,
            teamId: team.id,
            userId: member.userId,
          })),
        });

        // Gives the notification feed and post-accept deep links a target.
        await tx.partnerRequest.update({
          data: { targetTeamId: team.id },
          where: { id: plan.requestId },
        });
      });

      created += 1;
    }

    console.log(`\nCreated ${created} team(s), skipped ${skipped} already backfilled.`);

    await verify(db);
  } finally {
    await db.$disconnect();
  }
}

/**
 * The check that matters: recompute every stored sectionKey from its member's own
 * Section row and assert it matches. A to_char/toISOString drift would show up here
 * rather than as silently unreachable teams.
 */
async function verify(db: PrismaClient) {
  const members = await db.teamMember.findMany({
    include: { section: true, team: true },
  });

  const mismatched = members.filter(
    (member) => buildSectionDiscoveryKey(member.section) !== member.sectionKey,
  );

  const teams = await db.team.findMany({ include: { members: true } });
  const undersized = teams.filter((team) => team.members.length < 2);

  console.log(`Verify: ${members.length} membership(s), ${teams.length} team(s)`);
  console.log(`  sectionKey mismatches: ${mismatched.length}`);
  console.log(`  teams with fewer than 2 members: ${undersized.length}`);

  if (mismatched.length > 0 || undersized.length > 0) {
    throw new Error("Backfill verification failed — see counts above.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
