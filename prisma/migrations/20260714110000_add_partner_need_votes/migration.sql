-- Crowd-sourced "does this course need a partner?" signal, scoped to
-- course+component so votes pool across sections/terms.
CREATE TYPE "PartnerNeedResponse" AS ENUM ('YES', 'NO', 'UNSURE');

CREATE TABLE "PartnerNeedVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "response" "PartnerNeedResponse" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerNeedVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerNeedVote_userId_courseCode_componentType_key" ON "PartnerNeedVote"("userId", "courseCode", "componentType");

CREATE INDEX "PartnerNeedVote_courseCode_componentType_idx" ON "PartnerNeedVote"("courseCode", "componentType");

ALTER TABLE "PartnerNeedVote" ADD CONSTRAINT "PartnerNeedVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
