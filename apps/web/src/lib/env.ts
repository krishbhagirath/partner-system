import { z } from "zod";

const envSchema = z.object({
  AUTH_SECRET: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  SCRAPER_URL: z.string().url().optional(),
  WORKER_SECRET: z.string().min(1).optional(),
});

const parsedEnv = envSchema.safeParse({
  AUTH_SECRET: process.env.AUTH_SECRET,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  SCRAPER_URL: process.env.SCRAPER_URL,
  WORKER_SECRET: process.env.WORKER_SECRET,
});

if (!parsedEnv.success) {
  throw new Error(`Invalid environment variables: ${parsedEnv.error.message}`);
}

export const env = parsedEnv.data;

export function requireDatabaseUrl() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database operations.");
  }

  return env.DATABASE_URL;
}
