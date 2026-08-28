import { PrismaClient } from "@prisma/client";

// One database per environment. `next dev` (NODE_ENV=development) uses
// DATABASE_URL_DEV; `next build` / `next start` (NODE_ENV=production) uses
// DATABASE_URL_PROD. Plain DATABASE_URL is the fallback and what the Prisma
// CLI reads. Export the choice so scripts can build their own client the same way.
export function databaseUrl(): string {
  const prod = process.env.NODE_ENV === "production";
  const url = (prod ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL_DEV) || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(`No database URL: set ${prod ? "DATABASE_URL_PROD" : "DATABASE_URL_DEV"} (or DATABASE_URL) in .env`);
  }
  return url;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: databaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
