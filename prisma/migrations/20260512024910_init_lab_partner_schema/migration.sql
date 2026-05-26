-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('LAB', 'TUTORIAL');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "PartnerRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "importJobId" TEXT,
    "term" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "location" TEXT NOT NULL,
    "rawTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoverableSection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoverableSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerRequest" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "note" TEXT,
    "status" "PartnerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ImportJob_userId_status_idx" ON "ImportJob"("userId", "status");

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");

-- CreateIndex
CREATE INDEX "Section_userId_term_idx" ON "Section"("userId", "term");

-- CreateIndex
CREATE INDEX "Section_courseCode_term_componentType_idx" ON "Section"("courseCode", "term", "componentType");

-- CreateIndex
CREATE UNIQUE INDEX "Section_userId_term_courseCode_componentType_sectionCode_da_key" ON "Section"("userId", "term", "courseCode", "componentType", "sectionCode", "dayOfWeek", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "DiscoverableSection_sectionId_isActive_idx" ON "DiscoverableSection"("sectionId", "isActive");

-- CreateIndex
CREATE INDEX "DiscoverableSection_userId_isActive_idx" ON "DiscoverableSection"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverableSection_userId_sectionId_key" ON "DiscoverableSection"("userId", "sectionId");

-- CreateIndex
CREATE INDEX "PartnerRequest_receiverId_status_idx" ON "PartnerRequest"("receiverId", "status");

-- CreateIndex
CREATE INDEX "PartnerRequest_senderId_status_idx" ON "PartnerRequest"("senderId", "status");

-- CreateIndex
CREATE INDEX "PartnerRequest_sectionId_status_idx" ON "PartnerRequest"("sectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerRequest_senderId_receiverId_sectionId_key" ON "PartnerRequest"("senderId", "receiverId", "sectionId");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoverableSection" ADD CONSTRAINT "DiscoverableSection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoverableSection" ADD CONSTRAINT "DiscoverableSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRequest" ADD CONSTRAINT "PartnerRequest_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
