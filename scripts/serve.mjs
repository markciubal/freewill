// Start the dev or prod server with host/port from .env.
//   node scripts/serve.mjs dev    -> next dev   -H $DEV_HOST  -p $DEV_PORT
//   node scripts/serve.mjs start  -> next start -H $PROD_HOST -p $PROD_PORT
// .env is parsed here (KEY=VALUE, optional quotes, # comments) so this works on
// any Node and any OS; real environment variables always win over the file.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2] === "start" ? "start" : "dev";
const extra = process.argv.slice(3);

const root = resolve(import.meta.dirname, "..");
for (const file of [".env", `.env.${mode === "dev" ? "development" : "production"}`, ".env.local"]) {
  const p = resolve(root, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

const host = (mode === "dev" ? process.env.DEV_HOST : process.env.PROD_HOST) || "0.0.0.0";
const port = (mode === "dev" ? process.env.DEV_PORT : process.env.PROD_PORT) || process.env.PORT || "3000";
if (!/^\d{1,5}$/.test(port)) {
  console.error(`Bad port "${port}" (set ${mode === "dev" ? "DEV_PORT" : "PROD_PORT"} in .env)`);
  process.exit(1);
}

const next = resolve(root, "node_modules/next/dist/bin/next");
console.log(`freewill ${mode}: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
const child = spawn(process.execPath, [next, mode, "-H", host, "-p", port, ...extra], { cwd: root, stdio: "inherit", env: process.env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
