import { z } from "zod";

export const profileDraftSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().endsWith("@mcmaster.ca"),
  program: z.string().trim().max(120).optional(),
  yearOfStudy: z.number().int().min(1).max(8).optional(),
  studyStyle: z.string().trim().max(160).optional(),
});

export type ProfileDraftInput = z.infer<typeof profileDraftSchema>;
