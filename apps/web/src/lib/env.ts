import "server-only";

import { z } from "zod";

const requiredInProduction = ["AUTH_SECRET", "DATABASE_URL"] as const;

const envSchema = z
  .object({
    AUTH_SECRET: z.string().min(1).optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url().optional(),
    DIRECT_URL: z.string().url().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    SCRAPER_URL: z.string().url().optional(),
    WORKER_SECRET: z.string().min(1).optional(),
    AUTH_MICROSOFT_ENTRA_ID_ID: z.string().min(1).optional(),
    AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).optional(),
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV !== "production") {
      return;
    }

    for (const name of requiredInProduction) {
      if (!values[name]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} is required in production.`,
          path: [name],
        });
      }
    }
  });

const parsedEnv = envSchema.safeParse({
  AUTH_SECRET: process.env.AUTH_SECRET,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  SCRAPER_URL: process.env.SCRAPER_URL,
  WORKER_SECRET: process.env.WORKER_SECRET,
  AUTH_MICROSOFT_ENTRA_ID_ID: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
  AUTH_MICROSOFT_ENTRA_ID_SECRET: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
});

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment variables: ${issues}`);
}

export const env = parsedEnv.data;

export function requireDatabaseUrl() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database operations.");
  }

  return env.DATABASE_URL;
}
