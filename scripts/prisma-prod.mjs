// Run the Prisma CLI against DATABASE_URL_PROD from .env.
//   node scripts/prisma-prod.mjs db push
//   node scripts/prisma-prod.mjs studio
// Only ever points the CLI at prod; it never seeds, resets, or drops anything.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const env = { ...process.env };
try {
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in env)) env[m[1]] = v;
  }
} catch {}

if (!env.DATABASE_URL_PROD || env.DATABASE_URL_PROD.includes("user:pass@cluster")) {
  console.error("Set DATABASE_URL_PROD in .env to a real connection string first.");
  process.exit(1);
}
const args = process.argv.slice(2);
if (args.some((a) => /reset|seed/.test(a))) {
  console.error("Refusing: this helper never seeds or resets the production database.");
  process.exit(1);
}
env.DATABASE_URL = env.DATABASE_URL_PROD;
console.log(`prisma ${args.join(" ")} -> PROD (${env.DATABASE_URL.replace(/\/\/[^@]*@/, "//***@")})`);
const child = spawn(process.execPath, [resolve(root, "node_modules/prisma/build/index.js"), ...args], { cwd: root, stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
