import "./env.js";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  PrismaClient,
  type ComponentType,
  type DayOfWeek,
  type ImportJobStatus,
} from "./generated/prisma/client.js";

export type WorkerJobStage =
  | "LOGGING_IN"
  | "NAVIGATING"
  | "SCRAPING"
  | "PARSING"
  | "SAVING"
  | "COMPLETED"
  | "FAILED";

export type SectionCreateInput = {
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

export type SaveSectionsResult = {
  received: number;
  duplicateInPayload: number;
  alreadyExisting: number;
  created: number;
};

export function requireEnv(name: "DATABASE_URL" | "WORKER_SECRET") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

const adapter = new PrismaPg({
  connectionString: requireEnv("DATABASE_URL"),
});

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

const importJobStatusByStage: Record<WorkerJobStage, ImportJobStatus> = {
  LOGGING_IN: "RUNNING",
  NAVIGATING: "RUNNING",
  SCRAPING: "RUNNING",
  PARSING: "RUNNING",
  SAVING: "RUNNING",
  COMPLETED: "SUCCEEDED",
  FAILED: "FAILED",
};

const terminalStages = new Set<WorkerJobStage>(["COMPLETED", "FAILED"]);

export async function updateJobStatus(
  jobId: string,
  stage: WorkerJobStage,
  errorMessage?: string,
) {
  const now = new Date();
  const status = importJobStatusByStage[stage];

  return prisma.importJob.update({
    data: {
      errorMessage: stage === "FAILED" ? (errorMessage ?? "Scrape failed.") : null,
      status,
      ...(stage === "LOGGING_IN" ? { startedAt: now, finishedAt: null } : {}),
      ...(terminalStages.has(stage) ? { finishedAt: now } : {}),
    },
    where: {
      id: jobId,
    },
  });
}

export async function saveSectionsForUser(
  userId: string,
  jobId: string,
  sections: SectionCreateInput[],
): Promise<SaveSectionsResult> {
  const uniqueSections = new Map<string, SectionCreateInput>();

  for (const section of sections) {
    const key = buildCourseSectionKey(section.courseCode, section.sectionCode);

    if (!uniqueSections.has(key)) {
      uniqueSections.set(key, section);
    }
  }

  const dedupedSections = [...uniqueSections.values()];
  const existingKeys = await findExistingCourseSectionKeys(userId, dedupedSections);
  const sectionsToCreate = dedupedSections.filter(
    (section) => !existingKeys.has(buildCourseSectionKey(section.courseCode, section.sectionCode)),
  );

  if (sectionsToCreate.length === 0) {
    return {
      received: sections.length,
      duplicateInPayload: sections.length - dedupedSections.length,
      alreadyExisting: existingKeys.size,
      created: 0,
    };
  }

  const created = await prisma.section.createMany({
    data: sectionsToCreate.map((section) => ({
      ...section,
      importJobId: jobId,
      userId,
    })),
    skipDuplicates: true,
  });

  return {
    received: sections.length,
    duplicateInPayload: sections.length - dedupedSections.length,
    alreadyExisting: existingKeys.size,
    created: created.count,
  };
}

export function disconnectDb() {
  return prisma.$disconnect();
}

function buildCourseSectionKey(courseCode: string, sectionCode: string) {
  return `${courseCode.trim().toUpperCase()}::${sectionCode.trim().toUpperCase()}`;
}

async function findExistingCourseSectionKeys(userId: string, sections: SectionCreateInput[]) {
  const keys = new Set<string>();
  const chunkSize = 100;

  for (let index = 0; index < sections.length; index += chunkSize) {
    const chunk = sections.slice(index, index + chunkSize);

    if (chunk.length === 0) {
      continue;
    }

    const existing = await prisma.section.findMany({
      select: {
        courseCode: true,
        sectionCode: true,
      },
      where: {
        OR: chunk.map((section) => ({
          courseCode: section.courseCode,
          sectionCode: section.sectionCode,
        })),
        userId,
      },
    });

    for (const section of existing) {
      keys.add(buildCourseSectionKey(section.courseCode, section.sectionCode));
    }
  }

  return keys;
}
