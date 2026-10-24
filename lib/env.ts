import { z } from "zod";

const databaseEnvironment = z.object({ DATABASE_URL: z.string().min(1) });

const applicationEnvironment = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  FOODREC_STORAGE_DIR: z.string().min(1).optional()
}).refine(({ ADMIN_EMAIL, ADMIN_PASSWORD }) => Boolean(ADMIN_EMAIL) === Boolean(ADMIN_PASSWORD), {
  message: "ADMIN_EMAIL and ADMIN_PASSWORD must be configured together"
});

export function readDatabaseUrl() {
  return databaseEnvironment.parse(process.env).DATABASE_URL;
}

export function readApplicationEnvironment() {
  return applicationEnvironment.parse(process.env);
}
