-- Variable-size teams. A team of two is what used to be an ACCEPTED
-- PartnerRequest, so this replaces the implicit "one accepted request = one
-- match" model without changing how requests are sent or answered.
--
-- Section identity is denormalized onto Team because Section rows are per-user
-- and there is no canonical section row to reference. `sectionKey` is the
-- `::`-joined identity tuple produced by buildSectionDiscoveryKey(), kept honest
-- between Team and TeamMember by a composite foreign key.
--
-- Longer term this wants a canonical SectionIdentity table that Section,
-- DiscoverableSection, PartnerRequest and Team all reference. sectionKey buys
-- most of that benefit without backfilling an id onto four existing tables.

CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- Exists only to give TeamMember's composite foreign key a unique target.
CREATE UNIQUE INDEX "Team_id_sectionKey_key" ON "Team"("id", "sectionKey");

CREATE INDEX "Team_sectionKey_isComplete_idx" ON "Team"("sectionKey", "isComplete");

CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- The core invariant, previously enforced only in application code inside a
-- Serializable transaction: a student is on at most one team per section.
CREATE UNIQUE INDEX "TeamMember_userId_sectionKey_key" ON "TeamMember"("userId", "sectionKey");

CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

CREATE INDEX "TeamMember_sectionId_idx" ON "TeamMember"("sectionId");

CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- Composite, not a plain teamId reference: this is what stops a member's
-- denormalized sectionKey from ever disagreeing with its team's, which would
-- silently defeat the uniqueness guarantee above.
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_sectionKey_fkey" FOREIGN KEY ("teamId", "sectionKey") REFERENCES "Team"("id", "sectionKey") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Which team a request is about. Set on accept to the team the request actually
-- produced, so the notification feed and post-accept deep links have a target.
ALTER TABLE "PartnerRequest" ADD COLUMN "targetTeamId" TEXT;

CREATE INDEX "PartnerRequest_targetTeamId_status_idx" ON "PartnerRequest"("targetTeamId", "status");

ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_targetTeamId_fkey" FOREIGN KEY ("targetTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS, matching 20260611000000_enable_rls_for_public_tables: enable, then revoke
-- from the Supabase browser-facing roles. No policies, same as the existing
-- files — the Prisma connection's owner role bypasses RLS.
--
-- PartnerNeedVote is included because 20260714110000_add_partner_need_votes
-- created it after that migration ran and never enabled RLS on it, leaving it
-- reachable by those roles. Closing that gap here rather than leaving it open.
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerNeedVote" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE "Team", "TeamMember", "PartnerNeedVote" FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END $$;

-- Data backfill (every ACCEPTED PartnerRequest -> a complete two-person team) is
-- deliberately NOT here. It runs as prisma/backfill-teams.ts, which imports
-- buildSectionDiscoveryKey() and calls it directly.
--
-- The reason: sectionKey embeds startTime.toISOString() on a TIME(0) column,
-- which JS renders as '1970-01-01T14:30:00.000Z'. Reproducing that byte-for-byte
-- with to_char() in SQL is possible but fragile, and a mismatch would not error
-- — it would quietly write teams that no lookup can ever find. Calling the real
-- function removes that failure mode entirely. The script is idempotent, so a
-- failed run is re-runnable against these (empty) tables.
