import "server-only";

import type { ComponentType, DayOfWeek, ImportJobStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export type SectionCreateInput = {
  importJobId?: string | null;
  term: string;
  courseCode: string;
  componentType: ComponentType;
  sectionCode: string;
  dayOfWeek: DayOfWeek;
  startTime: Date;
  endTime: Date;
  location: string;
  rawTitle?: string | null;
};

const terminalImportJobStatuses = new Set<ImportJobStatus>(["SUCCEEDED", "FAILED", "CANCELED"]);

export function createImportJob(userId: string) {
  return db.importJob.create({
    data: {
      userId,
    },
  });
}

export function getImportJobForUser(userId: string, jobId: string) {
  return db.importJob.findFirst({
    include: {
      _count: {
        select: {
          sections: true,
        },
      },
    },
    where: {
      id: jobId,
      userId,
    },
  });
}

export function updateImportJobStatus(
  jobId: string,
  status: ImportJobStatus,
  errorMessage?: string,
) {
  const now = new Date();

  return db.importJob.update({
    data: {
      status,
      ...(status === "RUNNING" ? { startedAt: now, finishedAt: null } : {}),
      ...(terminalImportJobStatuses.has(status) ? { finishedAt: now } : {}),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    },
    where: {
      id: jobId,
    },
  });
}

export function createSectionsForUser(userId: string, sections: SectionCreateInput[]) {
  return db.section.createMany({
    data: sections.map((section) => ({
      ...section,
      userId,
    })),
    skipDuplicates: true,
  });
}

export function listSectionsForUser(userId: string) {
  return db.section.findMany({
    orderBy: [
      { term: "asc" },
      { courseCode: "asc" },
      { componentType: "asc" },
      { sectionCode: "asc" },
      { dayOfWeek: "asc" },
      { startTime: "asc" },
    ],
    where: {
      userId,
    },
  });
}

export function toggleDiscoverableSection(
  userId: string,
  sectionId: string,
  isActive: boolean,
  note?: string | null,
) {
  const notePatch = note === undefined ? {} : { note };

  return db.discoverableSection.upsert({
    create: {
      isActive,
      note: note ?? null,
      sectionId,
      userId,
    },
    update: {
      isActive,
      ...notePatch,
    },
    where: {
      userId_sectionId: {
        sectionId,
        userId,
      },
    },
  });
}

export function createPartnerRequest(
  senderId: string,
  receiverId: string,
  sectionId: string,
  note?: string | null,
) {
  if (senderId === receiverId) {
    throw new Error("A user cannot create a partner request for themselves.");
  }

  return db.partnerRequest.create({
    data: {
      note: note ?? null,
      receiverId,
      sectionId,
      senderId,
    },
  });
}

export function getPartnerRequestsForUser(userId: string) {
  return db.partnerRequest.findMany({
    include: {
      receiver: true,
      section: true,
      sender: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
  });
}
